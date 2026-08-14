/**
 * Waiver claims: created by managers on game-locked players, processed by the
 * worker at the league's weekly boundary (house rule: Wednesday 3:00 AM ET).
 *
 * FAAB mode (the house default): blind bids from a per-season budget; highest
 * bid wins, ties go to the worse record (then lower points-for, then the
 * earlier claim). Legacy priority mode awards by waiver_priority with the
 * winner rotating to last.
 */

import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  leagues,
  leagueSettings,
  rosterEntries,
  standings,
  teams,
  transactions,
  waiverClaims,
} from "@/lib/db/schema";
import type { WaiverConfig, RosterTemplate } from "@/lib/leagues/settings";
import { nextWeeklyEt, WAIVER_DOW, WAIVER_HOUR_ET } from "@/lib/transactions/game-lock";
import { activeRosterCount, ownerOf, rosterCap } from "@/lib/transactions/service";

/** Next occurrence of the league's weekly process time. Older stored configs
 *  (raw JSON, no zod re-parse) may lack processHourEt — fall back to house
 *  Wednesday 3:00 AM ET. */
export function nextProcessTime(config: WaiverConfig, from = new Date()): Date {
  const dow = config.processDow ?? WAIVER_DOW;
  const hourEt = config.processHourEt ?? WAIVER_HOUR_ET;
  return nextWeeklyEt(dow, hourEt, from);
}

export function faabRemaining(team: { faabBudget: number | null }, config: WaiverConfig): number {
  return team.faabBudget ?? config.faabBudget ?? 100;
}

/** Create (or update — one pending claim per team/player) a waiver claim. */
export async function createClaim(opts: {
  leagueId: number;
  teamId: number;
  gsisId: string;
  dropGsisId?: string | null;
  bidAmount?: number | null;
  config: WaiverConfig;
}): Promise<{ error: string | null }> {
  const { leagueId, teamId, gsisId, dropGsisId, config } = opts;

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return { error: "Team not found" };

  let bid: number | null = null;
  if (config.mode === "faab") {
    bid = Math.floor(opts.bidAmount ?? 0);
    const budget = faabRemaining(team, config);
    if (!Number.isFinite(bid) || bid < 0 || bid > budget) {
      return { error: `Bid must be $0–$${budget}` };
    }
  }

  const [existing] = await db
    .select({ id: waiverClaims.id })
    .from(waiverClaims)
    .where(
      and(
        eq(waiverClaims.leagueId, leagueId),
        eq(waiverClaims.teamId, teamId),
        eq(waiverClaims.addGsisId, gsisId),
        eq(waiverClaims.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(waiverClaims)
      .set({ bidAmount: bid, dropGsisId: dropGsisId ?? null })
      .where(eq(waiverClaims.id, existing.id));
    return { error: null };
  }

  await db.insert(waiverClaims).values({
    leagueId,
    teamId,
    addGsisId: gsisId,
    dropGsisId: dropGsisId ?? null,
    bidAmount: bid,
    priority: team.waiverPriority ?? null,
    processAfter: nextProcessTime(config),
  });
  return { error: null };
}

/** Cancel a team's own pending claim. */
export async function cancelClaim(opts: {
  leagueId: number;
  teamId: number;
  claimId: number;
}): Promise<{ error: string | null }> {
  const result = await db
    .delete(waiverClaims)
    .where(
      and(
        eq(waiverClaims.id, opts.claimId),
        eq(waiverClaims.leagueId, opts.leagueId),
        eq(waiverClaims.teamId, opts.teamId),
        eq(waiverClaims.status, "pending"),
      ),
    )
    .returning({ id: waiverClaims.id });
  return result.length ? { error: null } : { error: "No pending claim to cancel" };
}

/** Worker entry: process every due pending claim, league by league. */
export async function processDueWaivers(): Promise<number> {
  const due = await db
    .selectDistinct({ leagueId: waiverClaims.leagueId })
    .from(waiverClaims)
    .where(and(eq(waiverClaims.status, "pending"), lte(waiverClaims.processAfter, new Date())));

  let processed = 0;
  for (const { leagueId } of due) {
    processed += await processLeagueWaivers(leagueId);
  }
  return processed;
}

async function processLeagueWaivers(leagueId: number): Promise<number> {
  const [settings] = await db
    .select({
      waiverConfig: leagueSettings.waiverConfig,
      rosterTemplate: leagueSettings.rosterTemplate,
      season: leagues.season,
    })
    .from(leagueSettings)
    .innerJoin(leagues, eq(leagues.id, leagueSettings.leagueId))
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  if (!settings) return 0;
  const config = settings.waiverConfig;
  const template = settings.rosterTemplate as RosterTemplate;

  const leagueTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.leagueId, leagueId))
    .orderBy(asc(teams.id));

  // Legacy priority mode: lower = better; teams without one get worst.
  const priority = new Map<number, number>();
  leagueTeams.forEach((t, i) => priority.set(t.id, t.waiverPriority ?? i + 1));

  // FAAB tiebreak: worse record first. Sort key ascends with quality —
  // win pct, then points-for — so a SMALLER key wins the tie.
  const standRows = await db
    .select()
    .from(standings)
    .where(and(eq(standings.leagueId, leagueId), eq(standings.season, settings.season)));
  const quality = new Map<number, number>();
  for (const s of standRows) {
    const games = s.wins + s.losses + s.ties;
    const pct = games > 0 ? (s.wins + 0.5 * s.ties) / games : 0;
    quality.set(s.teamId, pct * 1e9 + s.pointsFor);
  }

  const claims = await db
    .select()
    .from(waiverClaims)
    .where(
      and(
        eq(waiverClaims.leagueId, leagueId),
        eq(waiverClaims.status, "pending"),
        lte(waiverClaims.processAfter, new Date()),
      ),
    );
  if (claims.length === 0) return 0;

  // Award order — FAAB: bid desc, worse record, earlier claim.
  //             — priority: waiver priority asc.
  const ordered = [...claims].sort((a, b) => {
    if (config.mode === "faab") {
      const bidDiff = (b.bidAmount ?? 0) - (a.bidAmount ?? 0);
      if (bidDiff !== 0) return bidDiff;
      const qDiff = (quality.get(a.teamId) ?? 0) - (quality.get(b.teamId) ?? 0);
      if (qDiff !== 0) return qDiff;
      return a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;
    }
    return (priority.get(a.teamId) ?? 99) - (priority.get(b.teamId) ?? 99);
  });

  let processed = 0;
  for (const claim of ordered) {
    const result = await settleClaim(claim, leagueId, config, template);
    if (result === "won" && config.mode === "priority") {
      // Priority mode only: winner rotates to the back of the line.
      const winnerPrio = priority.get(claim.teamId) ?? 99;
      for (const [teamId, p] of priority) {
        if (teamId === claim.teamId) priority.set(teamId, leagueTeams.length);
        else if (p > winnerPrio) priority.set(teamId, p - 1);
      }
    }
    processed++;
  }

  if (config.mode === "priority") {
    for (const [teamId, p] of priority) {
      await db.update(teams).set({ waiverPriority: p }).where(eq(teams.id, teamId));
    }
  }
  return processed;
}

