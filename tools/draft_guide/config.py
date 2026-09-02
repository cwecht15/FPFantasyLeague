"""Shared paths, DSNs, and constants for the 2026 draft guide pipeline.

Everything is READ-ONLY against its sources: the season sheet, the local
NFL_Data charting DB, and the app DBs (dev fpfl_dev for historical stat lines,
Neon only for the one-off league-rules snapshot). Outputs land in out/ (gitignored).
"""

from __future__ import annotations

import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
OUT_DIR = os.path.join(HERE, "out")

SEASON = 2026
LEAGUE_SLUG = "scott-bear-bowl-2026-5e71b3"
GAMES = 17

# --- season projection sheet -------------------------------------------------
SHEET_KEY = "1bQtJKplmdOAEmKA1zCdSe8TeVFdOqO3fd-vUgtP1dH0"
SERVICE_ACCOUNT_JSON = r"C:\Users\cwech\Documents\Football\Keys\fp-data-357113-a6174bb87054.json"
FALLBACK_PLAYER_CSV = (
    r"C:\Users\cwech\Documents\Football\Projections\Season_Projections_Research"
    r"\adp_compare\preseason_projections.csv"
)

# --- team-level 2026 stat models (owner's research outputs) -------------------
PROJ_RESEARCH_DIR = r"C:\Users\cwech\Documents\Football\Projections_Research"
TEAM_PLAYS_CSV = os.path.join(PROJ_RESEARCH_DIR, "team_plays_per_game_projections_2026_weighted.csv")
TEAM_PASS_RATE_CSV = os.path.join(PROJ_RESEARCH_DIR, "team_pass_rate_projections_2026_weighted.csv")
QB_SACK_RATE_CSV = os.path.join(PROJ_RESEARCH_DIR, "qb_sack_rate_projections_2026_weighted.csv")
QB_SCRAMBLE_RATE_CSV = os.path.join(PROJ_RESEARCH_DIR, "qb_scramble_rate_projections_2026_weighted.csv")

# --- databases ---------------------------------------------------------------
_SCORING_ENV = os.path.join(REPO_ROOT, "tools", "scoring", ".env")
_DEV_DSN_FILE = os.path.join(REPO_ROOT, "tools", "scoring", ".dev_db_dsn")
_NFL_GUIDE_ENV = r"C:\Users\cwech\Documents\Claude\Projects\NFL_Database_Guide\.env"


def _env_value(path: str, key: str) -> str | None:
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(rf'^{key}="?([^"\r\n]+)"?\s*$', line.strip())
            if m:
                return m.group(1)
    return None


def dev_app_dsn() -> str:
    """Local dev app DB (fpfl_dev) — full 2024+2025 player_week_stats."""
    with open(_DEV_DSN_FILE, encoding="utf-8") as f:
        return f.read().strip()


def prod_app_dsn() -> str:
    """Neon prod app DB. Used read-only, only for the league-rules snapshot."""
    dsn = _env_value(_SCORING_ENV, "APP_DB_URL")
    if not dsn:
        raise SystemExit("APP_DB_URL not found in tools/scoring/.env")
    return dsn


def nfl_data_dsn() -> str:
    """Local NFL_Data charting DB (read-only)."""
    pw = _env_value(_NFL_GUIDE_ENV, "NFL_DB_PASSWORD")
    if not pw:
        raise SystemExit("NFL_DB_PASSWORD not found in NFL_Database_Guide/.env")
    return f"host=localhost port=5432 dbname=NFL_Data user=postgres password={pw}"


# nflverse / sheet team codes -> house (GSIS charting) codes, mirroring
# tools/scoring/nflverse_rosters.py
TEAM_TO_HOUSE = {"ARI": "ARZ", "BAL": "BLT", "CLE": "CLV", "HOU": "HST", "LAR": "LA", "JAC": "JAX"}


def house_team(code: str) -> str:
    c = (code or "").strip().upper()
    return TEAM_TO_HOUSE.get(c, c)
