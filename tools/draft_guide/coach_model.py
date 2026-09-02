"""Step 4: COACH-XX projected stat lines (32 teams).

Scheme rates (per _COACH_SQL definitions in tools/scoring/aggregate.py) from
NFL_Data 2024+2025 REG, blended 2025 x 0.75 + 2024 x 0.25:
  pa_rate, motion_rate         per dropback -> x projected 2026 dropbacks
  fourth_down, run_2nd_long,   per game     -> x 17
  deep_2nd_short

2026 dropbacks/game = projected plays/game x projected pass rate (owner's
Projections_Research CSVs; pass_rate == dropbacks/plays, verified vs Team_Data).

Teams whose primary playcaller changed for 2026 (coaching_current vs the 2025
coaching table) get every scheme rate shrunk 50% toward the league mean and a
new_staff flag for the guide.

Wins: Pythagorean (exp 2.37) from projected points for (sheet player TDs + K
tab FG/XP, rescaled so the league PF mean matches the DST tab's PA mean) vs the
owner's Preseason_DST_Projections points allowed. exp30 = 17 x P(game >= 30)
under a normal approx with sigma fit on 2021-2025 games_schedule; the +3 bonus
is added after scoring (a per-game average line can never cross the threshold).

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.coach_model
Out:  out/coach_stat_lines.csv
"""

from __future__ import annotations

import math
import os
import sys

import pandas as pd
import psycopg2

from . import config

SEASON_W = {2025: 0.75, 2024: 0.25}
NEW_STAFF_SHRINK = 0.5
PYTH_EXP = 2.37

_COACH_SEASON_SQL = """
WITH plays AS (
  SELECT pl.*, b.pap, b.motion, b.primary_concept, b.depth_target
  FROM pbp pl LEFT JOIN base b ON b.play_id = pl.play_id
  WHERE pl.no_play = 0 AND pl.season = %(season)s AND pl.seas_type = 'REG'
)
SELECT
  offense AS team,
  COUNT(DISTINCT week)                                            AS games,
  SUM(COALESCE(dropback, 0))                                      AS dropbacks,
  SUM(CASE WHEN dropback = 1 AND pap = 1 THEN 1 ELSE 0 END)       AS pa_dropbacks,
  SUM(CASE WHEN dropback = 1
            AND TRIM(COALESCE(motion, '')) IN ('PS','DS','B','SH')
           THEN 1 ELSE 0 END)                                     AS motion_dropbacks,
  SUM(CASE WHEN down = 4
            AND (dropback = 1 OR runner_id IS NOT NULL)
            AND COALESCE(primary_concept, '') <> 'Kneel'
           THEN 1 ELSE 0 END)                                     AS fourth_down_attempts,
  SUM(CASE WHEN down = 2 AND COALESCE(distance, 0) >= 7
            AND runner_id IS NOT NULL AND COALESCE(scramble, 0) = 0
            AND COALESCE(primary_concept, '') <> 'Kneel'
           THEN 1 ELSE 0 END)                                     AS run_2nd_long,
  SUM(CASE WHEN down = 2 AND distance BETWEEN 1 AND 2
            AND COALESCE(attempt, 0) = 1
            AND COALESCE(depth_target, 0) >= 15
           THEN 1 ELSE 0 END)                                     AS deep_2nd_short
FROM plays
WHERE offense IS NOT NULL
GROUP BY offense
"""

_PLAYCALLER_2025_SQL = """
SELECT DISTINCT ON (team) team, coach_name
FROM coaching
WHERE season = 2025 AND role = 'PC'
ORDER BY team, week DESC
"""

_SIGMA_SQL = """
WITH tg AS (
  SELECT season, home_team AS team, home_score AS pts FROM games_schedule
  WHERE season BETWEEN 2021 AND 2025 AND game_type = 'REG' AND home_score IS NOT NULL
  UNION ALL
  SELECT season, away_team, away_score FROM games_schedule
  WHERE season BETWEEN 2021 AND 2025 AND game_type = 'REG' AND away_score IS NOT NULL
)
SELECT AVG(sd) FROM (
  SELECT STDDEV_SAMP(pts) AS sd FROM tg GROUP BY season, team
) x
"""

RATE_COLS = ["pa_rate", "motion_rate", "fourth_g", "run2nd_g", "deep2nd_g"]


def _read(conn, sql: str, params: dict | None = None) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(sql, params or {})
        cols = [d[0] for d in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)


def scheme_rates(conn) -> pd.DataFrame:
    frames = []
    for season, w in SEASON_W.items():
        df = _read(conn, _COACH_SEASON_SQL, {"season": season})
        num = [c for c in df.columns if c != "team"]
        df[num] = df[num].astype(float) * w
        frames.append(df)
    t = pd.concat(frames).groupby("team", as_index=False).sum()
    t["pa_rate"] = t["pa_dropbacks"] / t["dropbacks"]
    t["motion_rate"] = t["motion_dropbacks"] / t["dropbacks"]
    t["fourth_g"] = t["fourth_down_attempts"] / t["games"]
    t["run2nd_g"] = t["run_2nd_long"] / t["games"]
    t["deep2nd_g"] = t["deep_2nd_short"] / t["games"]
    t["db_g_hist"] = t["dropbacks"] / t["games"]
    return t


def staff_changes(conn) -> pd.DataFrame:
    pc25 = _read(conn, _PLAYCALLER_2025_SQL).rename(columns={"coach_name": "pc_2025"})
    cur = _read(conn, "SELECT team, hc, primary_playcaller FROM coaching_current WHERE season = 2026")
    m = cur.merge(pc25, on="team", how="left")
    m["new_staff"] = (m["primary_playcaller"].str.strip() != m["pc_2025"].str.strip()).fillna(True)
    return m


