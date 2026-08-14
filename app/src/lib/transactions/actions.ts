"use server";

/**
 * Free-agency server actions under the game-lock rule: a player is an instant
 * free-agent add until their NFL game kicks off; from kickoff they are locked
 * (in lineups, on benches, and in the pool) and can only be claimed by FAAB
 * bid, processed at the weekly waiver boundary (Wednesday 3:00 AM ET).
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { lockedNflTeams } from "@/lib/transactions/game-lock";
import { addFreeAgent, dropPlayer } from "@/lib/transactions/service";

export interface TxFormState {
  error: string | null;
  notice?: string;
}

const LOCKED_MSG = "locked — game started; goes through waivers (Wed 3:00 AM ET)";

async function playerTeam(gsisId: string): Promise<string | null> {
  const [p] = await db
    .select({ nflTeam: players.nflTeam })
    .from(players)
    .where(eq(players.gsisId, gsisId))
    .limit(1);
  return p?.nflTeam ?? null;
}

export async function addPlayerAction(
  _prev: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const gsisId = String(formData.get("gsisId") ?? "");
  const dropGsisId = String(formData.get("dropGsisId") ?? "") || null;
  if (!gsisId) return { error: "Missing player" };

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "You don't have a team in this league" };
  if (ctx.league.status === "complete") return { error: "League is complete" };

  const settings = await getSettings(ctx.league.id);
  const config = settings.waiverConfig;

  const locked =
    config.mode === "none" ? new Set<string>() : await lockedNflTeams(ctx.league.season);
  const addTeam = await playerTeam(gsisId);
  const addLocked = !!addTeam && locked.has(addTeam);

  // Locked player → FAAB claim, processed at the weekly boundary.
  if (addLocked && config.mode !== "none") {
    const { createClaim } = await import("@/lib/transactions/waivers");
    const bidRaw = formData.get("bid");
    const result = await createClaim({
      leagueId: ctx.league.id,
      teamId: ctx.myTeam.id,
      gsisId,
      dropGsisId,
      bidAmount: bidRaw ? Number(bidRaw) : 0,
      config,
    });
    if (result.error) return result;
    revalidatePath(`/leagues/${slug}/transactions`);
    revalidatePath(`/leagues/${slug}/players`);
    return { error: null, notice: "Waiver claim placed" };
  }

  // Unlocked player → instant add; a same-time drop must be unlocked too.
  if (dropGsisId) {
    const dropTeam = await playerTeam(dropGsisId);
    if (dropTeam && locked.has(dropTeam)) {
      return { error: `Can't drop — that player is ${LOCKED_MSG}` };
    }
  }
  const result = await addFreeAgent({
    leagueId: ctx.league.id,
    teamId: ctx.myTeam.id,
    gsisId,
    userId: user.id,
    template: settings.rosterTemplate,
    dropGsisId,
  });
  if (result.error) return result;
  revalidatePath(`/leagues/${slug}/players`);
  revalidatePath(`/leagues/${slug}/lineup`);
  return { error: null, notice: "Player added" };
}

export async function dropPlayerAction(
  _prev: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const gsisId = String(formData.get("gsisId") ?? "");
  if (!gsisId) return { error: "Missing player" };

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "You don't have a team in this league" };

  const settings = await getSettings(ctx.league.id);
  if (settings.waiverConfig.mode !== "none") {
    const dropTeam = await playerTeam(gsisId);
    if (dropTeam) {
      const locked = await lockedNflTeams(ctx.league.season);
      if (locked.has(dropTeam)) return { error: `Can't drop — that player is ${LOCKED_MSG}` };
    }
  }

  const result = await dropPlayer({
    leagueId: ctx.league.id,
    teamId: ctx.myTeam.id,
    gsisId,
    userId: user.id,
  });
  if (result.error) return result;
  revalidatePath(`/leagues/${slug}/players`);
  revalidatePath(`/leagues/${slug}/lineup`);
  return { error: null, notice: "Player dropped" };
}

export async function cancelClaimAction(
  _prev: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const claimId = Number(formData.get("claimId"));
  if (!Number.isInteger(claimId)) return { error: "Missing claim" };

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "You don't have a team in this league" };

  const { cancelClaim } = await import("@/lib/transactions/waivers");
  const result = await cancelClaim({
    leagueId: ctx.league.id,
    teamId: ctx.myTeam.id,
    claimId,
  });
  if (result.error) return result;
  revalidatePath(`/leagues/${slug}/transactions`);
  return { error: null, notice: "Claim cancelled" };
}
