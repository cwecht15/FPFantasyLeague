/**
 * Roster transactions: free-agent add, drop, add/drop. The DB's partial unique
 * index (one active owner per player per league) is the hard guard against two
 * teams adding the same player in a race — we catch the violation and return a
 * friendly error.
 */

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  lineups,
  lineupSlots,
  rosterEntries,
  transactions,
} from "@/lib/db/schema";
import type { RosterTemplate } from "@/lib/leagues/settings";

export function rosterCap(template: RosterTemplate): number {
  return template.slots.reduce((sum, s) => sum + s.count, 0);
}

export async function activeRosterCount(teamId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(rosterEntries)
    .where(and(eq(rosterEntries.teamId, teamId), isNull(rosterEntries.droppedAt)));
  return Number(row?.count ?? 0);
}

export async function ownerOf(leagueId: number, gsisId: string): Promise<number | null> {
  const [row] = await db
    .select({ teamId: rosterEntries.teamId })
    .from(rosterEntries)
    .where(
      and(
        eq(rosterEntries.leagueId, leagueId),
        eq(rosterEntries.gsisId, gsisId),
        isNull(rosterEntries.droppedAt),
      ),
    )
    .limit(1);
  return row?.teamId ?? null;
}

export async function addFreeAgent(opts: {
  leagueId: number;
  teamId: number;
  gsisId: string;
  userId: string;
  template: RosterTemplate;
  dropGsisId?: string | null;
}): Promise<{ error: string | null }> {
  const { leagueId, teamId, gsisId, userId, template, dropGsisId } = opts;

  const count = await activeRosterCount(teamId);
  const netChange = dropGsisId ? 0 : 1;
  if (count + netChange > rosterCap(template)) {
    return { error: `Roster is full (${rosterCap(template)} max) — drop someone first` };
  }

  try {
    await db.transaction(async (tx) => {
      if (dropGsisId) {
        const dropped = await dropWithin(tx, leagueId, teamId, dropGsisId);
        if (!dropped) throw new Error("DROP_NOT_OWNED");
      }
      await tx.insert(rosterEntries).values({
        leagueId,
        teamId,
        gsisId,
        acquiredVia: "free_agent",
      });
      await tx.insert(transactions).values({
        leagueId,
        teamId,
        type: dropGsisId ? "add_drop" : "add",
        addGsisId: gsisId,
        dropGsisId: dropGsisId ?? null,
        createdByUserId: userId,
        processedAt: new Date(),
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "DROP_NOT_OWNED") return { error: "That player isn't on your roster" };
    if (msg.includes("roster_entries_active_owner_unique")) {
      return { error: "That player was just taken by another team" };
    }
    throw err;
  }
  return { error: null };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Mark dropped + clear from this & future unlocked lineup slots. Returns false if not owned. */
async function dropWithin(
  tx: Tx,
  leagueId: number,
  teamId: number,
  gsisId: string,
): Promise<boolean> {
  const [entry] = await tx
    .select({ id: rosterEntries.id })
    .from(rosterEntries)
    .where(
      and(
        eq(rosterEntries.leagueId, leagueId),
        eq(rosterEntries.teamId, teamId),
        eq(rosterEntries.gsisId, gsisId),
        isNull(rosterEntries.droppedAt),
      ),
    )
    .limit(1);
  if (!entry) return false;

  await tx
    .update(rosterEntries)
    .set({ droppedAt: new Date() })
    .where(eq(rosterEntries.id, entry.id));

  // Remove from any current/future lineup slots of this team.
  const teamLineups = await tx
    .select({ id: lineups.id })
    .from(lineups)
    .where(and(eq(lineups.teamId, teamId), gte(lineups.week, 1)));
  if (teamLineups.length) {
    await tx
      .update(lineupSlots)
      .set({ gsisId: null })
      .where(
        and(
          inArray(
            lineupSlots.lineupId,
            teamLineups.map((l) => l.id),
          ),
          eq(lineupSlots.gsisId, gsisId),
        ),
      );
  }
  return true;
}

export async function dropPlayer(opts: {
  leagueId: number;
  teamId: number;
  gsisId: string;
  userId: string;
}): Promise<{ error: string | null }> {
  const { leagueId, teamId, gsisId, userId } = opts;
  const ok = await db.transaction(async (tx) => {
    const dropped = await dropWithin(tx, leagueId, teamId, gsisId);
    if (dropped) {
      await tx.insert(transactions).values({
        leagueId,
        teamId,
        type: "drop",
        dropGsisId: gsisId,
        createdByUserId: userId,
        processedAt: new Date(),
      });
    }
    return dropped;
  });
  return ok ? { error: null } : { error: "That player isn't on your roster" };
}
