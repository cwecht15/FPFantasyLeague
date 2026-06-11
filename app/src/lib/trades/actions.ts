"use server";

/** Trade server actions: propose, accept/reject/cancel, admin approve/veto. */

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { proposeTrade, resolveTrade, respondToTrade } from "@/lib/trades/service";
import { notifyTeamOwner } from "@/lib/notifications/service";

export interface TradeFormState {
  error: string | null;
}

export async function proposeTradeAction(
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const receivingTeamId = Number(formData.get("receivingTeamId"));
  const give = formData.getAll("give").map(String).filter(Boolean);
  const get = formData.getAll("get").map(String).filter(Boolean);

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "You don't have a team in this league" };

  const result = await proposeTrade({
    leagueId: ctx.league.id,
    proposingTeamId: ctx.myTeam.id,
    receivingTeamId,
    give,
    get,
  });
  if (result.error) return { error: result.error };

  await notifyTeamOwner(receivingTeamId, ctx.league.id, {
    type: "trade_offer",
    title: `Trade offer from ${ctx.myTeam.name}`,
    body: `${give.length}-for-${get.length} player trade — review it on the Trades tab.`,
  });
  revalidatePath(`/leagues/${slug}/trades`);
  return { error: null };
}

export async function respondTradeAction(
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const tradeId = Number(formData.get("tradeId"));
  const accept = String(formData.get("accept")) === "true";

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx?.myTeam) return { error: "You don't have a team in this league" };

  const result = await respondToTrade({ tradeId, teamId: ctx.myTeam.id, accept });
  if (result.error) return { error: result.error };
  revalidatePath(`/leagues/${slug}/trades`);
  return { error: null };
}

export async function resolveTradeAction(
  _prev: TradeFormState,
  formData: FormData,
): Promise<TradeFormState> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return { error: "Site admin only" };
  const slug = String(formData.get("slug") ?? "");
  const tradeId = Number(formData.get("tradeId"));
  const approve = String(formData.get("approve")) === "true";

  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx) return { error: "League not found" };

  const settings = await getSettings(ctx.league.id);
  const result = await resolveTrade({ tradeId, approve, template: settings.rosterTemplate });
  if (result.error) return { error: result.error };
  revalidatePath(`/leagues/${slug}/trades`);
  revalidatePath(`/leagues/${slug}/roster`);
  return { error: null };
}
