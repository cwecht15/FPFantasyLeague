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
   settings, run the Scoring Lab. There are **no per-league commissioners**. Regular users
   join by invite code or admin assignment; they cannot create leagues. **No trades**
   (removed 2026-08-14): rosters change only via draft, free agency, and waivers — the
   Trades tab is gone and `/trades` redirects home; `lib/trades/*` stays dormant.
2. **Each user is in exactly one league.** `/leagues` redirects to it (join screen if none;
   admins → `/admin/leagues`). There is no "my leagues" list page.
3. **No kickers, no defenses.** Offense only: QB/RB/WR/TE + FLEX, plus the **COACH slot** —
   each NFL team's coaching staff is a draftable synthetic player (`COACH-XX`, position
   `COACH`) scored on team scheme/results (play-action dropbacks 0.2, motion dropbacks 0.1,
   win +5, 30+ points scored +10; optional 4th-down go, **designed run on 2nd & 7+** (a
   negative playcalling tax) and **deep shot — 15+ air yards — on 2nd & 1-2**; see
   `CoachingRules`). The pipeline still pushes K/DST stat lines (future-proofing) but the UI
   and roster templates exclude them. The owner calls the COACH slot "PC" in conversation.
   **House roster** (`DEFAULT_ROSTER_TEMPLATE`): QB / RB / RB / WR / WR / TE / FLEX / COACH
   + 4 BENCH — 8 starters, 12 total, **no IR**.
4. **No live scoring.** Scores exist only after the weekly charting push. Unscored values
   render an em dash `—`, never 0.00 or a spinner. Copy rhythm: *set lineup → slots lock at
   kickoff → results post Tuesday 6:00 AM ET*.
5. **Thursday-noon data lock.** A REG week becomes FINAL at 12:00 ET the Thursday after its
   last kickoff. The pipeline refuses to overwrite locked stat lines (`--force` overrides);
   the app never re-scores or re-rolls a locked, already-scored week. See
   `app/src/lib/nfl/locks.ts` and `_stats_locked` in `tools/scoring/pipeline.py`.
6. **Playoffs: in-league bracket, top 6 by wins, points-for breaks ties** (confirmed
   2026-08-14; `playoffConfig.mode = "bracket"` is now the **default** and every existing
   league was migrated). Top 6 by **wins** — PF is the only tiebreaker, which is exactly the
   standings rank (`recomputeStandings`: wins desc, then PF desc) — over weeks 15/16/17;
   seeds 1–2 first-round byes, re-seeded each round (best vs worst), higher seed hosts, a
   tied playoff game advances the higher seed. The worker's rollup auto-creates/advances the
   bracket once the regular season is final (`lib/matchups/playoffs.ts`); playoff matchups
   are `is_playoff` and never count toward standings. `scripts/set-playoff-mode.ts <slug|all>
   bracket [teams] [startWeek] [--prod]` changes it.
   **The cross-league championship sprint is retired** (2026-08-14): the `/championship` page,
   its nav link, and the league-home sprint banner were removed in favor of a playoff-race
   banner. `mode = "championship"` survives only so old stored configs parse; the
   `championship_entries` table and `lib/championship/*` are dormant, not wired to any page.
7. **House scoring = `fp_advanced` preset** (default for new 12-team leagues). One unified,
   additive rule set scores every slot (there is **no** separate "QB advanced mode" — that
   was removed). QBs: basic passing-yards/TD turned off, scored instead on 5+ air-yard
   passing production (0.25/yd, 0.5/1D, 4/TD), sacks −1, INT −2, EPA-per-dropback ×10 (an
   EPA-total × option also exists), plus an optional **incompletion** penalty (att − comp,
   QB only — for taxing high-volume inaccuracy) — these passing/EPA components score **QB
   only**; QB rushing scores at the standard rate. RB/WR/TE: PPR. **Missed tackles forced
   score RBs only (+2)**; **per-route separation scores WRs only**. The Scoring Lab also
   exposes rush/rec MTF splits, rec YACO, receiving first downs, **first-read targets**,
   explosive plays (combined 15+ yd, **or the splits: explosive rush 10+ yd and explosive
   reception 15+ yd, each at its own rate — use the splits or the combined value, not
   both**), per-grade separation, **expected fantasy points (xFP) as a
   per-position multiplier** (e.g. TE ×1.25), and the COACH rules. **Which positions earn
   each multi-position advanced stat is admin-configurable** via the Lab/settings *position
   scope* matrix (`AdvancedRules.scope`), defaulting to `ADVANCED_SCOPE_DEFAULTS` in
   `scoring-systems.ts` (explosives/rushing-detail/MTF → RB, separation/Re1D → WR, other
   receiving stats → all pass-catchers); `score-stat-line.ts` reads it via `scopeHasPosition`.
   The passing block stays QB-only (fixed `PASSING_POSITIONS`).
