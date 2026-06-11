"""Build the draftable player pool DataFrame for the app `players` table.

Real players come from the current season's weekly_rosters (latest week per
player for week-accurate team/position). Team defenses are synthesized as
'DST-<team>' rows so the app can treat every roster slot as "a player".
"""

from __future__ import annotations

import pandas as pd

from .aggregate import _query_df

_PLAYERS_SQL = """
WITH latest AS (
  SELECT DISTINCT ON (gsis_id)
    gsis_id,
    TRIM(COALESCE(football_name, first_name, '') || ' ' || COALESCE(last_name, '')) AS display_name,
    first_name,
    last_name,
    position,
    current_team AS nfl_team,
    COALESCE(status, statusdescription) AS status
  FROM weekly_rosters
  WHERE season = %(season)s AND gsis_id IS NOT NULL AND gsis_id <> ''
  ORDER BY gsis_id, week DESC
),
-- Some roster rows carry a NULL position (e.g. a player's latest week);
-- fall back to that player's most recent non-null position this season.
last_pos AS (
  SELECT DISTINCT ON (gsis_id) gsis_id, position
  FROM weekly_rosters
  WHERE season = %(season)s AND gsis_id IS NOT NULL AND position IS NOT NULL
  ORDER BY gsis_id, week DESC
)
SELECT
  l.gsis_id,
  l.display_name,
  l.first_name,
  l.last_name,
  COALESCE(l.position, p.position, 'UNK') AS position,
  l.nfl_team,
  l.status
FROM latest l
LEFT JOIN last_pos p USING (gsis_id)
"""

_TEAMS_SQL = """
SELECT DISTINCT team FROM (
  SELECT home_team AS team FROM games_schedule WHERE season = %(season)s
  UNION
  SELECT away_team AS team FROM games_schedule WHERE season = %(season)s
) t WHERE team IS NOT NULL
"""


def build_players(conn, season: int) -> pd.DataFrame:
    players = _query_df(conn, _PLAYERS_SQL, {"season": season})
    players["headshot_url"] = None

    teams = _query_df(conn, _TEAMS_SQL, {"season": season})
    dst = pd.DataFrame(
        {
            "gsis_id": "DST-" + teams["team"].astype(str),
            "display_name": teams["team"].astype(str) + " D/ST",
            "first_name": None,
            "last_name": None,
            "position": "DST",
            "nfl_team": teams["team"].astype(str),
            "status": "ACT",
            "headshot_url": None,
        }
    )

    cols = [
        "gsis_id",
        "display_name",
        "first_name",
        "last_name",
        "position",
        "nfl_team",
        "status",
        "headshot_url",
    ]
    return pd.concat([players[cols], dst[cols]], ignore_index=True)
