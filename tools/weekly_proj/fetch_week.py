"""Step 1: snapshot this week's tabs from the weekly projections workbook.

The workbook holds ONE week and is overwritten every week, so a missed run
loses that week for good. Each fetch writes into out/wk<NN>/ and refuses to
overwrite an existing snapshot without --refresh.

The week number comes from the Odds tab's Week column and must resolve to a
single value; --week N asserts it matches what you expected.

Run:  python -m tools.weekly_proj.fetch_week [--week N] [--refresh]
Out:  out/wk<NN>/{weekly_projections,working_player_proj,team_projections,odds,schedule}.csv
      out/wk<NN>/fetch_meta.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone

import gspread

from . import config


def _open_sheet():
    gc = gspread.service_account(filename=config.SERVICE_ACCOUNT_JSON)
    return gc.open_by_key(config.SHEET_KEY)


def _write_csv(path: str, values: list[list[str]]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(values)


def week_from_odds(values: list[list[str]]) -> int:
    """Odds tab: header row 0 with Season/Week; one week per snapshot."""
    header = [c.strip().lower() for c in values[0]]
    try:
        wcol = header.index("week")
    except ValueError as exc:
        raise SystemExit(f"Odds tab has no Week column (header: {values[0][:8]})") from exc
    weeks = set()
    for row in values[1:]:
        if len(row) > wcol and row[wcol].strip():
            weeks.add(row[wcol].strip())
    if not weeks:
        raise SystemExit("Odds tab has no populated Week values")
    if len(weeks) > 1:
        raise SystemExit(f"Odds tab spans multiple weeks {sorted(weeks)} - cannot pick one")
    return int(next(iter(weeks)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int, help="assert the sheet holds this week")
    ap.add_argument("--refresh", action="store_true", help="overwrite an existing snapshot")
    args = ap.parse_args()

    sh = _open_sheet()
    print(f"workbook: {sh.title}")
    odds = sh.worksheet("Odds").get_all_values()
    week = week_from_odds(odds)
    if args.week and args.week != week:
        raise SystemExit(f"sheet holds week {week}, expected --week {args.week}")

    d = config.week_dir(week)
    existing = os.path.isdir(d) and any(
        os.path.exists(os.path.join(d, n)) for n in config.TABS.values()
    )
    if existing and not args.refresh:
        raise SystemExit(
            f"week {week} already snapshotted in {d} - pass --refresh to refetch "
            f"(the sheet is overwritten weekly; the snapshot is the only copy)"
        )
    config.week_dir(week, create=True)

    counts = {}
    for tab, name in config.TABS.items():
        values = odds if tab == "Odds" else sh.worksheet(tab).get_all_values()
        if not values:
            raise SystemExit(f"tab {tab} is empty")
        _write_csv(os.path.join(d, name), values)
        counts[tab] = [len(values), max(len(r) for r in values)]
        print(f"  [{tab}] {len(values)} rows x {counts[tab][1]} cols -> {name}")

    meta = {
        "week": week,
        "season": config.SEASON,
        "workbook": sh.title,
        "sheetKey": config.SHEET_KEY,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tabs": counts,
    }
    with open(os.path.join(d, "fetch_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    print(f"week {week} snapshot -> {d}")


if __name__ == "__main__":
    sys.exit(main())
