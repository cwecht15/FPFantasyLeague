/**
 * Waiver claims: created by managers, processed by the worker after each
 * league's configured process time. Priority mode awards by waiver_priority
 * (winner rotates to last); FAAB mode awards by bid (ties → priority), and
 * deducts the winning bid from the team's budget.
 */

import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  leagueSettings,
  rosterEntries,
  teams,
  transactions,
  waiverClaims,
} from "@/lib/db/schema";
import type { WaiverConfig, RosterTemplate } from "@/lib/leagues/settings";
import { activeRosterCount, ownerOf, rosterCap } from "@/lib/transactions/service";

/** Next occurrence of the league's weekly process time (UTC). */
export function nextProcessTime(config: WaiverConfig, from = new Date()): Date {
  const d = new Date(from);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(config.processHourUtc);
  const dayDiff = (config.processDow - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + dayDiff);
  if (d <= from) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

export async function createClaim(opts: {
  leagueId: number;
  teamId: number;
  gsisId: string;
  dropGsisId?: string | null;
  bidAmount?: number | null;
  config: WaiverConfig;
}): Promise<{ error: string | null }> {
  const { leagueId, teamId, gsisId, dropGsisId, bidAmount, config } = opts;

  if (config.mode === "faab") {
    const bid = bidAmount ?? 0;
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    const budget = team?.faabBudget ?? config.faabBudget;
    if (bid < 0 || bid > budget) return { error: `Bid must be 0–${budget}` };
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  await db.insert(waiverClaims).values({
    leagueId,
    teamId,
    addGsisId: gsisId,
    dropGsisId: dropGsisId ?? null,
    bidAmount: config.mode === "faab" ? (bidAmount ?? 0) : null,
    priority: team?.waiverPriority ?? null,
    processAfter: nextProcessTime(config),
  });
  return { error: null };
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
    })
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  if (!settings) return 0;
  const config = settings.waiverConfig;
  const template = settings.rosterTemplate as RosterTemplate;

  // Current priorities (lower = better). Teams without one get worst.
  const leagueTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.leagueId, leagueId))
    .orderBy(asc(teams.id));
  const priority = new Map<number, number>();
  leagueTeams.forEach((t, i) => priority.set(t.id, t.waiverPriority ?? i + 1));

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

  // Award order: FAAB bid desc then priority asc; priority mode: priority asc.
  const ordered = [...claims].sort((a, b) => {
    if (config.mode === "faab") {
      const bidDiff = (b.bidAmount ?? 0) - (a.bidAmount ?? 0);
      if (bidDiff !== 0) return bidDiff;
    }
    return (priority.get(a.teamId) ?? 99) - (priority.get(b.teamId) ?? 99);
  });

  let processed = 0;
  for (const claim of ordered) {
    const result = await settleClaim(claim, leagueId, config, template, priority, leagueTeams.length);
    if (result === "won") {
      // Winner rotates to the back of the priority line.
      const winnerPrio = priority.get(claim.teamId) ?? 99;
      for (const [teamId, p] of priority) {
        if (teamId === claim.teamId) priority.set(teamId, leagueTeams.length);
        else if (p > winnerPrio) priority.set(teamId, p - 1);
      }
    }
    processed++;
  }

  // Persist rotated priorities.
  for (const [teamId, p] of priority) {
    await db.update(teams).set({ waiverPriority: p }).where(eq(teams.id, teamId));
  }
  return processed;
}

async function settleClaim(
  claim: typeof waiverClaims.$inferSelect,
  leagueId: number,
  config: WaiverConfig,
  template: RosterTemplate,
  priority: Map<number, number>,
  _numTeams: number,
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
  if (config.mode === "faab" && (claim.bidAmount ?? 0) > (team.faabBudget ?? config.faabBudget)) {
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
