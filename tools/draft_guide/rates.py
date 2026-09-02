"""Step 2: per-player advanced-stat rates from NFL_Data (2024+2025 REG, read-only).

The league's custom scoring is all charting stats, so every scoring component is
modeled as a rate on a volume the season sheet projects:

  QB   (per dropback):  accurate, catchable, hero, turnover-worthy throws;
                        incompletions; sacks taken
  RB   (per att/rec):   MTF per touch, rush/rec YACO per att/rec,
                        explosive rush (10+) per att, explosive rec (15+) per rec
  WR/TE (per route/tgt): separation-grade shares per route; Re1D, hero catches,
                        drops, first-read targets per target

Stat definitions are copied from tools/scoring/aggregate.py so historical rates
match exactly what the pipeline pushes weekly. Rates are computed for EVERY
player (scope limits which ones score); shrinkage is toward the position mean
with per-stat pseudo-sample sizes K (rate_hat = (num + K*mean)/(den + K)).

Seasons blend 2025 x 0.65 + 2024 x 0.35 on numerators AND denominators.

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.rates
Out:  out/player_rates.csv
"""

from __future__ import annotations

import os
import sys

import pandas as pd
import psycopg2

from . import config

SEASONS = {2025: 0.65, 2024: 0.35}

# Per-stat shrinkage pseudo-samples (units of the denominator).
K = {
    # QB, per dropback
    "acc": 200, "catch": 200, "hero": 300, "tw": 300, "inc": 200, "sack": 250,
    # RB-ish
    "mtf_touch": 150, "rush_yaco": 150, "rec_yaco": 50, "rush_exp": 150, "rec_exp": 50,
    # receiving, per target
    "rec_fd": 100, "hero_catch": 200, "drop": 100, "first_read": 80,
    # separation shares, per route
    "sep": 300,
}

_QB_SQL = """
WITH plays AS (
  SELECT * FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND seas_type = 'REG'
)
SELECT pl.passer_id AS gsis_id,
       SUM(COALESCE(pl.dropback, 0))                                    AS dropbacks,
       SUM(CASE WHEN pa.acc IN ('ACC','BOD','AWY') THEN 1 ELSE 0 END)   AS accurate_throws,
       SUM(COALESCE(pa.catchable, 0))                                   AS catchable_throws,
       SUM(COALESCE(pa.wow_throw, 0))                                   AS hero_throws,
       SUM(COALESCE(pa.to_worthy, 0))                                   AS to_worthy_throws,
       SUM(CASE WHEN COALESCE(pl.attempt, 0) = 1 AND COALESCE(pl.reception, 0) = 0
                THEN 1 ELSE 0 END)                                      AS incompletions,
       SUM(CASE WHEN pl.sack = 1 OR pl.half_sack = 1 THEN 1 ELSE 0 END) AS sacks_taken
FROM plays pl
LEFT JOIN pass pa ON pa.play_id = pl.play_id
WHERE pl.passer_id IS NOT NULL
GROUP BY pl.passer_id
"""

_RUSH_SQL = """
WITH plays AS (
  SELECT * FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND seas_type = 'REG'
)
SELECT pl.runner_id AS gsis_id,
       SUM(CASE WHEN COALESCE(b.primary_concept, '') <> 'Kneel' THEN 1 ELSE 0 END) AS rush_att,
       SUM(COALESCE(b.mtf, 0))  AS rush_mtf,
       SUM(COALESCE(b.yaco, 0)) AS rush_yaco,
       SUM(CASE WHEN COALESCE(pl.rushing_yards, 0) >= 10 THEN 1 ELSE 0 END) AS rush_explosive10
FROM plays pl
LEFT JOIN base b ON b.play_id = pl.play_id
WHERE pl.runner_id IS NOT NULL
GROUP BY pl.runner_id
"""

