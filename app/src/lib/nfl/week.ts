/**
 * Week helpers. "Current week" for a league season = the smallest week whose
 * games are not all final (i.e. the week being played / set next), falling back
 * to the latest week with any data, then week 1.
 */

import { and, eq, max, min, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchups, playerWeekStats } from "@/lib/db/schema";

export const REG = "REG";

/** Latest REG week with pushed stats for a season (0 if none). */
export async function latestStatsWeek(season: number): Promise<number> {
  const [row] = await db
    .select({ w: max(playerWeekStats.week) })
    .from(playerWeekStats)
    .where(and(eq(playerWeekStats.season, season), eq(playerWeekStats.seasonType, REG)));
  return row?.w ?? 0;
}

/** The week a league is "on": one past the latest scored stats, capped at 18. */
export async function currentWeek(season: number): Promise<number> {
  const latest = await latestStatsWeek(season);
  return Math.min(Math.max(latest, 1), 18);
}

/** League-aware current week: the earliest matchup week not yet final (i.e.
 *  the week being played/set next). Falls back to week 1 with no schedule. */
export async function leagueCurrentWeek(leagueId: number, season: number): Promise<number> {
  const [row] = await db
    .select({ w: min(matchups.week) })
    .from(matchups)
    .where(
      and(
        eq(matchups.leagueId, leagueId),
        eq(matchups.season, season),
        ne(matchups.status, "final"),
      ),
    );
  if (row?.w) return row.w;
  // all final (season over) → last week with matchups; no schedule → week 1
  const [last] = await db
    .select({ w: max(matchups.week) })
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, season)));
  return last?.w ?? 1;
}
