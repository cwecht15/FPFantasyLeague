/**
 * Standard in-league playoff bracket (playoffConfig.mode === "bracket").
 *
 * House format (the defaults): top 6 teams by record — points-for breaks ties,
 * which is exactly the standings rank — enter a 3-round bracket in weeks
 * 15/16/17. Seeds 1-2 bye the first week; every later round re-seeds so the
 * best surviving seed plays the worst. A tied playoff matchup advances the
 * higher seed. The better seed is always the home team.
 *
 * Advancement is lazy and idempotent: every rollup calls advancePlayoffs,
 * which does nothing until the whole regular season is final, then creates
 * one round per call as the previous round finishes. Playoff matchups are
 * flagged isPlayoff so standings never count them.
 */

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchups, standings } from "@/lib/db/schema";
import { getSettings } from "@/lib/leagues/service";
import { playoffConfigSchema } from "@/lib/leagues/settings";

interface Seeded {
  teamId: number;
  seed: number;
}

/** Round names for the matchups UI ("Championship", "Semifinal", …). */
export function playoffRoundLabel(round: number, fieldSize: number): string {
  const totalRounds = Math.ceil(Math.log2(Math.max(2, fieldSize)));
  if (round >= totalRounds) return "Championship";
  if (round === totalRounds - 1) return "Semifinal";
  if (round === totalRounds - 2) return "Quarterfinal";
  return `Playoff round ${round}`;
}

/** Create/advance the league's playoff bracket as far as results allow. */
export async function advancePlayoffs(leagueId: number, season: number): Promise<void> {
  const settings = await getSettings(leagueId);
  const parsed = playoffConfigSchema.safeParse(settings.playoffConfig);
  if (!parsed.success || parsed.data.mode !== "bracket") return;
  const cfg = parsed.data;

  // Seeding needs the full regular season: every non-playoff matchup final.
  const regular = await db
    .select({ status: matchups.status })
    .from(matchups)
    .where(
      and(
        eq(matchups.leagueId, leagueId),
        eq(matchups.season, season),
        eq(matchups.isPlayoff, false),
      ),
    );
  if (regular.length === 0 || regular.some((m) => m.status !== "final")) return;

  // Seeds come from the persisted playoffSeed once the bracket exists, else
  // from the standings rank (wins desc, points-for desc — the tiebreaker).
  const ranked = await db
    .select({ teamId: standings.teamId, playoffSeed: standings.playoffSeed })
    .from(standings)
    .where(and(eq(standings.leagueId, leagueId), eq(standings.season, season)))
    .orderBy(asc(standings.rank));
  const seededAlready = ranked.some((r) => r.playoffSeed !== null);
  const field: Seeded[] = seededAlready
    ? ranked
        .filter((r) => r.playoffSeed !== null)
        .map((r) => ({ teamId: r.teamId, seed: r.playoffSeed! }))
        .sort((a, b) => a.seed - b.seed)
    : ranked.slice(0, cfg.teams).map((r, i) => ({ teamId: r.teamId, seed: i + 1 }));
  if (field.length < 2) return;
  const seedOf = new Map(field.map((f) => [f.teamId, f.seed]));
  const totalRounds = Math.ceil(Math.log2(field.length));

  const playoffRows = await db
    .select()
    .from(matchups)
    .where(
      and(
        eq(matchups.leagueId, leagueId),
        eq(matchups.season, season),
        eq(matchups.isPlayoff, true),
      ),
    );

  let alive = [...field].sort((a, b) => a.seed - b.seed);
  for (let round = 1; round <= totalRounds; round++) {
    const week = cfg.startWeek + (round - 1);
    const roundRows = playoffRows.filter((m) => m.playoffRound === round);

    if (roundRows.length === 0) {
      // Bracket shape: pad to the next power of two with byes for top seeds,
      // then pair best vs worst among the rest.
      const pow2 = 2 ** Math.ceil(Math.log2(alive.length));
      const byeCount = pow2 - alive.length;
      const byes = alive.slice(0, byeCount);
      const playing = alive.slice(byeCount);

      await db.transaction(async (tx) => {
        if (!seededAlready) {
          await tx
            .update(standings)
            .set({ playoffSeed: null, updatedAt: new Date() })
            .where(and(eq(standings.leagueId, leagueId), eq(standings.season, season)));
          for (const f of field) {
            await tx
              .update(standings)
              .set({ playoffSeed: f.seed, updatedAt: new Date() })
              .where(
                and(
                  eq(standings.leagueId, leagueId),
                  eq(standings.season, season),
                  eq(standings.teamId, f.teamId),
                ),
              );
          }
        }
        for (const b of byes) {
          await tx.insert(matchups).values({
            leagueId,
            season,
            week,
            homeTeamId: b.teamId,
            awayTeamId: null,
            isPlayoff: true,
            playoffRound: round,
          });
        }
        for (let i = 0; i < playing.length / 2; i++) {
          await tx.insert(matchups).values({
            leagueId,
            season,
            week,
            homeTeamId: playing[i].teamId,
            awayTeamId: playing[playing.length - 1 - i].teamId,
            isPlayoff: true,
            playoffRound: round,
          });
        }
      });
      console.log(
        `[playoffs] league=${leagueId} ${season}: round ${round}/${totalRounds} created for week ${week}`,
      );
      return; // later rounds need this round's results
    }

    // Round already exists — advance only once every matchup in it is final.
    if (roundRows.some((m) => m.status !== "final")) return;
    const survivors: Seeded[] = [];
    for (const m of roundRows) {
      let winner: number;
      if (!m.awayTeamId) {
        winner = m.homeTeamId; // bye
      } else if (m.winnerTeamId !== null) {
        winner = m.winnerTeamId;
      } else {
        // Tie (or missing points): the higher seed advances.
        const home = seedOf.get(m.homeTeamId) ?? 99;
        const away = seedOf.get(m.awayTeamId) ?? 99;
        winner = home < away ? m.homeTeamId : m.awayTeamId;
      }
      const seed = seedOf.get(winner);
      if (seed === undefined) return; // bracket teams unknown — don't guess
      survivors.push({ teamId: winner, seed });
    }
    alive = survivors.sort((a, b) => a.seed - b.seed);
    if (alive.length < 2) return; // champion decided
  }
}
