# Draft guide pipeline (2026)

Generates `out/draft_guide_2026.html` — projections for every draftable player (plus the
32 COACH slots) under the **live scoring rules of `scott-bear-bowl-2026-5e71b3`**, which
are a fully custom charting-only system (no yards/TDs/receptions — throw quality,
separation grades, MTF/YACO/explosives, first-read targets, playcalling). Everything is
read-only against its sources.

## Re-run before the draft

From the repo root, with the Anaconda Python:

```powershell
$py = "C:\Users\cwech\anaconda3\python.exe"
# 0. refresh the live rules snapshot if league settings may have changed:
#    (scratch script pattern — SELECT scoring_rules -> out/league_rules.json; see git history)
& $py -m tools.draft_guide.fetch_sheet --refresh   # season sheet -> out/sheet_*.csv
& $py -m tools.draft_guide.rates                   # veteran rates from NFL_Data (2024+2025)
& $py -m tools.draft_guide.rookies                 # rookie priors by draft capital
& $py -m tools.draft_guide.coach_model             # COACH stat lines + wins model
& $py -m tools.draft_guide.project                 # merge -> out/projected_stat_lines.csv
cd app; npx tsx ../tools/draft_guide/score_projections.ts; cd ..   # real engine scores
& $py -m tools.draft_guide.vor                     # ranks/VOR/tiers -> out/projections.json
& $py -m tools.draft_guide.build_guide             # inject into template.html -> the guide
& $py -m tools.draft_guide.backtest                # optional: rate-model validation
```

## How it works (one paragraph)

Volume (games, dropbacks, carries, targets, routes) comes from the owner's season sheet
(`Player_Projections`, GSIS-keyed). Every scoring stat is a per-volume rate derived from
NFL_Data charting (2024x0.35 + 2025x0.65, shrunk toward position means with per-stat
pseudo-samples in `rates.K`; stat definitions copied from `tools/scoring/aggregate.py`).
Rookies get rookie-year rates of 2021-2025 draftees at the same position/draft-capital
bucket (`rookies.py`; 2026 class + picks from the cached nflverse roster CSV). Coaches:
scheme rates per team with a 50% regression for new playcallers (`coaching_current` vs
2025), volume from `Projections_Research` team CSVs, Pythagorean wins from the sheet's
own PF/PA. Scoring runs through the app's real `scoreStatLine` on the per-game average
line x games — exact because the league rules are linear; the COACH 30-point bonus is
added as an expectation (`exp30`) after scoring.

## Draft-day tracking

The published guide is a live draft board two ways:

- **Tap the dot** next to any player to mark them drafted (strike + dim; "Hide drafted"
  chip filters the board). On claude.ai the state is shared live across every open view
  via the artifact `db` capability (doc `draft/board`); opened as a local file it falls
  back to that browser's localStorage.
- **Real league picks**: `sync_draft.py` reads the prod draft (read-only) and writes
  `out/draft_state.json`; `build_guide.py` bakes those picks in (with pick numbers) and
  a republish pushes them to the page. Baked picks can't be un-toggled. During a live
  draft session, ask Claude to loop sync -> build -> republish every few minutes.

## Known caveats

- Backtest (2024 rates -> 2025 volume): Spearman ~0.90 RB/TE, ~0.75 QB/WR. Charting
  rates are noisy for QBs/WRs — trust tiers over exact ranks.
- Sheet columns are resolved by header; `fetch_sheet` caches to `out/` and only refetches
  with `--refresh`. The ADP tab joins by name+team (its IDs are not GSIS).
- `league_rules.json` is a snapshot; re-pull it if scoring settings change (the guide's
  scoring cards and every point value depend on it).
- QB sack rates prefer `qb_sack_rate_projections_2026_weighted.csv`; QBs who changed
  teams get an extra 15% shrink on throw-quality rates.