8. **Email/password auth only.** No Google OAuth (owner decision — don't re-suggest it).
9. Demo leagues (`leagues.is_demo`) are visible to site admins only, everywhere.
10. **Season 1 is a single 12-manager league run as a slow draft with NO pick clock**
    (`draftConfig.secondsPerPick = 0` → no deadline, no countdown, no autopick, worker not
    needed during the draft). Don't assume a clock exists; `set-draft-clock.ts` changes it.
11. **Game-lock free agency + FAAB waivers** (decided 2026-08-13; the `faab` waiver mode,
    default for every league — `set-waiver-mode.ts` switches). A player is an instant
    free-agent add until their NFL team's game kicks off; from kickoff they are **locked
    wherever they are** (lineup, bench, or pool — no adds, no drops) until claims process
    **Wednesday 3:00 AM ET**. Locked free agents take blind FAAB bids ($100/season/team,
    `teams.faab_budget`); highest bid wins, **ties go to the worse record** (then lower PF,
    then earlier claim; bids hidden from other managers while pending). After processing,
    everyone unclaimed is a free agent again. Locks derive from the **season schedule**
    (`nfl_games` via `lockedNflTeams` in `lib/transactions/game-lock.ts`), not
    `player_week_games` — same for in-week lineup kickoff locks (`kickoffMap` falls back to
    the team schedule until the stats push lands). The worker must be scaled up for claims
    to actually process; nothing locks until the season's schedule is pushed to `nfl_games`.

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
- `dev-playoffs-e2e.ts` — bracket-mode playoffs: seeding w/ PF tiebreak, byes, tie
  advancement, reseeding, standings isolation
- `dev-fp-advanced-check.ts [season]` — full-season leaderboards under the house preset
- `dev-demo-league.ts` / `dev-demo-season.ts` — rebuild the two admin-only demo leagues
- `dev-redesign-check.ts` — exercises dashboard/matchup-detail data paths
- `dev-slow-draft-rehearsal.ts [users] [secondsPerPick] [rounds] [season]` — create/reset a
  rehearsal league (`rehearsal-N@fpfl.dev` / `rehearsal123!`) for a live multi-browser draft.
  Pass `0` for the clock to rehearse no-clock mode; use season 2026 on prod (ranks off 2025).
- `set-draft-clock.ts <slug> <seconds>` — set/disable a league's pick clock (`0` = no clock),
  including mid-draft (updates config, the live draft row, and the current pick's deadline)
- `set-playoff-mode.ts <slug> <bracket|championship> [teams] [startWeek]` — switch a league
  between in-league bracket playoffs and the default championship-sprint-only mode
- `dev-email-test.ts <to>` — verify the configured mail transport end to end (auth + a real
  send, reports accepted/rejected); use it instead of inferring from missing notifications

Note `advanceExpiredDrafts` scans **globally**, so a stale in-progress draft elsewhere in the
dev DB will also autopick during tests — assert on your own draft, not on the returned count.

Pipeline (from the **repo root**, with the Anaconda Python):

```powershell
C:\Users\cwech\anaconda3\python.exe -m tools.scoring.push_scores --test-conn
C:\Users\cwech\anaconda3\python.exe -m tools.scoring.push_scores --season 2026 --current
C:\Users\cwech\anaconda3\python.exe -m tools.scoring.push_scores --season 2024 --week 1 --skip-players --skip-schedule
# --force overrides the Thursday-noon lock; --dry-run computes without writing
```

Deploy: `flyctl deploy --remote-only --yes` from `app/`. Secrets are already set on the app
(`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `EMAIL_FROM`, `SMTP_USER`, `SMTP_PASS`); change
via `flyctl secrets set`.

**The worker is kept scaled to zero to cut cost, and every deploy recreates it** (plus a
standby). After each `flyctl deploy`, run `flyctl scale count worker=0 -a fpfl-fantasy --yes`
and confirm with `flyctl scale show`; the destroy occasionally half-fails, so verify rather
than assume. Scale it back up (`worker=1`) whenever scoring pushes, waivers, or draft clocks
need to run — with the worker down, `score_dirty` never drains and pick clocks never expire.

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
- **Outbound email** (`lib/notifications/service.ts`) picks the first configured
  transport: SMTP (`SMTP_USER` + `SMTP_PASS`, host defaults to Gmail — the pass is a
  Google *App Password*, needs 2FA on the account; spaces in it are stripped), else Resend
  (`RESEND_API_KEY`, which only delivers to the account owner until a sending domain is
  verified), else it just logs. `EMAIL_FROM` defaults to `SMTP_USER` when unset. **Live
  config: Gmail SMTP as `cwecht8@gmail.com`** — no sending domain was bought, so there is
  no Resend key anymore. Send failures are swallowed by design; verify with
  `dev-email-test.ts` and check `flyctl logs` (an `[email:dev]` line means no transport was
  configured). Waiver emails come from the worker, so they need it scaled up; password
  resets, on-the-clock draft alerts and trade notices come from the web app.
  **`EMAIL_MODE=log` is set in `.env.local`** so local servers/scripts log instead of really
  sending (the local env shares the real Gmail creds — a local test draft once emailed fake
  `@fpfl.dev` users and bounced into the owner's inbox). Fly doesn't set it, so prod sends;
  `dev-email-test.ts` bypasses it deliberately.
- **Never print a secret.** Pipe values from the gitignored file straight into
  `flyctl secrets set` (`$e = @{}; Get-Content .env.local | ForEach-Object { if ($_ -match
  '^([A-Z_]+)="?([^"]*)"?$') { $e[$matches[1]] = $matches[2] } }`) — a plain `grep`/
  `Select-String` for a key name echoes the value into the transcript.
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
on `(draft_id, gsis_id)` is the hard double-pick guard. `secondsPerPick = 0` means **no
clock**: picks get a NULL `deadline_at`, so the worker's scan never sees them and nothing
autopicks (honored in `startDraft`, pick advancement, and pause/resume). Available players and
best-available autopick are ranked by **prior-season points under that league's own scoring
rules** — `seasonPointsByPlayer` re-scores every stat line via `scoreStatLine` and caches per
(season, rules JSON) for 10 min, since the draft room polls every 12s. The draft room groups
availables by position (top 12 each, "see all" per group), shows G / FPTS / FPTS/G with
click-to-sort, a position rank over the whole available pool, and a My-roster panel counting
drafted players against the template's starter needs. Rounds are generated from
`draftConfig.rounds` — if the roster template changes mid-draft, unmade trailing rounds must
be deleted or teams draft more players than they have slots.

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

**Scoring Lab** (`/admin/scoring-lab`): admin-only what-if scoring over past stat lines,
nothing written. `lab-form.ts` is the single field list — `LAB_FIELD_GROUPS` (rendered by
`RuleFieldsets`, shared with league settings), `ruleValue` for pre-fill, `rulesFromForm` for
parsing; **a new scoring component must be added in all three places** plus
`scoring-systems.ts`, the Zod schema in `leagues/settings.ts`, `score-stat-line.ts`,
`stat-row.ts` (easy to miss — an unmapped column silently scores 0), and `rules-card.ts`.
The Lab has a preset loader (fills every field + scope checkbox client-side), sortable
leaderboard columns, and a Scoring card overlay built from the live form values. Saved sets
(`scoring_sets`) can be picked when creating a league — the dropdown value is `set:<id>`.

**Scoring card** (`/leagues/[slug]/scoring-card`, outside the `(app)` group so it has no
nav/ticker): screenshot-friendly rendering of a league's active rules, shared with the Lab
overlay via `ScoringCardView` + `rules-card.ts`. Copy-as-image/PNG (html-to-image, capture
`.card-shot`, skip `.card-toolbar`) and print/PDF (light-palette `@media print`). **Only
components that actually score are rendered** — zeroed rules are omitted, not shown as "off".

**UI system**: FantasyPoints BrandStyleGuide v6, "Game Day" direction. Exactly three colors
(#111111 / #F0F0F0 / #CC3333 — red is CTAs/highlights only), Kanit ExtraBold Italic uppercase
for display, Mulish for body, JetBrains Mono for numerals. All shared patterns are semantic
classes in `app/src/app/globals.css` (`.panel .ptitle .tbl .btn(.pri/.gho) .btn2 .chip .pill
.pos .res .youchip .eyebrow .page-head .field .toast`); the canonical spec is
`design/design_handoff_gameday_redesign/proto/brand.css` and the handoff README in that
folder. Use these classes for new UI rather than ad-hoc Tailwind. Action feedback fires the
global toast (`fireToast` from `components/toast.tsx`). Positions are distinguished by fill
weight rather than hue to stay inside the three-color rule: `.pos.QB/RB/WR/TE/COACH` chips and
matching `.pk-*` draft-board accents (flame QB, solid-paper RB, outlined WR, tinted TE, dashed
COACH).

## Windows-specific traps (these have bitten before)

- **Never rewrite source files with PowerShell `Get-Content`/`Set-Content`** — PS 5.1 reads
  UTF-8 as ANSI and mojibakes em dashes/emoji, and bracketed paths like `[slug]` break
  non-literal cmdlets. Use the Edit/Write tools, or Python (`app/scripts/rebrand_sweep.py`
  shows the demojibake pattern if it ever happens again).
- `psql` isn't on PATH: `& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -c "..." "<dsn>"`,
  flags BEFORE the DSN (Windows getopt doesn't permute).
- Git commit messages via PS here-strings must not contain double quotes — and the classifier
  may block a here-string commit outright; repeated `-m` flags work.
- `grep -P` is unavailable in the bash shim (use `awk`), and `/tmp` paths from bash don't
  resolve for Windows `node`/`esbuild` — use the scratchpad dir with a real Windows path.
- Non-ASCII (em dashes, middots) passed through `curl -d` from bash gets mangled by the
  console codepage. Node's `fetch`/`nodemailer` handle UTF-8 correctly — don't "fix" the app
  based on a mojibaked curl test.

## Repo & docs

- GitHub: `cwecht15/FPFantasyLeague` (private, branch `master`, remote `origin`). Push after
  committing; deploy is manual via flyctl.
- `SETUP.md` — original infra bootstrap; `tools/scoring/README.md` — pipeline + scheduler
  reference; `design/design_handoff_gameday_redesign/README.md` — the full UI spec.
- The NFL source DB schema is documented in `../NFL_Database_Guide/` (separate folder).
