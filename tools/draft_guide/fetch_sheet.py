"""Step 1: snapshot the season sheet tabs the guide needs.

Pulls Player_Projections (season stat line, GSIS ids), Team_Data (team wins/points),
and ADP (PPR format) into out/*.csv so downstream steps never touch the network.
Columns are resolved by header downstream — this step stores tabs verbatim and
prints the headers so drift is visible.

Run:  C:\\Users\\cwech\\anaconda3\\python.exe -m tools.draft_guide.fetch_sheet
"""

from __future__ import annotations

import csv
import os
import sys

from . import config


def _write_tab(gc, tab: str, out_name: str) -> list[str] | None:
    path = os.path.join(config.OUT_DIR, out_name)
    if os.path.exists(path) and "--refresh" not in sys.argv:
        print(f"[{tab}] cached -> {path} (pass --refresh to refetch)")
        return None
    ws = gc.open_by_key(config.SHEET_KEY).worksheet(tab)
    vals = ws.get_all_values()
    if not vals:
        raise SystemExit(f"tab {tab!r} came back empty")
    os.makedirs(config.OUT_DIR, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(vals)
    header = [h.strip() for h in vals[0]]
    print(f"[{tab}] {len(vals) - 1} rows x {len(header)} cols -> {path}")
    print(f"[{tab}] headers: {header}")
    return header


def main() -> None:
    import gspread

    gc = gspread.service_account(filename=config.SERVICE_ACCOUNT_JSON)
    _write_tab(gc, "Player_Projections", "sheet_player_projections.csv")
    _write_tab(gc, "Team_Data", "sheet_team_data.csv")
    _write_tab(gc, "ADP", "sheet_adp.csv")
    # Wins model inputs (points allowed) + FG/XP for team points + positions.
    _write_tab(gc, "Preseason_DST_Projections", "sheet_dst_proj.csv")
    _write_tab(gc, "Preseason_K_Projections", "sheet_k_proj.csv")
    _write_tab(gc, "Raw_Roster_Info", "sheet_roster_info.csv")


if __name__ == "__main__":
    sys.exit(main())
