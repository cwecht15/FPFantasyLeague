/**
 * score_week: apply a league's scoring rules to pushed player_week_stats and
 * idempotently upsert player_week_scores. Recompute-from-source — safe to run
 * any number of times; stat corrections and rule edits are handled by simply
 * re-running for the affected slice.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  leagues,
  leagueSettings,
  players,
  playerWeekScores,
  playerWeekStats,
} from "@/lib/db/schema";
import { scoreStatLine } from "@/lib/scoring/score-stat-line";
import { statRowToLine } from "@/lib/scoring/stat-row";

const UPSERT_CHUNK = 500;

/** Score one league for one (season, seasonType, week) slice. Returns rows written. */
export async function scoreWeekForLeague(
  leagueId: number,
  season: number,
  seasonType: string,
  week: number,
): Promise<number> {
  // Locked weeks are FINAL: once scored, never recomputed (Thursday-noon rule).
  // A league that has never scored the week (e.g. created later) may still
  // compute it for the first time.
  if (seasonType === "REG") {
    const { isWeekDataLocked } = await import("@/lib/nfl/locks");
    if (await isWeekDataLocked(season, week)) {
      const [existing] = await db
        .select({ gsisId: playerWeekScores.gsisId })
        .from(playerWeekScores)
        .where(
          and(
            eq(playerWeekScores.leagueId, leagueId),
            eq(playerWeekScores.season, season),
            eq(playerWeekScores.seasonType, seasonType),
            eq(playerWeekScores.week, week),
          ),
        )
        .limit(1);
      if (existing) {
        console.log(`[score_week] league=${leagueId} ${season} W${week}: locked — skipped`);
        return 0;
      }
    }
  }

  const [settings] = await db
    .select({ rules: leagueSettings.scoringRules, version: leagueSettings.version })
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  if (!settings) throw new Error(`league ${leagueId} has no settings`);

  const rows = await db
    .select({ stat: playerWeekStats, position: players.position })
    .from(playerWeekStats)
    .leftJoin(players, eq(playerWeekStats.gsisId, players.gsisId))
    .where(
      and(
        eq(playerWeekStats.season, season),
        eq(playerWeekStats.seasonType, seasonType),
        eq(playerWeekStats.week, week),
      ),
    );
  if (rows.length === 0) return 0;

  const values = rows.map((r) => {
    const { points, breakdown } = scoreStatLine(statRowToLine(r.stat), settings.rules, {
      isTightEnd: r.position === "TE",
      position: r.position ?? undefined,
    });
    return {
      leagueId,
      gsisId: r.stat.gsisId,
      season,
      seasonType,
      week,
      fantasyPoints: points,
      breakdown,
      scoringVersion: settings.version,
      computedAt: new Date(),
    };
  });

  for (let i = 0; i < values.length; i += UPSERT_CHUNK) {
    const chunk = values.slice(i, i + UPSERT_CHUNK);
    await db
      .insert(playerWeekScores)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          playerWeekScores.leagueId,
          playerWeekScores.gsisId,
          playerWeekScores.season,
          playerWeekScores.seasonType,
          playerWeekScores.week,
        ],
        set: {
          fantasyPoints: sql`excluded.fantasy_points`,
          breakdown: sql`excluded.breakdown`,
          scoringVersion: sql`excluded.scoring_version`,
          computedAt: sql`excluded.computed_at`,
        },
      });
  }
  return values.length;
}

/** All REG weeks with stats for a season (used for full re-scores after rule edits). */
export async function weeksWithStats(season: number, seasonType: string): Promise<number[]> {
  const rows = await db
    .selectDistinct({ week: playerWeekStats.week })
    .from(playerWeekStats)
    .where(and(eq(playerWeekStats.season, season), eq(playerWeekStats.seasonType, seasonType)))
    .orderBy(playerWeekStats.week);
  return rows.map((r) => r.week);
}

/** League ids for a season (optionally restricted). */
export async function leagueIdsForSeason(season: number, only?: number[]): Promise<number[]> {
  const rows = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(only?.length ? and(eq(leagues.season, season), inArray(leagues.id, only)) : eq(leagues.season, season));
  return rows.map((r) => r.id);
}
