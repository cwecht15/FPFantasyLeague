# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FP Fantasy League — a public fantasy football platform (~50 leagues / ~600 users) scored from
post-game NFL charting data. Two parts:

- `app/` — Next.js 16 App Router + React 19 + Tailwind v4 + Drizzle + Auth.js v5. Deployed on
  Fly.io as two process groups (`app` web + `worker` background) sharing one image, against a
  Neon Postgres. **Live at https://fpfl-fantasy.fly.dev** (Fly app `fpfl-fantasy`).
- `tools/scoring/` — local Python pipeline (psycopg2, pandas) that reads the **NFL_Data**
  Postgres on this machine (READ-ONLY) and pushes normalized per-player-week stat lines to the
  app DB. Runs via Windows Task Scheduler (4 weekly tasks named "FPFantasyLeague Push *").

The pipeline pushes **raw counting stats**; the app applies each league's `scoring_rules`.
Re-scoring is a pure cloud-side recompute, triggered through the `score_dirty` table.

## Product rules (decided by the owner — do not regress)

1. **Central administration.** Site admins (`users.is_site_admin`) create leagues, edit
   settings, approve trades, run the Scoring Lab. There are **no per-league commissioners**.
   Regular users join by invite code or admin assignment; they cannot create leagues.
2. **Each user is in exactly one league.** `/leagues` redirects to it (join screen if none;
   admins → `/admin/leagues`). There is no "my leagues" list page.
3. **No kickers, no defenses.** Offense only: QB/RB/WR/TE + FLEX, plus the **COACH slot** —
   each NFL team's coaching staff is a draftable synthetic player (`COACH-XX`, position
   `COACH`) scored on team scheme/results (play-action dropbacks 0.2, motion dropbacks 0.1,
   win +5, 30+ points scored +10; see `CoachingRules`). The pipeline still pushes K/DST stat
   lines (future-proofing) but the UI and roster templates exclude them.
4. **No live scoring.** Scores exist only after the weekly charting push. Unscored values
   render an em dash `—`, never 0.00 or a spinner. Copy rhythm: *set lineup → slots lock at
   kickoff → results post Tuesday 6:00 AM ET*.
5. **Thursday-noon data lock.** A REG week becomes FINAL at 12:00 ET the Thursday after its
   last kickoff. The pipeline refuses to overwrite locked stat lines (`--force` overrides);
   the app never re-scores or re-rolls a locked, already-scored week. See
   `app/src/lib/nfl/locks.ts` and `_stats_locked` in `tools/scoring/pipeline.py`.
6. **Playoffs = cross-league championship sprint.** No brackets. Top 2 from every league enter
   one pool; cumulative starter points weeks 15–17 decide the champion (`/championship`).
7. **House scoring = `fp_advanced` preset** (default for new 12-team leagues). QBs score in
   an *advanced mode that replaces standard QB scoring*: only 5+ air-yard passing production
   counts (0.25/yd, 0.5/1D, 4/TD), sacks −1, INT −2, rush TD 4, EPA-per-dropback ×10
   (an EPA-total × option also exists). RB/WR/TE: PPR + 2 per missed tackle forced. The
   Scoring Lab additionally exposes rush/rec MTF splits, rec YACO, receiving first downs,
   explosive plays (15+ yd), per-grade separation scoring, and the COACH rules.
