# FPFantasyLeague

A public, login-gated fantasy football platform that hosts leagues (~50 leagues / ~600 users),
runs async/slow snake drafts, lets managers set weekly lineups, and scores head-to-head matchups
from post-game NFL charting data.

## Product rules (decided 2026-06-10)

- **Central administration** — site admins (`users.is_site_admin`) create leagues and set every
  league's settings; there are no per-league commissioners. Managers join via invite code,
  draft, roster, and set lineups.
- **No kickers, no defenses** — offense-only (QB/RB/WR/TE + FLEX). The pipeline still pushes
  K/DST stat lines for future-proofing, but the UI and default roster exclude them.
- **Playoffs = cross-league championship sprint** — top 2 teams from every league enter one
  global pool; weeks 15–17 cumulative starter points decide the champion (`/championship`).
- **Scoring Lab** (`/admin/scoring-lab`) — admins test scoring rules against past-season data
  before applying them to leagues.

## Status

Feature-complete for the core loop and verified locally end-to-end (`app/scripts/dev-e2e.ts`,
`app/scripts/dev-draft-e2e.ts`): auth → league create/join → schedule → async snake draft with
autopick clock → free agency/waivers → lineups with per-slot kickoff locks → score → rollup →
standings → championship sprint. Outstanding: trades, notification emails, and production
deploy (Neon + Fly — see `SETUP.md`).

## Architecture (two parts)

```
  Browser (email/pw + Google)
        │
        ▼
  Next.js 16 app (Fly.io: `app` + `worker` process groups)        ──►  App Postgres (Neon)
   - App Router: RSC pages + Server Actions                              users/leagues/teams/
   - /api/auth (Auth.js) + /api/ingest/* (token-guarded intake)         drafts/lineups/matchups/
   - Drizzle ORM                                                         player_week_stats (inbound)
        ▲ weekly idempotent UPSERT (sslmode=require)                     player_week_scores (computed)
        │
  LOCAL weekly Python job (tools/scoring/, on your machine)
   - reads NFL_Data (localhost Postgres, READ-ONLY)
   - aggregates pbp → normalized per-player-per-week STAT LINES
   - pushes stat lines + game kickoffs + player pool to App Postgres
   - run via Windows Task Scheduler
```

**Key division of responsibility:** the local pipeline pushes **raw counting stats** (not fantasy
points). The app applies each league's `scoring_rules` to those stat lines. This decouples the ~50
per-league scoring configs from the pipeline and makes re-scoring (after stat corrections or rule
edits) a pure cloud-side recompute.

## Layout

- `app/` — the Next.js application (web + background worker), Drizzle schema, scoring engine.
- `tools/scoring/` — the local Python pipeline that reads `NFL_Data` and pushes stat lines to the app DB.

## Getting started (app)

```powershell
cd app
npm install
copy .env.example .env.local   # then fill in DATABASE_URL, AUTH_SECRET, etc.
npm run db:migrate             # apply migrations to the DB in DATABASE_URL
npm run db:seed -- you@example.com <password> "Your Name"   # create the first site admin
npm run dev                    # http://localhost:3000
npm run worker                 # in a second terminal: scoring/draft/waiver worker
```

Local dev currently points at the `fpfl_dev` database on the local Postgres
(dev DSN in `tools/scoring/.dev_db_dsn`, gitignored). Production uses Neon.

## Getting started (pipeline)

```powershell
cd tools\scoring
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env         # NFL_DB_* (source) + APP_DB_URL (dest)
python -m push_scores --season 2024 --week 1 --dry-run
```

See the full design at `..\..\.claude\plans\if-i-wanted-to-playful-giraffe.md`.