def points_for(sheet_dir: str) -> pd.DataFrame:
    pp = pd.read_csv(os.path.join(sheet_dir, "sheet_player_projections.csv"))
    pp.columns = [c.strip() for c in pp.columns]
    for c in ("Des RuTD", "Scrm TDs", "QBSNK TD", "Rec TD"):
        pp[c] = pd.to_numeric(pp[c], errors="coerce").fillna(0.0)
    pp = pp[pp["Team"].astype(str).str.len() > 0]
    td = pp.groupby("Team")[["Des RuTD", "Scrm TDs", "QBSNK TD", "Rec TD"]].sum().sum(axis=1)

    k = pd.read_csv(os.path.join(sheet_dir, "sheet_k_proj.csv"), header=1)
    k.columns = [str(c).strip() for c in k.columns]
    # Header row repeats "MISS": first is XP miss, second is FG miss. Use XP + FG.
    k = k[k["Team"].notna()]
    kpts = (pd.to_numeric(k["XP"], errors="coerce").fillna(0.0)
            + 3.0 * pd.to_numeric(k["FG"], errors="coerce").fillna(0.0))
    kicking = pd.Series(kpts.values, index=k["Team"].astype(str).str.strip()).groupby(level=0).sum()

    pf = (6.0 * td).add(kicking, fill_value=0.0).rename("pf").reset_index()
    pf.columns = ["team", "pf"]
    return pf


def points_allowed(sheet_dir: str) -> pd.DataFrame:
    d = pd.read_csv(os.path.join(sheet_dir, "sheet_dst_proj.csv"), header=1)
    d.columns = [str(c).strip() for c in d.columns]
    pa_col = next(c for c in d.columns if c.startswith("Pts Allowed"))
    d = d[d["Team"].notna()]
    out = pd.DataFrame({
        "team": d["Team"].astype(str).str.strip(),
        "pa": pd.to_numeric(d[pa_col], errors="coerce") * 17.0,
    })
    return out.dropna()


def volume_2026() -> pd.DataFrame:
    plays = pd.read_csv(config.TEAM_PLAYS_CSV)[["team", "projected_plays_per_game"]]
    rate = pd.read_csv(config.TEAM_PASS_RATE_CSV)[["team", "projected_pass_rate"]]
    v = plays.merge(rate, on="team")
    v["db_g"] = v["projected_plays_per_game"] * v["projected_pass_rate"]
    return v[["team", "db_g"]]


def main() -> None:
    conn = psycopg2.connect(config.nfl_data_dsn())
    conn.set_session(readonly=True)
    rates = scheme_rates(conn)
    staff = staff_changes(conn)
    sigma = float(_read(conn, _SIGMA_SQL).iloc[0, 0])
    conn.close()

    t = rates.merge(staff, on="team", how="left").merge(volume_2026(), on="team", how="left")
    t["db_g"] = t["db_g"].fillna(t["db_g_hist"])

    means = {c: t[c].mean() for c in RATE_COLS}
    for c in RATE_COLS:
        t.loc[t["new_staff"], c] = (
            (1 - NEW_STAFF_SHRINK) * t.loc[t["new_staff"], c] + NEW_STAFF_SHRINK * means[c]
        )

    pf = points_for(config.OUT_DIR)
    pa = points_allowed(config.OUT_DIR)
    t = t.merge(pf, on="team", how="left").merge(pa, on="team", how="left")
    # Rescale PF so the league means match (player TDs + kicking undercounts
    # 2pt/defensive scores; relative differences are what we trust).
    t["pf"] *= t["pa"].mean() / t["pf"].mean()
    t["wins"] = 17.0 * t["pf"] ** PYTH_EXP / (t["pf"] ** PYTH_EXP + t["pa"] ** PYTH_EXP)
    ppg = t["pf"] / 17.0
    t["exp30"] = 17.0 * ppg.apply(lambda m: 1.0 - 0.5 * (1 + math.erf((30.0 - m) / (sigma * math.sqrt(2)))))

    out = pd.DataFrame({
        "gsisId": "COACH-" + t["team"],
        "name": t["team"] + " Coaching Staff",
        "position": "COACH",
        "team": t["team"],
        "games": 17,
        "paDropbacks": t["pa_rate"] * t["db_g"] * 17.0,
        "motionDropbacks": t["motion_rate"] * t["db_g"] * 17.0,
        "fourthDownAttempts": t["fourth_g"] * 17.0,
        "run2ndLong": t["run2nd_g"] * 17.0,
        "deep2ndShort": t["deep2nd_g"] * 17.0,
        "teamWin": t["wins"],
        "exp30": t["exp30"],
        # context for the guide
        "ctx_pa_rate": t["pa_rate"],
        "ctx_motion_rate": t["motion_rate"],
        "ctx_db_g": t["db_g"],
        "ctx_pf_g": ppg,
        "ctx_pa_g": t["pa"] / 17.0,
        "ctx_new_staff": t["new_staff"],
        "ctx_playcaller": t["primary_playcaller"],
    })
    os.makedirs(config.OUT_DIR, exist_ok=True)
    out.to_csv(os.path.join(config.OUT_DIR, "coach_stat_lines.csv"), index=False)
    print(f"coach_stat_lines.csv: {len(out)} teams | sigma={sigma:.2f} | "
          f"wins {out['teamWin'].min():.1f}-{out['teamWin'].max():.1f} | "
          f"new staff: {int(out['ctx_new_staff'].sum())}")
    print(out[["team", "paDropbacks", "motionDropbacks", "fourthDownAttempts",
               "run2ndLong", "deep2ndShort", "teamWin", "exp30", "ctx_new_staff"]]
          .round(1).to_string(index=False))


if __name__ == "__main__":
    sys.exit(main())