8. **Email/password auth only.** No Google OAuth (owner decision — don't re-suggest it).
9. Demo leagues (`leagues.is_demo`) are visible to site admins only, everywhere.

## Commands

All app commands run from `app/`:

```powershell
npm run dev          # local dev server (port 3000; 3100 is the usual prod-build port)
npm run build        # next build + esbuild worker bundle (dist/worker.js)
npx next start -p 3100   # serve the production build locally
npm run worker       # background worker (scoring, draft clock, waivers) — run alongside the app
npm test             # vitest (scoring engine unit tests)
npx tsc --noEmit     # type-check (run before building)
npm run db:generate  # drizzle migration from schema.ts changes
npm run db:migrate   # apply migrations to DATABASE_URL (see Environments)
npm run db:check     # list tables + key row counts
npm run db:seed -- <email> [password] [name]   # create/promote a site admin
```

Integration scripts (`npx tsx scripts/<name>.ts` from `app/`) — these are the real test
suite; run the relevant one after touching its domain:

- `dev-e2e.ts` — league → schedule → rosters → lineups → locks → score → rollup → standings
- `dev-draft-e2e.ts` — snake order, double-pick guard, queue autopick, completion
- `dev-trade-e2e.ts` — propose/accept/approve, roster swap, lineup clearing
- `dev-fp-advanced-check.ts [season]` — full-season leaderboards under the house preset
- `dev-demo-league.ts` / `dev-demo-season.ts` — rebuild the two admin-only demo leagues
- `dev-redesign-check.ts` — exercises dashboard/matchup-detail data paths

Pipeline (from the **repo root**, with the Anaconda Python):

```powershell
C:\Users\cwech\anaconda3\python.exe -m tools.scoring.push_scores --test-conn
C:\Users\cwech\anaconda3\python.exe -m tools.scoring.push_scores --season 2026 --current
C:\Users\cwech\anaconda3\python.exe -m tools.scoring.push_scores --season 2024 --week 1 --skip-players --skip-schedule
# --force overrides the Thursday-noon lock; --dry-run computes without writing
```

Deploy: `flyctl deploy --remote-only --yes` from `app/`. Secrets are already set on the app
(`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `EMAIL_FROM`); change via `flyctl secrets set`.

## Environments & secrets (all gitignored)

- **Local dev DB**: `fpfl_dev` on the local Postgres 16 (role `fpfl_app`); DSN in
  `tools/scoring/.dev_db_dsn`. `app/.env.local` points here. Holds the demo leagues and full
  2024+2025 stat data.
- **Production DB**: Neon (`neondb`, host `ep-rough-glitter-…-pooler.c-9.us-east-1.aws.neon.tech`).
  The app gets it via Fly secrets; the **pipeline's `APP_DB_URL` in `tools/scoring/.env`
  points at Neon** — i.e., scheduled pushes feed production, not local dev. To refresh local
  dev data, temporarily override `APP_DB_URL` env-var to the dev DSN.
- `tools/scoring/.env` also holds `NFL_DB_*` for the source DB (password mirrors
  `NFL_Database_Guide/.env`). `.prod_admin` / `.dev_admin` hold the seeded admin passwords.
- Migrations must be applied to BOTH databases: run `db:migrate` normally (local), then again
  with `$env:DATABASE_URL=<neon direct URL>` (the non-pooler host).

## Architecture

**Request path**: RSC pages call domain services in `app/src/lib/*/service.ts`; mutations are
Server Actions in `app/src/lib/*/actions.ts`. Every action re-derives authorization from the
session (`requireUser()` / `user.isSiteAdmin` / `getLeagueForUser(slug, userId)`) — never
trust IDs from form data without scoping them to the caller's league. `getLeagueForUser` is
the league authz chokepoint: it hides demo leagues from non-admins and gives admins virtual
commissioner access to any league.

**Scoring flow** (the spine of the product):
pipeline upserts `player_week_stats` (+`score_dirty` row) → worker's `pollScoreDirty` enqueues
`score_week` jobs → `scoreWeekForLeague` applies the league's rules via the pure
`scoreStatLine` (`lib/scoring/score-stat-line.ts` — the single source of scoring truth, also
used by the Scoring Lab) → enqueues `rollup_matchups` → `rollupLeagueWeek` sums starter slots
into matchup points/winners → `recomputeStandings`. Everything is recompute-from-source and
idempotent; the Thursday lock is the only thing that stops recomputation.

**Worker** (`app/src/worker/`): a 5s tick loop over a Postgres `jobs` table
(`FOR UPDATE SKIP LOCKED`). Each tick also runs three direct polls: `score_dirty`, expired
draft clocks (`advanceExpiredDrafts` → queue-or-best-available autopick), and due waiver
claims. Handlers register in `worker/handlers/`.

**Draft engine** (`lib/draft/service.ts`): picks pre-generated in snake order at start; the
current pick row is read FOR UPDATE to serialize humans vs. autopick; the partial unique index
on `(draft_id, gsis_id)` is the hard double-pick guard.

**Lineups** (`lib/lineups/service.ts`): per-slot kickoff locks (via `player_week_games` →
`nfl_games.kickoff_at`); lineups are **never empty by default** — `fillEmptyLineup` inherits
last week's arrangement, else fills by draft order; saves go through the bulk `saveLineup`
(one global Set Lineup button) which skips locked slots and reports them.

**Pipeline** (`tools/scoring/`): `aggregate.py` holds the big per-week SQL (offense CTEs +
advanced charting joins to `pass`/`base`/`pp`/`epa`); `pipeline.py` orchestrates, merges
duplicate keys (a kicker who threw a pass appears in two frames), hashes rows, and pushes via
`cloud_loader.py` staging upserts. Source connections are opened read-only. Key data gotchas:
`pbp` has **no `air_yards`** column (use `base.depth_target`) and **no receiving-TD** column
(a rec TD is `passing_touchdown` credited to `receiver_id`).

**UI system**: FantasyPoints BrandStyleGuide v6, "Game Day" direction. Exactly three colors
(#111111 / #F0F0F0 / #CC3333 — red is CTAs/highlights only), Kanit ExtraBold Italic uppercase
for display, Mulish for body, JetBrains Mono for numerals. All shared patterns are semantic
classes in `app/src/app/globals.css` (`.panel .ptitle .tbl .btn(.pri/.gho) .btn2 .chip .pill
.pos .res .youchip .eyebrow .page-head .field .toast`); the canonical spec is
`design/design_handoff_gameday_redesign/proto/brand.css` and the handoff README in that
folder. Use these classes for new UI rather than ad-hoc Tailwind. Action feedback fires the
global toast (`fireToast` from `components/toast.tsx`).

## Windows-specific traps (these have bitten before)

- **Never rewrite source files with PowerShell `Get-Content`/`Set-Content`** — PS 5.1 reads
  UTF-8 as ANSI and mojibakes em dashes/emoji, and bracketed paths like `[slug]` break
  non-literal cmdlets. Use the Edit/Write tools, or Python (`app/scripts/rebrand_sweep.py`
  shows the demojibake pattern if it ever happens again).
- `psql` isn't on PATH: `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -c "..." "<dsn>"`,
  flags BEFORE the DSN (Windows getopt doesn't permute).
- Git commit messages via PS here-strings must not contain double quotes.

## Repo & docs

- GitHub: `cwecht15/FPFantasyLeague` (private, branch `master`, remote `origin`). Push after
  committing; deploy is manual via flyctl.
- `SETUP.md` — original infra bootstrap; `tools/scoring/README.md` — pipeline + scheduler
  reference; `design/design_handoff_gameday_redesign/README.md` — the full UI spec.
- The NFL source DB schema is documented in `../NFL_Database_Guide/` (separate folder).