async function settleClaim(
  claim: typeof waiverClaims.$inferSelect,
  leagueId: number,
  config: WaiverConfig,
  template: RosterTemplate,
): Promise<"won" | "lost" | "invalid"> {
  const finish = async (status: "won" | "lost" | "invalid") => {
    await db
      .update(waiverClaims)
      .set({ status, processedAt: new Date() })
      .where(eq(waiverClaims.id, claim.id));
    const { notifyTeamOwner } = await import("@/lib/notifications/service");
    await notifyTeamOwner(claim.teamId, leagueId, {
      type: "waiver_result",
      title: `Waiver claim ${status === "won" ? "won" : status === "lost" ? "lost" : "invalid"}`,
      body: `Your claim for player ${claim.addGsisId} was ${status}.`,
    });
    return status;
  };

  // Player already taken (by an earlier claim or free agency)?
  if ((await ownerOf(leagueId, claim.addGsisId)) !== null) return finish("lost");

  // FAAB budget still sufficient?
  const [team] = await db.select().from(teams).where(eq(teams.id, claim.teamId)).limit(1);
  if (!team) return finish("invalid");
  if (config.mode === "faab" && (claim.bidAmount ?? 0) > faabRemaining(team, config)) {
    return finish("invalid");
  }

  // Roster space (accounting for the optional drop)?
  const count = await activeRosterCount(claim.teamId);
  const net = claim.dropGsisId ? 0 : 1;
  if (count + net > rosterCap(template)) return finish("invalid");

  try {
    await db.transaction(async (tx) => {
      if (claim.dropGsisId) {
        const [entry] = await tx
          .select({ id: rosterEntries.id })
          .from(rosterEntries)
          .where(
            and(
              eq(rosterEntries.teamId, claim.teamId),
              eq(rosterEntries.gsisId, claim.dropGsisId),
              isNull(rosterEntries.droppedAt),
            ),
          )
          .limit(1);
        if (!entry) throw new Error("DROP_GONE");
        await tx
          .update(rosterEntries)
          .set({ droppedAt: new Date() })
          .where(eq(rosterEntries.id, entry.id));
      }
      await tx.insert(rosterEntries).values({
        leagueId,
        teamId: claim.teamId,
        gsisId: claim.addGsisId,
        acquiredVia: "waiver",
      });
      if (config.mode === "faab" && claim.bidAmount) {
        await tx
          .update(teams)
          .set({ faabBudget: sql`coalesce(${teams.faabBudget}, ${config.faabBudget}) - ${claim.bidAmount}` })
          .where(eq(teams.id, claim.teamId));
      }
      await tx.insert(transactions).values({
        leagueId,
        teamId: claim.teamId,
        type: "waiver",
        addGsisId: claim.addGsisId,
        dropGsisId: claim.dropGsisId,
        processedAt: new Date(),
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "DROP_GONE" || msg.includes("roster_entries_active_owner_unique")) {
      return finish("invalid");
    }
    throw err;
  }
  return finish("won");
}
