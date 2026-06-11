"use server";

/**
 * Lineup server action: set/clear a slot. Authorization re-derived from the
 * session; the slot must belong to the caller's own team's lineup.
 */

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { saveLineup, setLineupSlot } from "@/lib/lineups/service";

export interface SlotFormState {
  error: string | null;
  notice?: string;
}

/** Global save: every slot select posts as slot_<slotId>=<gsisId|""> */
export async function saveLineupAction(
  _prev: SlotFormState,
  formData: FormData,
): Promise<SlotFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const week = Number(formData.get("week"));

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "You don't have a team in this league" };
  if (!week || week < 1 || week > 18) return { error: "Invalid week" };

  const desired = new Map<number, string | null>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("slot_")) continue;
    const slotId = Number(key.slice(5));
    if (!Number.isInteger(slotId)) continue;
    const v = String(value);
    desired.set(slotId, v === "" ? null : v);
  }

  const settings = await getSettings(ctx.league.id);
  const result = await saveLineup({
    leagueId: ctx.league.id,
    teamId: ctx.myTeam.id,
    season: ctx.league.season,
    week,
    template: settings.rosterTemplate,
    desired,
  });

  revalidatePath(`/leagues/${slug}/lineup`);
  if (result.error) return { error: result.error };
  return {
    error: null,
    notice:
      result.skipped.length > 0
        ? `Saved — skipped: ${result.skipped.join(", ")}`
        : "Lineup saved",
  };
}

export async function setSlotAction(
  _prev: SlotFormState,
  formData: FormData,
): Promise<SlotFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const week = Number(formData.get("week"));
  const slotId = Number(formData.get("slotId"));
  const raw = String(formData.get("gsisId") ?? "");
  const gsisId = raw === "" ? null : raw;

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "You don't have a team in this league" };
  if (!week || week < 1 || week > 18) return { error: "Invalid week" };

  const settings = await getSettings(ctx.league.id);
  const result = await setLineupSlot({
    leagueId: ctx.league.id,
    teamId: ctx.myTeam.id,
    season: ctx.league.season,
    week,
    template: settings.rosterTemplate,
    slotId,
    gsisId,
  });

  if (!result.error) revalidatePath(`/leagues/${slug}/lineup`);
  return result;
}
