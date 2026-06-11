"""CLI entry point for the weekly scoring push (run by Windows Task Scheduler).

Examples (from the FPFantasyLeague repo root):
  python -m tools.scoring.push_scores --season 2024 --week 1
  python -m tools.scoring.push_scores --season 2025 --current
  python -m tools.scoring.push_scores --season 2024 --week 1 --dry-run
  python -m tools.scoring.push_scores --test-conn
"""

from __future__ import annotations

import argparse
import sys

from . import pipeline
from .aggregate import _query_df
from .config import source_pg_config
from .db import connect_source, test_dest, test_source


def _resolve_current_week(season: int, seas_type: str) -> int:
    """Latest week whose games have started (gameday <= today) for the season."""
    src = connect_source(source_pg_config())
    try:
        gtypes = ["REG"] if seas_type == "REG" else ["WC", "DIV", "CON", "SB"]
        df = _query_df(
            src,
            """SELECT MAX(week) AS wk FROM games_schedule
               WHERE season=%(season)s AND game_type = ANY(%(gtypes)s) AND gameday <= CURRENT_DATE""",
            {"season": season, "gtypes": gtypes},
        )
    finally:
        src.close()
    wk = df["wk"].iloc[0] if not df.empty else None
    if wk is None:
        raise SystemExit(f"Could not resolve current week for season {season}")
    return int(wk)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Push weekly fantasy stat lines to the app DB.")
    p.add_argument("--season", type=int)
    p.add_argument("--week", type=int)
    p.add_argument("--current", action="store_true", help="resolve current week from the schedule")
    p.add_argument("--seas-type", default="REG", choices=["REG", "POST"])
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--skip-players", action="store_true")
    p.add_argument("--skip-schedule", action="store_true")
    p.add_argument("--test-conn", action="store_true", help="test both DB connections and exit")
    args = p.parse_args(argv)

    if args.test_conn:
        ok_s, msg_s = test_source(source_pg_config())
        print(f"source NFL_Data: {'OK' if ok_s else 'FAIL'} — {msg_s}")
        ok_d, msg_d = test_dest()
        print(f"dest app DB:     {'OK' if ok_d else 'FAIL'} — {msg_d}")
        return 0 if (ok_s and ok_d) else 1

    if args.season is None:
        p.error("--season is required")
    week = args.week
    if args.current:
        week = _resolve_current_week(args.season, args.seas_type)
        print(f"[current] resolved week = {week}")
    if week is None:
        p.error("provide --week or --current")

    result = pipeline.run(
        season=args.season,
        week=week,
        seas_type=args.seas_type,
        dry_run=args.dry_run,
        skip_players=args.skip_players,
        skip_schedule=args.skip_schedule,
    )
    print("[result]", result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
