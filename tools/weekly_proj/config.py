"""Shared paths, DSNs and constants for the weekly projections pipeline.

Sibling to tools/draft_guide. Everything is READ-ONLY against its sources: the
weekly FantasyPoints projections workbook, the draft guide's cached charting
rates, the local NFL_Data DB, and the prod app DB. Outputs land in out/
(gitignored), one folder per week.

The weekly workbook holds ONE week at a time and is overwritten every week, so
each fetch snapshots into out/wk<NN>/ and refuses to clobber an existing one.
"""

from __future__ import annotations

import os

from tools.draft_guide import config as dg

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = dg.REPO_ROOT
OUT_DIR = os.path.join(HERE, "out")

SEASON = dg.SEASON
LEAGUE_SLUG = dg.LEAGUE_SLUG
GAMES = dg.GAMES

# --- weekly projection sheet (NOT the season workbook) -----------------------
SHEET_KEY = "1zry9ZCAOoevHN9-EnVpGt7YzHmq8MuUZA_AjXjJO250"
SERVICE_ACCOUNT_JSON = dg.SERVICE_ACCOUNT_JSON

TABS = {
    "Weekly_Projections": "weekly_projections.csv",
    "Working_Player_Proj": "working_player_proj.csv",
    "Team_Projections": "team_projections.csv",
    "Odds": "odds.csv",
    "Schedule": "schedule.csv",
}

# --- reused draft guide artifacts (charting rates, rookie priors, coaches) ---
DG_OUT = dg.OUT_DIR
PLAYER_RATES_CSV = os.path.join(DG_OUT, "player_rates.csv")
POSITION_MEANS_CSV = os.path.join(DG_OUT, "position_means.csv")
ROOKIE_PRIORS_CSV = os.path.join(DG_OUT, "rookie_priors.csv")
ROOKIE_CLASS_CSV = os.path.join(DG_OUT, "rookie_2026.csv")
COACH_SEASON_CSV = os.path.join(DG_OUT, "coach_stat_lines.csv")

# --- shared helpers ----------------------------------------------------------
house_team = dg.house_team
prod_app_dsn = dg.prod_app_dsn
nfl_data_dsn = dg.nfl_data_dsn


def week_dir(week: int, create: bool = False) -> str:
    d = os.path.join(OUT_DIR, f"wk{int(week):02d}")
    if create:
        os.makedirs(d, exist_ok=True)
    return d


def week_file(week: int, name: str) -> str:
    return os.path.join(week_dir(week), name)
