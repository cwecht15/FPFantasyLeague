/**
 * Regular-season schedule generation: circle-method round-robin, repeating
 * cycles until the last regular-season week (playoff start - 1). Odd team
 * counts get a weekly bye (matchup row with null away team).
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchups, teams } from "@/lib/db/schema";

/** Pairings for one round-robin cycle: weeks[week][match] = [home, away|null]. */
export function roundRobin(teamIds: number[]): [number, number | null][][] {
  const ids: (number | null)[] = [...teamIds];
  if (ids.length % 2 === 1) ids.push(null); // bye slot
  const n = ids.length;
  const rounds: [number, number | null][][] = [];

  // Circle method: fix ids[0], rotate the rest each round.
  const rest = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const arr = [ids[0], ...rest];
    const round: [number, number | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === null && b === null) continue;
      // Alternate home/away by round for fairness; bye = null away.
      if (a === null) round.push([b as number, null]);
      else if (b === null) round.push([a, null]);
      else round.push(r % 2 === 0 ? [a, b] : [b as number, a]);
    }
    rounds.push(round);
    rest.unshift(rest.pop()!);
  }
  return rounds;
}

/** Regenerate the league's regular-season matchups for weeks 1..lastWeek. */
export async function generateSchedule(
  leagueId: number,
  season: number,
  lastWeek: number,
): Promise<number> {
  const leagueTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.leagueId, leagueId))
    .orderBy(teams.id);
  if (leagueTeams.length < 2) throw new Error("Need at least 2 teams to schedule");

  const cycle = roundRobin(leagueTeams.map((t) => t.id));

  return db.transaction(async (tx) => {
    await tx
      .delete(matchups)
      .where(
        and(
          eq(matchups.leagueId, leagueId),
          eq(matchups.season, season),
          eq(matchups.isPlayoff, false),
        ),
      );

    let created = 0;
    for (let week = 1; week <= lastWeek; week++) {
      const round = cycle[(week - 1) % cycle.length];
      for (const [home, away] of round) {
        await tx.insert(matchups).values({
          leagueId,
          season,
          week,
          homeTeamId: home,
          awayTeamId: away,
        });
        created++;
      }
    }
    return created;
  });
}
