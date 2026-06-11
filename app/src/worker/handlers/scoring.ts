/**
 * score_week + rollup_matchups job handlers.
 *
 * score_week payload: { season, seasonType?, week?, leagueIds? }
 *   - week omitted → every week with stats (full re-score after rule edits)
 *   - leagueIds omitted → every league for that season
 *   After scoring, enqueues rollup_matchups per league-week.
 *
 * rollup_matchups payload: { leagueId, season, week }
 */

import { enqueue } from "@/lib/jobs/queue";
import {
  leagueIdsForSeason,
  scoreWeekForLeague,
  weeksWithStats,
} from "@/lib/scoring/score-week";
import { recomputeStandings, rollupLeagueWeek } from "@/lib/matchups/rollup";
import { registerHandler } from "../handlers";

registerHandler("score_week", async (payload) => {
  const season = Number(payload.season);
  const seasonType = String(payload.seasonType ?? "REG");
  if (!season) throw new Error("score_week: payload.season required");

  const weeks = payload.week ? [Number(payload.week)] : await weeksWithStats(season, seasonType);
  const leagueIds = await leagueIdsForSeason(
    season,
    Array.isArray(payload.leagueIds) ? payload.leagueIds.map(Number) : undefined,
  );

  for (const leagueId of leagueIds) {
    for (const week of weeks) {
      const written = await scoreWeekForLeague(leagueId, season, seasonType, week);
      console.log(`[score_week] league=${leagueId} ${season} ${seasonType} W${week}: ${written} rows`);
      if (seasonType === "REG" && written > 0) {
        await enqueue("rollup_matchups", { leagueId, season, week });
      }
    }
  }
});

registerHandler("rollup_matchups", async (payload) => {
  const leagueId = Number(payload.leagueId);
  const season = Number(payload.season);
  const week = Number(payload.week);
  if (!leagueId || !season || !week) {
    throw new Error("rollup_matchups: leagueId/season/week required");
  }
  const n = await rollupLeagueWeek(leagueId, season, week);
  await recomputeStandings(leagueId, season);
  console.log(`[rollup] league=${leagueId} ${season} W${week}: ${n} matchups, standings updated`);
});
