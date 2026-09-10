"""Step 5: read the league's week from prod (read-only).

Rosters, this week's lineups, this week's matchups and the NFL schedule. The
schedule is what decides who is locked and who is on bye - player_week_games is
only populated after games are played, so it is useless for the week ahead.

Run:  python -m tools.weekly_proj.league_week [--week N]
Out:  out/wk<NN>/league_state.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import psycopg2

from . import config
from .project_week import latest_week

TEAMS_SQL = """
SELECT t.id, t.name, t.abbrev, t.faab_budget
FROM teams t WHERE t.league_id = %(lid)s ORDER BY t.name
"""

ROSTER_SQL = """
SELECT r.team_id, r.gsis_id, r.acquired_via
FROM roster_entries r
WHERE r.league_id = %(lid)s AND r.dropped_at IS NULL
"""

LINEUP_SQL = """
SELECT l.team_id, ls.slot, ls.slot_index, ls.gsis_id, ls.locked_at
FROM lineups l
JOIN teams t ON t.id = l.team_id
JOIN lineup_slots ls ON ls.lineup_id = l.id
WHERE t.league_id = %(lid)s AND l.season = %(season)s AND l.week = %(week)s
ORDER BY l.team_id, ls.slot, ls.slot_index
"""

MATCHUP_SQL = """
SELECT m.id, m.home_team_id, m.away_team_id, m.is_playoff, m.status
FROM matchups m
WHERE m.league_id = %(lid)s AND m.season = %(season)s AND m.week = %(week)s
ORDER BY m.id
"""

PLAYERS_SQL = """
SELECT p.gsis_id, p.display_name, p.position, p.nfl_team
FROM players p
WHERE p.position IN ('QB','RB','WR','TE','COACH')
"""

GAMES_SQL = """
SELECT g.home_team, g.away_team, g.kickoff_at, g.status
FROM nfl_games g
WHERE g.season = %(season)s AND g.season_type = 'REG' AND g.week = %(week)s
"""


def _rows(cur, sql, params):
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _iso(v):
    return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if v else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int)
    args = ap.parse_args()
    week = args.week or latest_week()

    meta_path = os.path.join(config.OUT_DIR, "league_meta.json")
    if not os.path.exists(meta_path):
        raise SystemExit("run tools.weekly_proj.snapshot_rules first (need league_meta.json)")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    lid, season = meta["leagueId"], meta["season"]

    conn = psycopg2.connect(config.prod_app_dsn())
    conn.set_session(readonly=True)
    try:
        with conn.cursor() as cur:
            p = {"lid": lid, "season": season, "week": week}
            teams = _rows(cur, TEAMS_SQL, p)
            roster = _rows(cur, ROSTER_SQL, p)
            slots = _rows(cur, LINEUP_SQL, p)
            matchups = _rows(cur, MATCHUP_SQL, p)
            players = _rows(cur, PLAYERS_SQL, p)
            games = _rows(cur, GAMES_SQL, p)
    finally:
        conn.close()

    kickoffs = {}
    for g in games:
        for side in ("home_team", "away_team"):
            kickoffs[g[side]] = _iso(g["kickoff_at"])
    for s in slots:
        s["locked_at"] = _iso(s["locked_at"])

    state = {
        "season": season,
        "week": week,
        "leagueId": lid,
        "slug": meta["slug"],
        "rosterTemplate": meta["rosterTemplate"],
        "scoringVersion": meta["scoringVersion"],
        "readAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "teams": teams,
        "roster": roster,
        "lineups": slots,
        "matchups": matchups,
        "players": {p["gsis_id"]: {"name": p["display_name"], "pos": p["position"],
                                   "team": p["nfl_team"]} for p in players},
        "kickoffs": kickoffs,
    }
    dest = config.week_file(week, "league_state.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=1)

    filled = sum(1 for s in slots if s["gsis_id"])
    print(f"week {week} league_state.json: {len(teams)} teams, {len(roster)} rostered, "
          f"{filled}/{len(slots)} lineup slots filled, {len(matchups)} matchups, "
          f"{len(games)} NFL games")
    if not matchups:
        print("  warn: no matchups scheduled for this week")
    nfl_teams = {p["nfl_team"] for p in players
                 if p["nfl_team"] and p["position"] != "COACH"}
    bye = sorted(t for t in nfl_teams if t not in kickoffs)
    if bye:
        print(f"  teams on bye: {', '.join(bye)}")


if __name__ == "__main__":
    sys.exit(main())
