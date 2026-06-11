/**
 * Cross-league championship sprint: top N teams from every league enter one
 * global pool; weeks 15-17 cumulative starter points decide the champion.
 * Centrally-uniform scoring settings make cross-league points comparable.
 */

import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  championshipEntries,
  leagues,
  lineups,
  lineupSlots,
  playerWeekScores,
  standings,
  teams,
} from "@/lib/db/schema";

export const SPRINT_WEEKS = [15, 16, 17] as const;
export const QUALIFIERS_PER_LEAGUE = 2;

/** Lock the field: top-N ranked teams of every league this season. Re-running
 *  replaces the field (until the sprint has data, locking is reversible). */
export async function lockChampionshipField(season: number): Promise<{
  entries: number;
  leagues: number;
  error?: string;
}> {
  const qualifiers = await db
    .select({
      leagueId: standings.leagueId,
      teamId: standings.teamId,
      rank: standings.rank,
    })
    .from(standings)
    .innerJoin(leagues, eq(standings.leagueId, leagues.id))
    .where(
      and(
        eq(standings.season, season),
        eq(leagues.season, season),
        eq(leagues.isDemo, false), // demo leagues never qualify
        lte(standings.rank, QUALIFIERS_PER_LEAGUE),
      ),
    );

  if (qualifiers.length === 0) {
    return { entries: 0, leagues: 0, error: "No ranked standings found for that season" };
  }

  await db.transaction(async (tx) => {
    await tx.delete(championshipEntries).where(eq(championshipEntries.season, season));
    await tx.insert(championshipEntries).values(
      qualifiers.map((q) => ({
        season,
        leagueId: q.leagueId,
        teamId: q.teamId,
        seed: q.rank ?? QUALIFIERS_PER_LEAGUE,
      })),
    );
  });

  return {
    entries: qualifiers.length,
    leagues: new Set(qualifiers.map((q) => q.leagueId)).size,
  };
}

export interface SprintRow {
  teamId: number;
  teamName: string;
  leagueName: string;
  leagueSlug: string;
  seed: number;
  weekly: Record<number, number>;
  total: number;
}

/** Global leaderboard: per-week + cumulative starter points for weeks 15-17. */
export async function sprintLeaderboard(season: number): Promise<SprintRow[]> {
  const entries = await db
    .select({
      teamId: championshipEntries.teamId,
      leagueId: championshipEntries.leagueId,
      seed: championshipEntries.seed,
      teamName: teams.name,
      leagueName: leagues.name,
      leagueSlug: leagues.slug,
    })
    .from(championshipEntries)
    .innerJoin(teams, eq(championshipEntries.teamId, teams.id))
    .innerJoin(leagues, eq(championshipEntries.leagueId, leagues.id))
    .where(eq(championshipEntries.season, season));
  if (entries.length === 0) return [];

  const teamIds = entries.map((e) => e.teamId);

  // One aggregate query: starter points per (team, week) across the pool.
  const points = await db
    .select({
      teamId: lineups.teamId,
      week: lineups.week,
      points: sql<number>`coalesce(sum(${playerWeekScores.fantasyPoints}), 0)`,
    })
    .from(lineups)
    .innerJoin(lineupSlots, eq(lineupSlots.lineupId, lineups.id))
    .innerJoin(teams, eq(teams.id, lineups.teamId))
    .innerJoin(
      playerWeekScores,
      and(
        eq(playerWeekScores.gsisId, lineupSlots.gsisId),
        eq(playerWeekScores.leagueId, teams.leagueId),
        eq(playerWeekScores.season, lineups.season),
        eq(playerWeekScores.seasonType, "REG"),
        eq(playerWeekScores.week, lineups.week),
      ),
    )
    .where(
      and(
        inArray(lineups.teamId, teamIds),
        eq(lineups.season, season),
        gte(lineups.week, SPRINT_WEEKS[0]),
        lte(lineups.week, SPRINT_WEEKS[SPRINT_WEEKS.length - 1]),
        ne(lineupSlots.slot, "BENCH"),
        ne(lineupSlots.slot, "IR"),
      ),
    )
    .groupBy(lineups.teamId, lineups.week);

  const byTeam = new Map<number, Record<number, number>>();
  for (const p of points) {
    const rec = byTeam.get(p.teamId) ?? {};
    rec[p.week] = Number(p.points);
    byTeam.set(p.teamId, rec);
  }

  const rows: SprintRow[] = entries.map((e) => {
    const weekly = byTeam.get(e.teamId) ?? {};
    const total = SPRINT_WEEKS.reduce((sum, w) => sum + (weekly[w] ?? 0), 0);
    return {
      teamId: e.teamId,
      teamName: e.teamName,
      leagueName: e.leagueName,
      leagueSlug: e.leagueSlug,
      seed: e.seed,
      weekly,
      total: Math.round(total * 100) / 100,
    };
  });

  rows.sort((a, b) => b.total - a.total);
  return rows;
}
