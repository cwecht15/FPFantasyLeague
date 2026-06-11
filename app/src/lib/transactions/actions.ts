"use server";

/**
 * Free-agency server actions (waiver processing arrives with the worker's
 * process_waivers; direct adds apply when the league's waiver mode allows).
 */

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { addFreeAgent, dropPlayer } from "@/lib/transactions/service";

export interface TxFormState {
  error: string | null;
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

  // Waiver leagues queue a claim; free-agency leagues add instantly.
  if (settings.waiverConfig.mode !== "none") {
    const { createClaim } = await import("@/lib/transactions/waivers");
    const bidRaw = formData.get("bid");
    const result = await createClaim({
      leagueId: ctx.league.id,
      teamId: ctx.myTeam.id,
      gsisId,
      dropGsisId,
      bidAmount: bidRaw ? Number(bidRaw) : 0,
      config: settings.waiverConfig,
    });
    if (!result.error) revalidatePath(`/leagues/${slug}/transactions`);
    return result.error ? result : { error: null };
  }

  const result = await addFreeAgent({
    leagueId: ctx.league.id,
    teamId: ctx.myTeam.id,
    gsisId,
    userId: user.id,
    template: settings.rosterTemplate,
    dropGsisId,
  });
  if (!result.error) {
    revalidatePath(`/leagues/${slug}/players`);
    revalidatePath(`/leagues/${slug}/lineup`);
  }
  return result;
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

  const result = await dropPlayer({
    leagueId: ctx.league.id,
    teamId: ctx.myTeam.id,
    gsisId,
    userId: user.id,
  });
  if (!result.error) {
    revalidatePath(`/leagues/${slug}/players`);
    revalidatePath(`/leagues/${slug}/lineup`);
  }
  return result;
}
