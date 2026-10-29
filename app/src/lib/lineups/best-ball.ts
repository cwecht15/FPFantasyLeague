/**
 * Best ball: after a week is scored, rewrite a team's lineup to the
 * highest-scoring legal arrangement of the roster it held that week. The
 * rollup then totals starters exactly as in a managed league, and matchup
 * pages show the lineup that actually counted.
 *
 * "Held that week" is judged per player at their own game's kickoff (falling
 * back to the week's last kickoff): on the roster then = acquired at or before
 * it and not dropped by it. Game locks mean nobody can be added or dropped
 * between kickoff and Wednesday waivers, so later claims never count backwards.
 */

import { and, eq, max } from "drizzle-orm";

import { db } from "@/lib/db";
import { lineupSlots, nflGames, players, playerWeekScores, rosterEntries } from "@/lib/db/schema";
import type { RosterTemplate } from "@/lib/leagues/settings";
import { bestBallAssignment, type BestBallPlayer } from "@/lib/lineups/best-ball-assign";
import { ensureLineup, kickoffMap } from "@/lib/lineups/service";

const REG = "REG";

/** Rewrite one team-week lineup to its best-ball optimum. No-op (returns
 *  false) until the league has any scores for the week. */
export async function applyBestBallLineup(
  leagueId: number,
  teamId: number,
  season: number,
  week: number,
  template: RosterTemplate,
): Promise<boolean> {
  const scores = await db
    .select({ gsisId: playerWeekScores.gsisId, points: playerWeekScores.fantasyPoints })
    .from(playerWeekScores)
    .where(
      and(
        eq(playerWeekScores.leagueId, leagueId),
        eq(playerWeekScores.season, season),
        eq(playerWeekScores.seasonType, REG),
        eq(playerWeekScores.week, week),
      ),
    );
  if (scores.length === 0) return false;
  const pts = new Map(scores.map((s) => [s.gsisId, s.points]));

  const [wk] = await db
    .select({ lastKick: max(nflGames.kickoffAt) })
    .from(nflGames)
    .where(and(eq(nflGames.season, season), eq(nflGames.seasonType, REG), eq(nflGames.week, week)));
  const fallback = wk?.lastKick ?? new Date();

  // All entries ever (a player dropped and re-added has several).
  const entries = await db
    .select({
      gsisId: rosterEntries.gsisId,
      position: players.position,
      acquiredAt: rosterEntries.acquiredAt,
      droppedAt: rosterEntries.droppedAt,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
    .where(eq(rosterEntries.teamId, teamId));
  const kicks = await kickoffMap([...new Set(entries.map((e) => e.gsisId))], season, week);

  const roster = new Map<string, BestBallPlayer>();
  for (const e of entries) {
    const ref = (kicks.get(e.gsisId) ?? fallback).getTime();
    const held = e.acquiredAt.getTime() <= ref && (!e.droppedAt || e.droppedAt.getTime() > ref);
    if (held) roster.set(e.gsisId, { gsisId: e.gsisId, position: e.position, points: pts.get(e.gsisId) ?? 0 });
  }

  // No roster held at kickoff (e.g. a team created after the games) — leave
  // whatever lineup exists rather than blanking it.
  if (roster.size === 0) return false;

  const assignment = bestBallAssignment(template, [...roster.values()]);
  const lineupId = await ensureLineup(teamId, season, week, template);
  await db.transaction(async (tx) => {
    const slots = await tx.select().from(lineupSlots).where(eq(lineupSlots.lineupId, lineupId));
    for (const s of slots) {
      const want = assignment.get(`${s.slot}#${s.slotIndex}`) ?? null;
      if (want !== s.gsisId) {
        await tx.update(lineupSlots).set({ gsisId: want }).where(eq(lineupSlots.id, s.id));
      }
    }
  });
  return true;
}
