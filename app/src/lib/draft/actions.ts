"use server";

/**
 * Draft server actions: start (admin), make pick (on-clock manager), pause/
 * resume (admin), and queue management.
 */

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { draftQueue } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { getDraft, makePick, setDraftPaused, startDraft } from "@/lib/draft/service";

export interface DraftFormState {
  error: string | null;
}

export async function startDraftAction(
  _prev: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return { error: "Site admin only" };
  const slug = String(formData.get("slug") ?? "");
  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx) return { error: "League not found" };

  const settings = await getSettings(ctx.league.id);
  const result = await startDraft(ctx.league.id, settings.draftConfig);
  if (result.error) return { error: result.error };
  revalidatePath(`/leagues/${slug}/draft`);
  return { error: null };
}

export async function makePickAction(
  _prev: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const gsisId = String(formData.get("gsisId") ?? "");
  if (!gsisId) return { error: "Pick a player" };

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx) return { error: "League not found" };
  const draft = await getDraft(ctx.league.id);
  if (!draft) return { error: "No draft" };

  const result = await makePick({
    draftId: draft.id,
    gsisId,
    byUserId: user.id,
    force: user.isSiteAdmin, // admins may pick for an absent team
  });
  if (result.error) return { error: result.error };
  revalidatePath(`/leagues/${slug}/draft`);
  return { error: null };
}

export async function pauseDraftAction(
  _prev: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return { error: "Site admin only" };
  const slug = String(formData.get("slug") ?? "");
  const paused = String(formData.get("paused")) === "true";
  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx) return { error: "League not found" };
  const draft = await getDraft(ctx.league.id);
  if (!draft) return { error: "No draft" };
  await setDraftPaused(draft.id, paused);
  revalidatePath(`/leagues/${slug}/draft`);
  return { error: null };
}

export async function queueAddAction(
  _prev: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const gsisId = String(formData.get("gsisId") ?? "");
  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "No team" };
  const draft = await getDraft(ctx.league.id);
  if (!draft) return { error: "No draft yet — the admin starts it" };

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${draftQueue.rank}), 0)` })
    .from(draftQueue)
    .where(and(eq(draftQueue.draftId, draft.id), eq(draftQueue.teamId, ctx.myTeam.id)));
  try {
    await db.insert(draftQueue).values({
      draftId: draft.id,
      teamId: ctx.myTeam.id,
      gsisId,
      rank: Number(maxRow?.max ?? 0) + 1,
    });
  } catch {
    return { error: "Already queued" };
  }
  revalidatePath(`/leagues/${slug}/draft`);
  return { error: null };
}

export async function queueRemoveAction(
  _prev: DraftFormState,
  formData: FormData,
): Promise<DraftFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const id = Number(formData.get("queueId"));
  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "No team" };
  await db
    .delete(draftQueue)
    .where(and(eq(draftQueue.id, id), eq(draftQueue.teamId, ctx.myTeam.id)));
  revalidatePath(`/leagues/${slug}/draft`);
  return { error: null };
}

export async function listMyQueue(leagueId: number, teamId: number) {
  const draft = await getDraft(leagueId);
  if (!draft) return [];
  return db
    .select()
    .from(draftQueue)
    .where(and(eq(draftQueue.draftId, draft.id), eq(draftQueue.teamId, teamId)))
    .orderBy(asc(draftQueue.rank));
}
