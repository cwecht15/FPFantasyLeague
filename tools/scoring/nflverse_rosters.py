"""Sync the app `players` table from nflverse season rosters.

Stopgap for the gap between the NFL season starting and the NFL_Data charting
DB catching up: NFL_Data's weekly_rosters had no 2026 rows in August 2026, so
the pipeline's player pool (players_sync.py) couldn't include the 2026 rookie
class. nflverse publishes current-season rosters with real GSIS IDs, so rows
upserted here merge cleanly once the normal pipeline push resumes (which will
overwrite names/teams/headshots with the house feed's values — that's fine).

Insert/update only — never deletes, and never touches the synthetic DST-/COACH-
rows. Team codes are normalized to the house (GSIS) scheme: ARZ/BLT/CLV/HST.

Usage (from the repo root):
  python -m tools.scoring.nflverse_rosters --season 2026            # dry run
  python -m tools.scoring.nflverse_rosters --season 2026 --apply
"""

from __future__ import annotations

import argparse

import pandas as pd

from . import cloud_loader
from .db import connect_dest

ROSTER_URL = "https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_{season}.csv"

# nflverse -> house (GSIS-style) team codes; all others already match.
TEAM_MAP = {"ARI": "ARZ", "BAL": "BLT", "CLE": "CLV", "HOU": "HST", "LAR": "LA", "JAC": "JAX"}

PLAYER_COLS = [
    "gsis_id",
    "display_name",
    "first_name",
    "last_name",
    "position",
    "nfl_team",
    "status",
    "headshot_url",
]


def build_players(season: int) -> pd.DataFrame:
    df = pd.read_csv(ROSTER_URL.format(season=season), low_memory=False)
    df = df[df["gsis_id"].notna() & (df["gsis_id"].astype(str).str.strip() != "")]
    # One row per player: rosters files are season snapshots, but keep the
    # latest week defensively if the file ever carries several.
    if "week" in df.columns:
        df = df.sort_values("week").drop_duplicates("gsis_id", keep="last")
    else:
        df = df.drop_duplicates("gsis_id", keep="last")

    first = df["football_name"].fillna(df["first_name"]).fillna("")
    out = pd.DataFrame(
        {
            "gsis_id": df["gsis_id"].astype(str).str.strip(),
            "display_name": (first + " " + df["last_name"].fillna("")).str.strip(),
            "first_name": df["first_name"],
            "last_name": df["last_name"],
            "position": df["position"].fillna("UNK"),
            "nfl_team": df["team"].map(lambda t: TEAM_MAP.get(t, t) if pd.notna(t) else None),
            "status": df["status"],
            "headshot_url": df["headshot_url"],
        }
    )
    out = out[out["display_name"] != ""]
    return out.reset_index(drop=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--apply", action="store_true", help="write to the app DB (default: dry run)")
    args = ap.parse_args()

    players = build_players(args.season)
    skill = players[players["position"].isin(["QB", "RB", "WR", "TE"])]
    print(f"[nflverse] season {args.season}: {len(players)} players ({len(skill)} skill)")

    dest = connect_dest()
    try:
        with dest.cursor() as cur:
            cur.execute("SELECT gsis_id, nfl_team FROM players")
            existing = dict(cur.fetchall())
        new = players[~players["gsis_id"].isin(existing.keys())]
        moved = players[
            players["gsis_id"].isin(existing.keys())
            & players.apply(lambda r: existing.get(r["gsis_id"]) != r["nfl_team"], axis=1)
        ]
        new_skill = new[new["position"].isin(["QB", "RB", "WR", "TE"])]
        print(f"[nflverse] new players: {len(new)} ({len(new_skill)} skill), team changes: {len(moved)}")
        if not new_skill.empty:
            print(new_skill[["gsis_id", "display_name", "position", "nfl_team"]].head(10).to_string(index=False))

        if not args.apply:
            print("[nflverse] dry run — nothing written (pass --apply)")
            return

        r = cloud_loader.upsert(dest, "players", players[PLAYER_COLS], ["gsis_id"])
        dest.commit()
        print(f"[nflverse] pushed: {r}")
    except Exception:
        dest.rollback()
        raise
    finally:
        dest.close()


if __name__ == "__main__":
    main()