_REC_SQL = """
WITH plays AS (
  SELECT * FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND seas_type = 'REG'
)
SELECT pl.receiver_id AS gsis_id,
       SUM(COALESCE(pl.target, 0))    AS targets,
       SUM(COALESCE(pl.reception, 0)) AS receptions,
       SUM(CASE WHEN pl.reception = 1 THEN COALESCE(b.mtf, 0) ELSE 0 END)  AS rec_mtf,
       SUM(CASE WHEN pl.reception = 1 THEN COALESCE(b.yaco, 0) ELSE 0 END) AS rec_yaco,
       SUM(CASE WHEN pl.reception = 1 AND COALESCE(pl.rec_yards, 0) >= 15 THEN 1 ELSE 0 END) AS rec_explosive,
       SUM(CASE WHEN pl.reception = 1 AND pl.first_down = 1 THEN 1 ELSE 0 END) AS rec_fd,
       SUM(CASE WHEN pl.target = 1 AND pa."read" = '1' THEN 1 ELSE 0 END)  AS first_read_targets,
       SUM(CASE WHEN pa.inc_type = 'DP' THEN 1 ELSE 0 END)                 AS drops,
       SUM(COALESCE(pa.highlight_catch, 0))                                AS hero_catches
FROM plays pl
LEFT JOIN pass pa ON pa.play_id = pl.play_id
LEFT JOIN base b  ON b.play_id  = pl.play_id
WHERE pl.receiver_id IS NOT NULL
GROUP BY pl.receiver_id
"""

_ROUTES_SQL = """
WITH plays AS (
  SELECT play_id FROM pbp
  WHERE no_play = 0 AND season = %(season)s AND seas_type = 'REG'
)
SELECT pid AS gsis_id, COUNT(*) AS routes,
       SUM(CASE WHEN sep = -2 THEN 1 ELSE 0 END) AS sep_m2,
       SUM(CASE WHEN sep = -1 THEN 1 ELSE 0 END) AS sep_m1,
       SUM(CASE WHEN sep = 1  THEN 1 ELSE 0 END) AS sep_p1,
       SUM(CASE WHEN sep = 2  THEN 1 ELSE 0 END) AS sep_p2,
       SUM(CASE WHEN sep = 3  THEN 1 ELSE 0 END) AS sep_p3,
       SUM(CASE WHEN sep = 4  THEN 1 ELSE 0 END) AS sep_p4
FROM (
  SELECT pp.skp1_id AS pid, pp.skp1_sep AS sep, pp.skp1_role AS role, pp.play_id FROM pp
  UNION ALL SELECT pp.skp2_id, pp.skp2_sep, pp.skp2_role, pp.play_id FROM pp
  UNION ALL SELECT pp.skp3_id, pp.skp3_sep, pp.skp3_role, pp.play_id FROM pp
  UNION ALL SELECT pp.skp4_id, pp.skp4_sep, pp.skp4_role, pp.play_id FROM pp
  UNION ALL SELECT pp.skp5_id, pp.skp5_sep, pp.skp5_role, pp.play_id FROM pp
) r
JOIN plays pl ON pl.play_id = r.play_id
WHERE r.pid IS NOT NULL AND r.role IN ('RTE', 'FRTE')
GROUP BY pid
"""

_POS_SQL = """
SELECT DISTINCT ON (gsis_id) gsis_id, position, current_team AS team
FROM weekly_rosters
WHERE season = %(season)s
ORDER BY gsis_id, week DESC, seasontype
"""


def _read(conn, sql: str, season: int) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(sql, {"season": season})
        cols = [d[0] for d in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)


def weighted_totals(conn) -> pd.DataFrame:
    """One row per player: season-weighted numerators + denominators."""
    frames = []
    for sql in (_QB_SQL, _RUSH_SQL, _REC_SQL, _ROUTES_SQL):
        per_season = []
        for season, w in SEASONS.items():
            df = _read(conn, sql, season)
            num_cols = [c for c in df.columns if c != "gsis_id"]
            df[num_cols] = df[num_cols].astype(float) * w
            per_season.append(df)
        merged = pd.concat(per_season).groupby("gsis_id", as_index=False).sum()
        frames.append(merged)
    out = frames[0]
    for f in frames[1:]:
        out = out.merge(f, on="gsis_id", how="outer")
    out = out.fillna(0.0)

    pos25 = _read(conn, _POS_SQL, 2025)
    pos24 = _read(conn, _POS_SQL, 2024)
    pos = pd.concat([pos25, pos24]).drop_duplicates("gsis_id", keep="first")
    out = out.merge(pos, on="gsis_id", how="left")
    out["team_2025"] = out["team"]
    return out


