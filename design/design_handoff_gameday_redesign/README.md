# Handoff: FPFL "Game Day" Redesign

Target codebase: **`cwecht15/FPFantasyLeague`** (`app/` — Next.js 16 App Router, Tailwind v4, Drizzle, Auth.js).
This redesign was built *from* that codebase: every screen below maps to an existing route or a small new one, and it uses the brand tokens **already defined in `app/src/app/globals.css`** (BrandStyleGuide v6).

## Overview

A full visual + UX redesign of the FP Fantasy League app in the chosen **"Game Day"** direction: red news ticker, red rule under the header, Kanit ExtraBold Italic display type, scoreboard-style panels, slanted (skewed) chips/buttons, and a dashboard-style league home. It covers every manager page, all admin surfaces (Scoring Lab, league management), and three *new* screens: a league-home dashboard, a head-to-head matchup detail, and a weekly-scoring matrix.

## About the Design Files

The files in this bundle are **design references created in HTML/React (Babel-in-browser)** — a clickable prototype showing intended look and behavior, **not production code to copy directly**. The task is to **recreate these designs inside the existing Next.js app** (`app/src/app/...`) using its established patterns: RSC pages + Server Actions, Tailwind v4 `@theme` tokens, the existing `display` / `label` / `btn-flame` / `btn-ghost` / `input` / `ticker` / `red-rule` / `slant` utility classes. Extend `globals.css` where the prototype introduces new shared patterns (see Design Tokens & New CSS Patterns).

Open **`FPFL Prototype.html`** in a browser to click through everything. Page implementations live in `proto/pages1.jsx` … `proto/pages6.jsx` (see Files at the bottom). The mock data layer (`proto/data.js`) stands in for the real Drizzle queries — every field it fakes exists in the real schema.

## Fidelity

**High-fidelity.** Colors, typography, spacing, table treatments, and copy are final intent. Recreate pixel-perfectly with the codebase's existing Tailwind tokens. The only prototype-isms to ignore: the floating "Tweaks" panel, `localStorage` page routing, and the mock data generators.

## Product rules the design assumes (confirmed)

