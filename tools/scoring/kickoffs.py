"""Build the schedule (nfl_games) and the per-week team->game map used to
populate player_week_games for lineup-lock support.

games_schedule.gametime is text local Eastern (NULL on older / not-yet-finalized
rows). We combine gameday + gametime, localize to America/New_York, and convert
to UTC. Missing kickoffs are pushed as NULL — the app falls back and warns.
"""

from __future__ import annotations

import pandas as pd

from .aggregate import _query_df

# games_schedule.game_type -> app season_type
_GTYPE_TO_STYPE = {
    "REG": "REG",
    "WC": "POST",
    "DIV": "POST",
    "CON": "POST",
    "SB": "POST",
}

_GAMES_SQL = """
SELECT game_id, season, game_type, week, gameday, gametime,
       home_team, away_team, home_score, away_score
FROM games_schedule
WHERE season = %(season)s
"""


def build_nfl_games(conn, season: int) -> pd.DataFrame:
    df = _query_df(conn, _GAMES_SQL, {"season": season})
    if df.empty:
        return df

    df["season_type"] = df["game_type"].map(_GTYPE_TO_STYPE).fillna("REG")

    # Combine date + local time -> UTC. Rows with no gametime get NaT.
    gameday = df["gameday"].astype("string")
    gametime = df["gametime"].astype("string")
    combined = pd.to_datetime(
        gameday.str.cat(gametime, sep=" ", na_rep=""), errors="coerce"
    )
    has_time = gametime.notna() & (gametime.str.len() > 0)
    combined = combined.where(has_time)  # drop date-only (midnight) values
    kickoff_utc = (
        combined.dt.tz_localize("America/New_York", ambiguous="NaT", nonexistent="NaT")
        .dt.tz_convert("UTC")
    )
    df["kickoff_at"] = kickoff_utc

    df["status"] = df["home_score"].apply(lambda s: "final" if pd.notna(s) else "scheduled")

    out = df[
        [
            "game_id",
            "season",
            "season_type",
            "week",
            "home_team",
            "away_team",
            "kickoff_at",
            "home_score",
            "away_score",
            "status",
        ]
    ].copy()
    return out


_TEAM_GAME_SQL = """
SELECT game_id, home_team, away_team
FROM games_schedule
WHERE season = %(season)s AND week = %(week)s AND game_type = ANY(%(gtypes)s)
"""

_GAME_TYPES = {"REG": ["REG"], "POST": ["WC", "DIV", "CON", "SB"]}


def team_game_map(conn, season: int, week: int, stype: str) -> dict[str, str]:
    """team -> game_id for one week (both home and away point at the game)."""
    df = _query_df(
        conn,
        _TEAM_GAME_SQL,
        {"season": season, "week": week, "gtypes": _GAME_TYPES.get(stype, ["REG"])},
    )
    m: dict[str, str] = {}
    for _, row in df.iterrows():
        m[str(row["home_team"])] = row["game_id"]
        m[str(row["away_team"])] = row["game_id"]
    return m
