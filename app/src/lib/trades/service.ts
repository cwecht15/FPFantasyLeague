/**
 * Trades: manager proposes a player swap, the other manager accepts, a site
 * admin approves, and the rosters swap atomically. Player-for-player only in
 * v1 (the schema also supports picks/FAAB for later).
 *
 * Status flow: proposed → accepted (receiver) → applied (admin approve)
 *              proposed → rejected (receiver) | expired
 *              accepted → vetoed (admin)
 * Either manager can cancel (→ rejected) while still proposed.
 */

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  lineups,
  lineupSlots,
  players,
  rosterEntries,
  teams,
  trades,
  tradeItems,
  transactions,
} from "@/lib/db/schema";
import type { RosterTemplate } from "@/lib/leagues/settings";
import { rosterCap } from "@/lib/transactions/service";

export type Trade = typeof trades.$inferSelect;
export type TradeItem = typeof tradeItems.$inferSelect;

async function ownsAll(teamId: number, gsisIds: string[]): Promise<boolean> {
  if (gsisIds.length === 0) return true;
  const rows = await db
    .select({ gsisId: rosterEntries.gsisId })
    .from(rosterEntries)
    .where(
      and(
        eq(rosterEntries.teamId, teamId),
        inArray(rosterEntries.gsisId, gsisIds),
        isNull(rosterEntries.droppedAt),
      ),
    );
  return rows.length === gsisIds.length;
}

export async function proposeTrade(opts: {
  leagueId: number;
  proposingTeamId: number;
  receivingTeamId: number;
  give: string[]; // gsis_ids leaving the proposing team
  get: string[]; // gsis_ids leaving the receiving team
}): Promise<{ error: string | null; tradeId?: number }> {
  const { leagueId, proposingTeamId, receivingTeamId, give, get } = opts;
  if (proposingTeamId === receivingTeamId) return { error: "Pick another team" };
  if (give.length === 0 || get.length === 0) {
    return { error: "Both sides must include at least one player" };
  }
  if (!(await ownsAll(proposingTeamId, give))) {
    return { error: "You no longer own all of those players" };
  }
  if (!(await ownsAll(receivingTeamId, get))) {
    return { error: "The other team no longer owns all of those players" };
  }

  const tradeId = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(trades)
      .values({ leagueId, proposingTeamId, receivingTeamId })
      .returning({ id: trades.id });
    await tx.insert(tradeItems).values([
      ...give.map((gsisId) => ({
        tradeId: t.id,
        fromTeamId: proposingTeamId,
        toTeamId: receivingTeamId,
        assetType: "player" as const,
        gsisId,
      })),
      ...get.map((gsisId) => ({
        tradeId: t.id,
        fromTeamId: receivingTeamId,
        toTeamId: proposingTeamId,
        assetType: "player" as const,
        gsisId,
      })),
    ]);
    return t.id;
  });
  return { error: null, tradeId };
}

/** Receiver accepts (→ awaiting admin) or rejects. Proposer may cancel. */
export async function respondToTrade(opts: {
  tradeId: number;
  teamId: number; // the responding/cancelling team
  accept: boolean;
}): Promise<{ error: string | null }> {
  const [t] = await db.select().from(trades).where(eq(trades.id, opts.tradeId)).limit(1);
  if (!t) return { error: "Trade not found" };
  if (t.status !== "proposed") return { error: `Trade is already ${t.status}` };

  const isReceiver = t.receivingTeamId === opts.teamId;
  const isProposer = t.proposingTeamId === opts.teamId;
  if (!isReceiver && !isProposer) return { error: "Not your trade" };
  if (opts.accept && !isReceiver) return { error: "Only the receiving manager can accept" };

  await db
    .update(trades)
    .set({
      status: opts.accept ? "accepted" : "rejected",
      ...(opts.accept ? {} : { resolvedAt: new Date() }),
    })
    .where(and(eq(trades.id, t.id), eq(trades.status, "proposed")));

  const { notifyTeamOwner } = await import("@/lib/notifications/service");
  await notifyTeamOwner(t.proposingTeamId, t.leagueId, {
    type: "trade_offer",
    title: opts.accept ? "Trade accepted — awaiting admin approval" : "Trade declined",
  });
  return { error: null };
}