1. **Each user is in exactly one league** → there is no "My leagues" list. Signing in lands on **League Home** (`/leagues/[slug]`, or redirect `/leagues` → the user's league).
2. **No live scoring.** Scores exist only after the weekly charting run. The UI rhythm everywhere is: *set lineup → slots lock at kickoff → results post Tuesday 6:00 AM ET*. Unscored cells render an em dash `—`; never a spinner or live number.
3. **Central administration** — no commissioners. Admin-only surfaces are gated on `users.is_site_admin`.
4. Offense only (QB/RB/WR/TE + FLEX); championship = cross-league sprint, weeks 15–17.

## Global Shell (all signed-in pages)

Prototype source: `proto/shell.jsx`. Maps to `app/src/app/(app)/layout.tsx`.

1. **Ticker** (optional but designed-in): full-width red bar, top of viewport. `background: #cc3333`, Kanit italic 600, uppercase, 12px, `letter-spacing: 0.08em`, 6px vertical padding, marquee animation 36s linear infinite (respect `prefers-reduced-motion`). Content: week status + sprint reminder + "results post Tuesday 6:00 AM ET".
2. **Top nav**: wordmark left (`/brand/Wordmark-Primary.svg`, height 24px, links to league home). Right side, 22px gap, Mulish 700 13.5px: `Alerts` (with red count badge: 10px/800, 3px radius, `#cc3333` bg), `Championship`, admin-only `Scoring Lab` and `Manage Leagues`, user name in faint, ghost "SIGN OUT" button. Active link = full paper color.
3. **Red rule**: existing `.red-rule` (2px `#cc3333`) directly under the nav.
4. **League tabs** (league pages only): Kanit italic 700, 15px, uppercase, faint color; active tab = paper + `inset 0 -3px 0 #cc3333`. Order: Home · Lineup · Roster · Players · Matchups · Standings · Trades · Transactions · Draft · Settings.
5. Content container: max-width 1280px, 40px side padding.
6. **Toast** (action feedback): fixed bottom-center, skewed −8deg, flame bg, Kanit italic — used for "Lineup set", "Trade proposed", "Invite code copied", etc. ~2.4s auto-dismiss.

## Screens / Views

### 1. League Home — NEW PAGE (`/leagues/[slug]`, replaces current league home content for managers)
Prototype: `proto/pages1.jsx` → `HomePage`.
- **Header**: red Kanit-italic eyebrow "FOUNDERS LEAGUE · 2025 · 14 TEAMS"; h1 = the user's **team name** (Kanit italic 800, 56px, uppercase); sub line "12–2 · 1st place · 1,842.6 points for" (record bold paper, rest muted). Right: slanted flame chip "WEEK 15".
- **Two-panel grid** (1.1fr / 1fr, 16px gap):
  - **Week N matchup panel**: panel title bar ("WEEK 15 MATCHUP" + right-aligned faint "Results post Tue 6:00 AM ET"); centered team-vs-team with Kanit team names (20px), record subline, and 52px JetBrains Mono scores (— until scored); meta row "Lineup: 9/9 set · locks at kickoff | First lock: Sun 1:00 PM ET"; centered CTAs — flame slant button "SET LINEUP" (→ lineup) and ghost slant "FULL MATCHUP" (→ matchup detail); footer strip with last week's result: W/L square (22px, flame for W) + "Week 14 final — 124.6 – 101.2 vs …".
  - **Standings panel**: title + "All 14 teams →"; top-6 table (or top-5 + you if outside): rank in Kanit italic, your row tinted `rgba(204,51,51,0.10)` with a "YOU" outline chip, W–L / PF / PA in mono.
- **Sprint banner**: full-width surface card, 3px flame left border: Kanit title "CHAMPIONSHIP SPRINT — YOU'RE IN THE FIELD", one-line explainer, right link "Sprint leaderboard →" (underlined with 2px flame border-bottom).
- Existing admin blocks on this page (invite/assign/schedule) move to **Settings → Admin controls** (see #10).

### 2. Lineup (`/leagues/[slug]/lineup`)
Prototype: `proto/pages1.jsx` → `LineupPage`. Keeps the existing one-form/save-once model.
- Header: eyebrow = team name; h1 "WEEK 15 LINEUP"; right: week switcher (ghost ‹ › buttons + Kanit "Week N"; future weeks disabled).
- Above table: "Starter total: **—**" (mono; real number on past weeks) + flame slant "SET LINEUP" submit.
- **Starters panel**: table with columns Slot (mono 11.5px faint) / Player / Kickoff / Pts. Editable slots = existing `<select>` pattern restyled (`.input`, surface bg). Locked slots render read-only with a faint "LOCKED" tag. Eligibility per slot as today (`eligiblePositions`).
- **Bench / IR panel** below, same table, slot column "BN"/"IR".
- Past weeks: selects become plain text, Pts column filled, total filled.

### 3. Roster (`/leagues/[slug]/roster`)
`RosterPage`. Same data as today, restyled: panel-wrapped table (Player bold / Pos tag / NFL / Slot (W15) — starters in red Kanit / Season pts mono right / Acquired faint / Drop ghost button). Position tag: 30px min-width outline chip; QB variant uses flame outline. Footnote about drop rules.

### 4. Players (`/leagues/[slug]/players`)
`PlayersPage` (`proto/pages2.jsx`). Search input + two pill groups (position: ALL/QB/RB/WR/TE; view: All/Available/My team — active pill = paper bg, ink text). Table adds an **Owner** column ("Free agent" in bold paper when unowned). Row actions: flame "Add" / ghost "Drop" small buttons. Footnote: waiver-claim processing copy.

### 5. Matchups (`/leagues/[slug]/matchups`)
`MatchupsPage`. Week switcher in header. 2-col grid of matchup cards: each card = two rows (Kanit team name 19px + mono score 24px right; winner gets W square and full paper, loser muted), footer strip "FINAL / SCHEDULED" + "YOUR MATCHUP" (flame) + "Head-to-head →". **Your card gets a flame-tinted border** (`rgba(204,51,51,0.5)`). Cards link to the matchup detail.

### 6. Matchup Detail — NEW PAGE (suggest `/leagues/[slug]/matchups/[matchupId]`)
`MatchupDetailPage` (`proto/pages6.jsx`).
- Back link "← Week N matchups" as the red eyebrow. Title "WEEK N — FINAL" or "WEEK N MATCHUP".
- Score header inside the panel: both Kanit team names (24px, YOU chip on yours, W square on winner) + 46px mono totals.
- **Slot-by-slot grid**: 9 rows (QB, RB, RB 2, WR, WR 2, WR 3, TE, FLEX, FLEX 2). Each row `1fr 64px 1fr`: home player left, slot label centered (Kanit 12px faint), away player right (mirrored). Player cell = bold name + faint "POS · TEAM"; right-aligned value = **points (mono)** when final, **kickoff time** when pending; "LOCKED" tag once kicked off.
- Each side's **top scorer's points render in flame** on final matchups.
- Total row at bottom on ink background. Footnotes per state (charting/lock explanation).
- Data note: requires joining both teams' lineup slots for that week (`getLineupView` for each team) + `player_week_scores`.

### 7. Standings (`/leagues/[slug]/standings`)
`StandingsPage` (`proto/pages2.jsx`).
- Main table adds **Manager** and **Last 5** (row of 18px W/L squares) columns.
- After rank 2: the **"CHAMPIONSHIP SPRINT LINE"** divider — 2px flame rules flanking a 9.5px flame label.
- **NEW: Weekly scoring panel** below — horizontally scrollable matrix: rows = teams (standings order), columns W1…W(current−1) + Avg. Cell = mono 11.5px score; **win = bold paper, league-high of the week = flame**, losses faint. Legend in the panel title bar: "red = league high · bold = win".

### 8. Trades (`/leagues/[slug]/trades`)
`TradesPage` (`proto/pages3.jsx`). Status flow unchanged (proposed → accepted → applied / rejected / vetoed / expired; labels: "awaiting manager", "awaiting admin approval", "completed"…).
- Trade list: panel rows with sentence-style summary (bold names) + Kanit status chip (applied = flame bg; pending = surface; dead = pit/faint). Accept (flame) / Reject (ghost) buttons when proposed to you.
- **Propose a trade**: one panel — team `<select>` in the title bar; two columns separated by a hairline ("YOU SEND" / "YOU RECEIVE — team"); players as **toggleable pill chips** (selected = paper bg, ink text) instead of multi-selects; flame slant "PROPOSE TRADE" disabled until both sides have a selection.

### 9. Transactions (`/leagues/[slug]/transactions`)
`TransactionsPage`. Two panels: "Pending waiver claims" (team / claims **X** (dropping Y) / $bid mono / processes time) and "History" (Kanit type chip — waiver/trade/free agent/drop — team, +adds bold / −drops faint, timestamp right).

### 10. Settings (`/leagues/[slug]/settings`)
`SettingsPage` (`proto/pages4.jsx`).
- Manager view: read-only panels — **League** (name/season/teams/status/invite code in flame mono), **Roster template**, **Scoring — FP Advanced** (rule/value table, values mono right) with a charting footnote. Sub copy: "Read-only. Leagues are administered centrally…".
- **Admin view adds an "Admin controls" panel** (3 columns split by hairlines): Invite managers (code + Copy), Assign a manager (email input + Assign), Schedule (Generate schedule). Title-bar link "Edit scoring in the Lab →". This absorbs the admin blocks currently on the league home page.

### 11. Draft (`/leagues/[slug]/draft`)
`DraftPage` (`proto/pages3.jsx`). Async snake, all existing mechanics.
- **Status bar** panel: "Round 7, pick 85" faint + Kanit team-on-clock (22px) + slanted flame "YOUR PICK" chip when it's you; right side = 26px mono countdown to autopick (**flame when < 10 min**) over a tiny "TO AUTOPICK" label; admin Pause/Resume ghost button (paused state shows a "PAUSED" chip and freezes the clock). 3px flame left border when it's your pick.
- **Grid** (1.8fr/1fr): Available players (search + position pills in the title bar; rows with flame "Draft" — only when you can pick — and ghost "+Queue") | right column: **My queue** (numbered, ✕ remove, "autopick order" hint) and **Recent picks** (overall # mono, name, team, "(auto)" tag).
- **Draft board**: scrollable grid, 14 team columns (your column header in flame) × rounds; filled cells = surface bg with name (10.5px bold) + "POS · overall"; current pick cell = solid flame "ON CLOCK"; future = empty with faint overall number. Complete state: just the full board.

### 12. Championship (`/championship`)
`ChampionshipPage` (`proto/pages4.jsx`). Three states of one page:
- **Field locked** (pre-W15 results): table with seeds, all week cells —, totals 0.0; admin-only "Lock the field" card (ghost button + explainer).
- **Mid-run**: posted weeks filled; rows **sorted by cumulative total**; movement column vs seed (▲n flame / ▼n faint / —); leader's total in flame; chip "THROUGH WEEK 16"; sub notes "Week 17 pends charting".
- **Final**: champion banner — surface card, 3px flame left border, flame submark SVG (54px), red eyebrow "2025 CHAMPION", Kanit name 34px, total; ★ on the winner row; chip "FINAL — 2025".
- Columns: # / move / Team / League / Seed / W15 / W16 / W17 / Total. Footnote: seeding + tiebreak rules.

### 13. Alerts (`/alerts`)
`AlertsPage`. Panel rows: unread = flame-tinted border + red dot before the bold title, full opacity; read = 0.7 opacity. Timestamp right. Header right: ghost slant "MARK ALL READ (n)". Rows can deep-link (e.g. trade alert → Trades).

### 14. Sign in / Sign up (`/login`, `/signup`)
`LoginPage` (`proto/pages4.jsx`). Full-viewport stage: `Primary-Smoke.jpg` background under a `linear-gradient(rgba(17,17,17,0.80), rgba(17,17,17,0.95))` overlay (the existing `.smoke` pattern). Centered 400px card: pit bg, hairline border, **2px flame top border**; wordmark centered (22px tall); Kanit "SIGN IN" 30px centered; labeled fields (11px/800 tracked uppercase faint labels); full-width flame slant submit; links line. Below the card, outside: tagline "BOX SCORES LIE. THE FILM DOESN'T." (11.5px, 800, tracked, faint). Signup adds Display name field; same stage.

### 15. Scoring Lab — admin (`/admin/scoring-lab`)
`ScoringLabPage` (`proto/pages5.jsx`). Three stacked panels:
- **Scope**: 4-col grid of labeled selects (Season / Week incl. "Full season" / Position / Show top).
- **Rules**: fieldsets per group (Passing, Rushing, Receiving, Misc) — uppercase tracked legends, 5-col grid of small number inputs with faint unit hints. **QB advanced mode** in a `rgba(204,51,51,0.4)`-bordered box: checkbox + flame Kanit legend + explainer + 4-col inputs (existing `RuleFieldsets` semantics). Flame slant "RUN SCORING" + reassurance note.
- **Leaderboard** (after run): panel-titled, scope summary right; horizontally scrollable table — # / Player / Pos / Team / G / Points (bold) / PPG + one right-aligned mono column **per scoring component**, negative values in flame, missing = near-invisible dash. Keep the existing stat-definitions `<details>` from the current page.

### 16. Manage Leagues — admin — NEW PAGE (suggest `/admin/leagues`)
`AdminLeaguesPage` (`proto/pages5.jsx`). Replaces the admin-only create-league section of the old `/leagues` page.
- **All leagues table**: League / Season / Teams claimed "12 / 14" mono / Status chip (in season = flame bg; drafting = surface + border; setup = pit + faint) / Invite code (flame mono + Copy) / contextual action (Generate schedule · Pause draft · Open).
- **Create a league** panel: name, teams select (4–20), scoring preset select, flame slant "CREATE LEAGUE" (disabled until valid).
- **Assign a manager** panel: league select + email + ghost "ASSIGN", with the existing explainer copy.

## Interactions & Behavior

- Buttons: flame `.btn-flame` hover `opacity: .88`, active `translateY(1px)`. New **slant** buttons skew −8deg with inner content counter-skewed +8deg (see `.btn`/`.chip` in `proto/brand.css`).
- Panel/table row hover: surface bg; cards that navigate get `cursor: pointer` and stronger border on hover.
- All mutations give toast feedback (see Global Shell #6).
- Week switchers clamp to `1…currentWeek`; future disabled.
- Unscored anything = `—` in faint. Never show 0.00 for unscored.
- "YOU" treatments: row tint `rgba(204,51,51,0.10)`, flame rank numeral, outline chip.
- Reduced motion: ticker animation off.

## State Management

No new client state paradigms needed — everything maps to existing RSC + Server Actions. New data requirements: matchup detail (both lineups + per-player scores for a matchup), weekly-scoring matrix (all final matchups for the season — already queryable), sprint movement (seed vs. current rank — both already computed). The prototype's `proto/app.jsx` shows the navigation/ownership of state if anything is ambiguous.

## Design Tokens & New CSS Patterns

Already in `globals.css` (use as-is): `--color-ink #111111`, `--color-paper #f0f0f0`, `--color-flame #cc3333`, `--color-pit #161616`, `--color-surface #1b1b1b`, `--color-line rgba(240,240,240,.14)`, `--color-line-strong rgba(240,240,240,.28)`, `--color-muted .64`, `--color-faint .42`; fonts Kanit (display, italic 600–800, uppercase, line-height .95) + Mulish (body, 15px); `.display .label .ticker .red-rule .smoke .slant .btn-flame .btn-ghost .input`.

Add (specs in `proto/brand.css`): **JetBrains Mono** for all numerals/scores/codes (or `font-mono` if you prefer no new font); `.panel` (pit bg + hairline border, square corners) + `.ptitle` title bar; `.tbl` table treatment (10.5px/800 tracked uppercase faint headers, hairline row borders); slant button/chip; pill filters; pos tag; W/L result square; you-row tint + chip; toast. Density: the prototype demonstrates a compact mode via a `--pad` multiplier (1 → 0.62) on paddings — optional.

Type scale: page h1 56px / panel titles 17px / Kanit team names 19–24px / body 13.5–15px / table 13.5px / mono numerals 13px (tables) up to 52px (scores) / labels 10.5–11px 800 tracked uppercase. Never below 11px.

## Assets

All from the existing repo at `app/public/brand/` (copies bundled here): `Wordmark-Primary.svg` (nav, login), `Submark-Red.svg` (champion banner), `Lettermark-Primary.svg` (optional footers), `Primary-Smoke.jpg` (auth stage). No new assets. No icons anywhere — typography and squares only.

## Files

- `FPFL Prototype.html` — entry point; open in a browser to click through.
- `proto/brand.css` — **the canonical stylesheet**: every shared pattern with exact values.
- `proto/shell.jsx` — ticker, nav, tabs, panel, toast.
- `proto/pages1.jsx` — Home, Lineup, Roster · `pages2.jsx` — Players, Matchups, Standings (+weekly matrix) · `pages3.jsx` — Trades, Transactions, Draft · `pages4.jsx` — Championship, Alerts, Login, Settings · `pages5.jsx` — Scoring Lab, Manage Leagues (admin) · `pages6.jsx` — Matchup detail.
- `proto/data.js` — mock data; field names mirror the real schema.
- `proto/app.jsx` — routing/state wiring; `tweaks-panel.jsx` — prototype-only review tooling (ignore).

## Suggested implementation order

1. `globals.css` additions (panel/tbl/slant/pill/toast patterns) + shell (ticker, nav, tabs).
2. League Home dashboard + redirect from `/leagues`.
3. Restyle existing pages (Lineup, Roster, Players, Matchups, Standings, Trades, Transactions, Settings, Alerts, Auth).
4. New: Matchup detail route, weekly-scoring matrix, championship states.
5. Admin: Scoring Lab restyle, Manage Leagues page, Settings admin controls, draft pause UI.
