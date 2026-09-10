# Weekly projections (`tools/weekly_proj/`)

The in-season successor to `tools/draft_guide/`. Projects every player for one week under
the league's own stored scoring rules and renders a self-contained page:
matchup previews, all 12 lineups with start/sit advice, the full board, and free agents.

Read-only everywhere. It never writes to the app database and never touches the site.

## Run it

```powershell
$py = "C:\Users\cwech\anaconda3\python.exe"
& $py -m tools.weekly_proj.run_week --refresh
```

That is the whole thing. It takes about a minute and ends with the path to
`out/week_<NN>_projections.html`, which gets published as an artifact.

**Republish to the same artifact every week** so the owner keeps one link, with the week in
the page title and earlier weeks kept as artifact versions:
`https://claude.ai/code/artifact/35345405-ea11-42b1-a05a-4dd7a7a06795`
(pass that as `url`; omit `favicon` and `capabilities` on a republish).

- `--refresh` refetches the sheet. **Needed for every rerun in the same week**, because the
  first fetch of a week refuses to overwrite its own snapshot.
- `--skip-fetch` rebuilds from the snapshot already on disk, with no network calls.
- `--week N` asserts the sheet holds week N and fails if it does not.

Rerun it whenever the sheet moves: injury news, a starter ruled out, a line moving.
Nothing is cached between runs except the sheet snapshot itself.

Individual steps stay separately runnable for debugging, in this order:

```powershell
& $py -m tools.weekly_proj.snapshot_rules
& $py -m tools.weekly_proj.fetch_week --refresh
& $py -m tools.weekly_proj.coach_week
& $py -m tools.weekly_proj.project_week
cd app
npx tsx ../tools/draft_guide/score_projections.ts `
  ..\tools\weekly_proj\out\wk02\projected_stat_lines.csv `
  ..\tools\weekly_proj\out\wk02\projected_points.json `
  ..\tools\weekly_proj\out\league_rules.json
cd ..
& $py -m tools.weekly_proj.league_week
& $py -m tools.weekly_proj.build_week
& $py -m tools.weekly_proj.validate
```

## How it works

**Volume** comes from the weekly FantasyPoints workbook, "NFL Projections - Weekly
(2026 - v2.0)". The `Weekly_Projections` tab supplies dropbacks, attempts, completions,
targets, receptions, yards and touchdowns, keyed by GSIS id. It has no routes and no sacks,
so those come from `Working_Player_Proj`, which covers the identical set of players.
Team-level dropbacks, projected points, spreads and totals come from `Team_Projections`
and `Odds`.

**Rates** are reused from the draft guide, unchanged: `out/player_rates.csv` (shrunk
2024+2025 charting rates), `out/rookie_priors.csv` (draft-capital buckets for players with
no NFL history) and `out/coach_stat_lines.csv` (each staff's play-action rate, motion rate
and per-game fourth-down, second-and-long and deep-shot tendencies). Nothing here re-runs
that SQL, so a weekly build does not need the local NFL_Data database at all, except the
first time it fits the score deviation, which is then cached in `out/score_sigma.json`.

**Volume times rate** gives a projected charting line, which the app's own `scoreStatLine`
scores under the rules pulled fresh from prod at the start of every run. Two inputs skip the
rate model because the sheet knows better: incompletions are attempts minus completions, and
sacks are the sheet's own projection.

**The coaching slot** scales play-action and motion dropbacks by this week's projected
dropbacks, takes the per-game situational tendencies straight from the season model, and
gets its two result components from the market. Win probability is the normal CDF of the
spread over a margin deviation of sqrt(2) times the score deviation, about 12.8 points.
The 30-point bonus uses the season model's own formula on the sheet's projected team points.
The spread's orientation is proven each run by correlating it against the sheet's own
projected point differential, rather than assumed.

**Start/sit** solves each lineup twice: once ignoring kickoff locks, and once with every
locked slot pinned. The advice comes from the second, so every move listed could still be
made when the page was built. Moves are reported as players in and out, not slot by slot,
because two starters trading WR1 and WR2 changes nothing. `validate.py` checks the greedy
assignment against a max-weight matching for all 12 teams every run.

## Caveats

- **The sheet holds one week and is overwritten.** Each run snapshots into `out/wk<NN>/`
  and refuses to overwrite without `--refresh`. A week never captured is gone.
- **`Working_Player_Proj` is a working tab**, wide and full of repeated `2025`/`L5`/`Career`
  labels. Columns are resolved by unique label and the run fails loudly on drift rather than
  scoring someone zero. `validate.py` also bands routes per dropback, which is where a
  column mix-up would show first.
- **Rates are 2024+2025 only.** NFL_Data had no 2026 rows as of 2026-09-10. Rookies lean
  entirely on draft-capital priors and are the least reliable line on the page. When 2026
  charting lands, re-run `tools.draft_guide.rates` with 2026 in `SEASONS` and every weekly
  build picks it up; `validate.py` warns once the rate files pass 45 days old.
- **Every projection is an expectation.** Nobody scores theirs. The coaching slot is the
  clearest case: a win is worth 3 points but the projection carries the probability of one.
- **Quarterback projections deliberately disagree with the industry.** Correlation with the
  sheet's own DraftKings points is 0.98 for running backs, receivers and tight ends but only
  0.38 for quarterbacks, because this league pays for throw quality and taxes incompletions
  instead of paying for yards and touchdowns. That gap is the reason this tool exists.

## Accuracy log

Track projected against actual after each week posts, using `player_week_scores` on prod.

| Week | Built | Notes |
| --- | --- | --- |
| 1 | 2026-09-10 | Built after the Wednesday and Thursday games, so week 1 was a dry run. Cross-checked against the season draft-guide board: Spearman 0.97 WR, 0.95 RB, 0.93 TE, 0.80 QB. |