/** Admin approval applies the swap atomically; veto kills it. */
export async function resolveTrade(opts: {
  tradeId: number;
  approve: boolean;
  template: RosterTemplate;
}): Promise<{ error: string | null }> {
  const [t] = await db.select().from(trades).where(eq(trades.id, opts.tradeId)).limit(1);
  if (!t) return { error: "Trade not found" };
  if (t.status !== "accepted") return { error: `Trade is ${t.status}, not awaiting approval` };

  if (!opts.approve) {
    await db
      .update(trades)
      .set({ status: "vetoed", resolvedAt: new Date() })
      .where(eq(trades.id, t.id));
    return { error: null };
  }

  const items = await db.select().from(tradeItems).where(eq(tradeItems.tradeId, t.id));
  const playerItems = items.filter((i) => i.assetType === "player" && i.gsisId);

  // Re-validate ownership at apply time.
  for (const side of [t.proposingTeamId, t.receivingTeamId]) {
    const giving = playerItems.filter((i) => i.fromTeamId === side).map((i) => i.gsisId!);
    if (!(await ownsAll(side, giving))) {
      await db
        .update(trades)
        .set({ status: "expired", resolvedAt: new Date() })
        .where(eq(trades.id, t.id));
      return { error: "A player in this trade changed hands — trade expired" };
    }
  }

  // Roster caps after the swap.
  const cap = rosterCap(opts.template);
  for (const side of [t.proposingTeamId, t.receivingTeamId]) {
    const out = playerItems.filter((i) => i.fromTeamId === side).length;
    const inn = playerItems.filter((i) => i.toTeamId === side).length;
    const [{ n } = { n: 0 }] = await db
      .select({ n: rosterEntries.id })
      .from(rosterEntries)
      .where(and(eq(rosterEntries.teamId, side), isNull(rosterEntries.droppedAt)))
      .then((rows) => [{ n: rows.length }]);
    if (n - out + inn > cap) {
      return { error: `Trade would put a roster over the ${cap}-player cap` };
    }
  }

  await db.transaction(async (tx) => {
    for (const item of playerItems) {
      const gsisId = item.gsisId!;
      // close the old ownership row
      await tx
        .update(rosterEntries)
        .set({ droppedAt: new Date() })
        .where(
          and(
            eq(rosterEntries.teamId, item.fromTeamId),
            eq(rosterEntries.gsisId, gsisId),
            isNull(rosterEntries.droppedAt),
          ),
        );
      // clear from the old team's lineup slots
      const fromLineups = await tx
        .select({ id: lineups.id })
        .from(lineups)
        .where(eq(lineups.teamId, item.fromTeamId));
      if (fromLineups.length) {
        await tx
          .update(lineupSlots)
          .set({ gsisId: null })
          .where(
            and(
              inArray(lineupSlots.lineupId, fromLineups.map((l) => l.id)),
              eq(lineupSlots.gsisId, gsisId),
            ),
          );
      }
      // open the new ownership row
      await tx.insert(rosterEntries).values({
        leagueId: t.leagueId,
        teamId: item.toTeamId,
        gsisId,
        acquiredVia: "trade",
      });
      await tx.insert(transactions).values({
        leagueId: t.leagueId,
        teamId: item.toTeamId,
        type: "trade",
        addGsisId: gsisId,
        processedAt: new Date(),
      });
    }
    await tx
      .update(trades)
      .set({ status: "applied", resolvedAt: new Date() })
      .where(eq(trades.id, t.id));
  });

  const { notifyTeamOwner } = await import("@/lib/notifications/service");
  for (const side of [t.proposingTeamId, t.receivingTeamId]) {
    await notifyTeamOwner(side, t.leagueId, {
      type: "trade_offer",
      title: "Trade approved and applied",
      body: "Rosters have been updated — check your lineup.",
    });
  }
  return { error: null };
}

export interface TradeView {
  trade: Trade;
  proposingTeam: string;
  receivingTeam: string;
  give: { gsisId: string; name: string; position: string }[]; // proposer → receiver
  get: { gsisId: string; name: string; position: string }[]; // receiver → proposer
}

export async function listTrades(leagueId: number): Promise<TradeView[]> {
  const rows = await db
    .select()
    .from(trades)
    .where(eq(trades.leagueId, leagueId))
    .orderBy(desc(trades.createdAt))
    .limit(50);
  if (rows.length === 0) return [];

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, leagueId));
  const teamName = new Map(teamRows.map((x) => [x.id, x.name]));

  const items = await db
    .select({
      item: tradeItems,
      name: players.displayName,
      position: players.position,
    })
    .from(tradeItems)
    .innerJoin(players, eq(players.gsisId, tradeItems.gsisId))
    .where(inArray(tradeItems.tradeId, rows.map((r) => r.id)));

  return rows.map((t) => ({
    trade: t,
    proposingTeam: teamName.get(t.proposingTeamId) ?? "?",
    receivingTeam: teamName.get(t.receivingTeamId) ?? "?",
    give: items
      .filter((i) => i.item.tradeId === t.id && i.item.fromTeamId === t.proposingTeamId)
      .map((i) => ({ gsisId: i.item.gsisId!, name: i.name, position: i.position })),
    get: items
      .filter((i) => i.item.tradeId === t.id && i.item.fromTeamId === t.receivingTeamId)
      .map((i) => ({ gsisId: i.item.gsisId!, name: i.name, position: i.position })),
  }));
}
