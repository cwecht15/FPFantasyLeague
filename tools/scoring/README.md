# Scoring pipeline (`tools/scoring`)

Local, weekly job that reads the **NFL_Data** Postgres (read-only) on this
machine, aggregates `pbp` into normalized per-player-per-week **stat lines**, and
pushes them to the **cloud app Postgres** (Neon). It pushes RAW counting stats —
the app applies each league's scoring rules. Mirrors the structure of
`Data_Suite_2.0/tools/etl`.

## Setup

```powershell
cd tools\scoring
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env    # fill NFL_DB_PASSWORD (source) + APP_DB_URL (Neon dest)
```

## Run (from the repo root)

```powershell
# test both connections
python -m tools.scoring.push_scores --test-conn

# dry run (computes, prints counts, writes nothing)
python -m tools.scoring.push_scores --season 2024 --week 1 --dry-run

# real push of one week
python -m tools.scoring.push_scores --season 2024 --week 1

# resolve the in-progress week automatically
python -m tools.scoring.push_scores --season 2025 --current
```

Flags: `--seas-type REG|POST`, `--skip-players`, `--skip-schedule`, `--dry-run`,
`--current`, `--test-conn`.

## What it pushes

| App table | Source | Key |
|---|---|---|
| `players` | `weekly_rosters` (+ synthetic `DST-XX`) | `gsis_id` |
| `nfl_games` | `games_schedule` (kickoff ET→UTC) | `game_id` |
| `player_week_games` | player team → game map | `(gsis_id, season, season_type, week)` |
| `player_week_stats` | `pbp` aggregation (offense/kicker/DST) | same |
| `score_dirty` | signal of changed slice → app rescore | `(season, season_type, week)` |

Pushes are idempotent (staging upsert + `source_hash` guard + delete-missing),
so re-runs and NFL stat corrections self-heal.

## Scheduling (Windows Task Scheduler, season only)

Create idempotent tasks during the NFL season (every run re-pushes the current
slice safely):

| When (ET) | Command |
|---|---|
| Fri 06:00 (TNF) | `... push_scores --season 2025 --current` |
| Mon 06:00 (Sun games) | `... push_scores --season 2025 --current` |
| Tue 06:00 (MNF) | `... push_scores --season 2025 --current` |
| Wed 06:00 (corrections) | `... push_scores --season 2025 --current` |

Point the action at the venv python, e.g.
`C:\...\tools\scoring\.venv\Scripts\python.exe -m tools.scoring.push_scores ...`
with **Start in** = the repo root.

## Notes

- Source connections are opened `readonly=True` — accidental writes raise.
- `games_schedule.gametime` is NULL on older / not-yet-finalized rows → kickoff
  pushed as NULL; the app falls back for lineup lock.
- Postseason `points_allowed` week alignment is best-effort (REG is exact).
