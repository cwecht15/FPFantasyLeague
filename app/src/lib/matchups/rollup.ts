/**
 * rollup_matchups: sum each team's STARTER slots into matchup points, decide
 * winners once the NFL week is over, and recompute standings from final
 * matchups. Pure recompute-from-source — idempotent.
 */

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  lineups,
  lineupSlots,
  matchups,
  nflGames,
  playerWeekScores,
  standings,
  teams,
} from "@/lib/db/schema";

const REG = "REG";

/** Sum of starter-slot player scores for one team-week (0 if no lineup set). */
export async function teamWeekPoints(
  leagueId: number,
  teamId: number,
  season: number,
  week: number,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${playerWeekScores.fantasyPoints}), 0)`,
    })
    .from(lineups)
    .innerJoin(lineupSlots, eq(lineupSlots.lineupId, lineups.id))
    .innerJoin(
      playerWeekScores,
      and(
        eq(playerWeekScores.gsisId, lineupSlots.gsisId),
        eq(playerWeekScores.leagueId, leagueId),
        eq(playerWeekScores.season, season),
        eq(playerWeekScores.seasonType, REG),
        eq(playerWeekScores.week, week),
      ),
    )
    .where(
      and(
        eq(lineups.teamId, teamId),
        eq(lineups.season, season),
        eq(lineups.week, week),
        ne(lineupSlots.slot, "BENCH"),
        ne(lineupSlots.slot, "IR"),
      ),
    );
  return Number(row?.total ?? 0);
}

/** A week is over when every game with a known kickoff is comfortably done.
 *  (Stats presence is the gate for scoring; this gates marking winners.) */
export async function isWeekComplete(season: number, week: number): Promise<boolean> {
  const games = await db
    .select({ kickoffAt: nflGames.kickoffAt })
    .from(nflGames)
    .where(and(eq(nflGames.season, season), eq(nflGames.seasonType, REG), eq(nflGames.week, week)));
  if (games.length === 0) return false;
  const SIX_HOURS = 6 * 3600 * 1000;
  const now = Date.now();
  return games.every((g) => g.kickoffAt !== null && g.kickoffAt.getTime() + SIX_HOURS < now);
}

/** True if any team in the league has a non-empty lineup for the week. */
async function weekHasLineups(leagueId: number, season: number, week: number): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(lineups)
    .innerJoin(lineupSlots, eq(lineupSlots.lineupId, lineups.id))
    .innerJoin(teams, eq(teams.id, lineups.teamId))
    .where(
      and(
        eq(teams.leagueId, leagueId),
        eq(lineups.season, season),
        eq(lineups.week, week),
        sql`${lineupSlots.gsisId} is not null`,
      ),
    );
  return Number(row?.n ?? 0) > 0;
}

/** Recompute one league-week's matchup points (+winners when the week is over). */
export async function rollupLeagueWeek(
  leagueId: number,
  season: number,
  week: number,
): Promise<number> {
  const weekMatchups = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.leagueId, leagueId), eq(matchups.season, season), eq(matchups.week, week)));
  if (weekMatchups.length === 0) return 0;

  // A week nobody played (no lineups at all) stays scheduled — prevents
  // re-scores from finalizing 0-0 ties for weeks a league never reached.
  if (!(await weekHasLineups(leagueId, season, week))) return 0;

  // Locked weeks are FINAL: if every matchup is already decided, leave them.
  {
    const { isWeekDataLocked } = await import("@/lib/nfl/locks");
    if (
      (await isWeekDataLocked(season, week)) &&
      weekMatchups.every((m) => m.status === "final")
    ) {
      return 0;
    }
  }

  const complete = await isWeekComplete(season, week);

  for (const m of weekMatchups) {
    const homePoints = await teamWeekPoints(leagueId, m.homeTeamId, season, week);
    const awayPoints = m.awayTeamId
      ? await teamWeekPoints(leagueId, m.awayTeamId, season, week)
      : null;

    let winnerTeamId: number | null = null;
    let isTie = false;
    if (complete && m.awayTeamId && awayPoints !== null) {
      if (homePoints > awayPoints) winnerTeamId = m.homeTeamId;
      else if (awayPoints > homePoints) winnerTeamId = m.awayTeamId;
      else isTie = true;
    }

    await db
      .update(matchups)
      .set({
        homePoints,
        awayPoints,
        winnerTeamId,
        isTie,
        status: complete ? "final" : "in_progress",
      })
      .where(eq(matchups.id, m.id));
  }
  return weekMatchups.length;
}

/** Recompute the league's standings from all FINAL regular-season matchups. */
export async function recomputeStandings(leagueId: number, season: number): Promise<void> {
  const leagueTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.leagueId, leagueId));

  const finals = await db
    .select()
    .from(matchups)
    .where(
      and(
        eq(matchups.leagueId, leagueId),
        eq(matchups.season, season),
        eq(matchups.status, "final"),
        eq(matchups.isPlayoff, false),
        isNull(matchups.playoffRound),
      ),
    );

  const table = new Map(
    leagueTeams.map((t) => [
      t.id,
      { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
    ]),
  );

  for (const m of finals) {
    if (!m.awayTeamId || m.homePoints === null || m.awayPoints === null) continue; // bye
    const home = table.get(m.homeTeamId);
    const away = table.get(m.awayTeamId);
    if (!home || !away) continue;
    home.pointsFor += m.homePoints;
    home.pointsAgainst += m.awayPoints;
    away.pointsFor += m.awayPoints;
    away.pointsAgainst += m.homePoints;
    if (m.isTie) {
      home.ties += 1;
      away.ties += 1;
    } else if (m.winnerTeamId === m.homeTeamId) {
      home.wins += 1;
      away.losses += 1;
    } else if (m.winnerTeamId === m.awayTeamId) {
      away.wins += 1;
      home.losses += 1;
    }
  }

  // Rank: wins desc, then points-for desc.
  const ranked = [...table.entries()].sort(
    (a, b) => b[1].wins - a[1].wins || b[1].pointsFor - a[1].pointsFor,
  );

  for (let i = 0; i < ranked.length; i++) {
    const [teamId, s] = ranked[i];
    await db
      .insert(standings)
      .values({
        leagueId,
        season,
        teamId,
        ...s,
        rank: i + 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [standings.leagueId, standings.season, standings.teamId],
        set: {
          wins: s.wins,
          losses: s.losses,
          ties: s.ties,
          pointsFor: s.pointsFor,
          pointsAgainst: s.pointsAgainst,
          rank: i + 1,
          updatedAt: new Date(),
        },
      });
  }
}