# (rate name, numerator col, denominator col, K key)
RATE_DEFS = [
    ("r_acc",        "accurate_throws",    "dropbacks", "acc"),
    ("r_catch",      "catchable_throws",   "dropbacks", "catch"),
    ("r_hero",       "hero_throws",        "dropbacks", "hero"),
    ("r_tw",         "to_worthy_throws",   "dropbacks", "tw"),
    ("r_inc",        "incompletions",      "dropbacks", "inc"),
    ("r_sack",       "sacks_taken",        "dropbacks", "sack"),
    ("r_rush_mtf",   "rush_mtf",           "rush_att",  "mtf_touch"),
    ("r_rec_mtf",    "rec_mtf",            "receptions", "mtf_touch"),
    ("r_rush_yaco",  "rush_yaco",          "rush_att",  "rush_yaco"),
    ("r_rec_yaco",   "rec_yaco",           "receptions", "rec_yaco"),
    ("r_rush_exp",   "rush_explosive10",   "rush_att",  "rush_exp"),
    ("r_rec_exp",    "rec_explosive",      "receptions", "rec_exp"),
    ("r_rec_fd",     "rec_fd",             "targets",   "rec_fd"),
    ("r_hero_catch", "hero_catches",       "targets",   "hero_catch"),
    ("r_drop",       "drops",              "targets",   "drop"),
    ("r_first_read", "first_read_targets", "targets",   "first_read"),
    ("r_sep_m2",     "sep_m2",             "routes",    "sep"),
    ("r_sep_m1",     "sep_m1",             "routes",    "sep"),
    ("r_sep_p1",     "sep_p1",             "routes",    "sep"),
    ("r_sep_p2",     "sep_p2",             "routes",    "sep"),
    ("r_sep_p3",     "sep_p3",             "routes",    "sep"),
    ("r_sep_p4",     "sep_p4",             "routes",    "sep"),
]

QB_RATES = {"r_acc", "r_catch", "r_hero", "r_tw", "r_inc", "r_sack"}


def position_means(df: pd.DataFrame) -> pd.DataFrame:
    """Volume-weighted mean rate per position (the shrink targets + rookie fallback)."""
    rows = []
    for pos, grp in df.groupby("position"):
        row: dict[str, object] = {"position": pos}
        for name, num, den, _ in RATE_DEFS:
            d = grp[den].sum()
            row[f"mean_{name}"] = grp[num].sum() / d if d > 0 else 0.0
        rows.append(row)
    return pd.DataFrame(rows)


def shrunk_rates(df: pd.DataFrame, means: pd.DataFrame) -> pd.DataFrame:
    out = df[["gsis_id", "position", "team_2025"]].copy()
    m = df.merge(means, on="position", how="left")
    for name, num, den, kk in RATE_DEFS:
        mean = m[f"mean_{name}"].fillna(0.0)
        k = K[kk]
        out[name] = (m[num] + k * mean) / (m[den] + k)
        out[f"{name}_den"] = m[den]
    # Raw sample sizes for the guide / debugging.
    for den in ("dropbacks", "rush_att", "receptions", "targets", "routes"):
        out[f"n_{den}"] = df[den]
    return out


def main() -> None:
    conn = psycopg2.connect(config.nfl_data_dsn())
    conn.set_session(readonly=True)
    totals = weighted_totals(conn)
    conn.close()

    means = position_means(totals[totals["position"].isin(["QB", "RB", "WR", "TE"])])
    rates = shrunk_rates(totals, means)

    os.makedirs(config.OUT_DIR, exist_ok=True)
    rates.to_csv(os.path.join(config.OUT_DIR, "player_rates.csv"), index=False)
    means.to_csv(os.path.join(config.OUT_DIR, "position_means.csv"), index=False)
    print(f"player_rates.csv: {len(rates)} players")
    print(means.round(4).to_string(index=False))


if __name__ == "__main__":
    sys.exit(main())
