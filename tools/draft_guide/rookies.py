"""Step 3: rookie rate priors by position x draft capital.

2026 rookies have no NFL charting history, so their advanced-stat rates come
from how 2021-2025 rookies at similar draft capital performed AS ROOKIES:

  1. Identify each 2021-2025 rookie class (skill_position_draft_reference +
     qb_draft_reference, gsis-matched rows).
  2. Aggregate each player's ROOKIE-YEAR charting stats (same SQL as rates.py).
  3. Volume-weighted mean rates per (position, capital bucket); buckets with a
     thin sample fall back to the all-rookie position mean.
  4. Map the 2026 class (nflverse roster_2026.csv: entry_year/draft_number,
     cached in out/) to buckets.

Buckets: QB top-10 / rest of R1-R2 (pick 11-64) / day-3+ (65+);
RB/WR/TE R1 / R2-R3 (33-105) / R4+ (106+, incl. undrafted).

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.rookies
Out:  out/rookie_priors.csv, out/rookie_2026.csv
"""

from __future__ import annotations

import os
import sys

import pandas as pd
import psycopg2

from . import config
from .rates import RATE_DEFS, _QB_SQL, _RUSH_SQL, _REC_SQL, _ROUTES_SQL, _read

CLASS_SEASONS = [2021, 2022, 2023, 2024, 2025]
ROSTER_URL = "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv"
# Minimum blended denominator for a bucket's own rate to stand on its own.
MIN_DEN = 150.0

# skill_position_draft_reference covers QB/RB/WR/TE; qb_draft_reference only
# duplicates first-round QBs, so it isn't needed here.
_ROOKIE_CLASS_SQL = """
SELECT gsis_id, position, draft_year, overall_pick
FROM skill_position_draft_reference
WHERE draft_year = ANY(%(years)s) AND gsis_id IS NOT NULL
"""


def bucket_for(position: str, overall_pick: float | None) -> str:
    p = 999 if overall_pick is None or pd.isna(overall_pick) else float(overall_pick)
    if position == "QB":
        return "top10" if p <= 10 else "r1r2" if p <= 64 else "day3"
    return "r1" if p <= 32 else "r2r3" if p <= 105 else "r4plus"


def rookie_year_totals(conn, classes: pd.DataFrame) -> pd.DataFrame:
    """Each rookie's stat totals from their draft season only."""
    frames = []
    for season in CLASS_SEASONS:
        ids = set(classes.loc[classes["draft_year"] == season, "gsis_id"])
        if not ids:
            continue
        season_frames = []
        for sql in (_QB_SQL, _RUSH_SQL, _REC_SQL, _ROUTES_SQL):
            df = _read(conn, sql, season)
            season_frames.append(df[df["gsis_id"].isin(ids)])
        merged = season_frames[0]
        for f in season_frames[1:]:
            merged = merged.merge(f, on="gsis_id", how="outer")
        frames.append(merged.fillna(0.0))
    out = pd.concat(frames, ignore_index=True)
    return out.merge(classes[["gsis_id", "position", "overall_pick"]], on="gsis_id", how="left")


def bucket_priors(totals: pd.DataFrame) -> pd.DataFrame:
    totals = totals.copy()
    totals["bucket"] = [bucket_for(p, o) for p, o in zip(totals["position"], totals["overall_pick"])]
    rows = []
    for (pos, bucket), grp in totals.groupby(["position", "bucket"]):
        row: dict[str, object] = {"position": pos, "bucket": bucket, "n_players": len(grp)}
        pos_grp = totals[totals["position"] == pos]
        for name, num, den, _ in RATE_DEFS:
            d = grp[den].sum()
            pos_d = pos_grp[den].sum()
            pos_mean = pos_grp[num].sum() / pos_d if pos_d > 0 else 0.0
            row[name] = grp[num].sum() / d if d >= MIN_DEN else pos_mean
            row[f"{name}_den"] = d
        rows.append(row)
    return pd.DataFrame(rows)


def class_2026() -> pd.DataFrame:
    cache = os.path.join(config.OUT_DIR, "nflverse_roster_2026.csv")
    if os.path.exists(cache):
        df = pd.read_csv(cache, low_memory=False)
    else:
        df = pd.read_csv(ROSTER_URL.format(season=2026), low_memory=False)
        os.makedirs(config.OUT_DIR, exist_ok=True)
        df.to_csv(cache, index=False)
    df = df[(df["entry_year"] == 2026) & df["position"].isin(["QB", "RB", "WR", "TE"])]
    df = df.dropna(subset=["gsis_id"]).drop_duplicates("gsis_id")
    out = df[["gsis_id", "position", "full_name", "team", "draft_number"]].copy()
    out["bucket"] = [bucket_for(p, d) for p, d in zip(out["position"], out["draft_number"])]
    return out


def main() -> None:
    conn = psycopg2.connect(config.nfl_data_dsn())
    conn.set_session(readonly=True)
    with conn.cursor() as cur:
        cur.execute(_ROOKIE_CLASS_SQL, {"years": CLASS_SEASONS})
        classes = pd.DataFrame(cur.fetchall(), columns=["gsis_id", "position", "draft_year", "overall_pick"])
    classes = classes.drop_duplicates("gsis_id")
    totals = rookie_year_totals(conn, classes)
    conn.close()

    priors = bucket_priors(totals)
    rookies = class_2026()

    os.makedirs(config.OUT_DIR, exist_ok=True)
    priors.to_csv(os.path.join(config.OUT_DIR, "rookie_priors.csv"), index=False)
    rookies.to_csv(os.path.join(config.OUT_DIR, "rookie_2026.csv"), index=False)
    print(f"rookie_priors.csv: {len(priors)} pos-bucket rows from {len(totals)} rookie seasons")
    show = ["position", "bucket", "n_players", "r_acc", "r_tw", "r_sack", "r_rush_mtf",
            "r_rec_fd", "r_first_read", "r_sep_p1", "r_sep_p2"]
    print(priors[show].round(4).to_string(index=False))
    print(f"rookie_2026.csv: {len(rookies)} rookies "
          f"({(rookies['draft_number'].notna()).sum()} drafted)")


if __name__ == "__main__":
    sys.exit(main())
