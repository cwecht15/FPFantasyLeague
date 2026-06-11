/**
 * Notifications: one in_app row per event, plus best-effort email when
 * RESEND_API_KEY is set (console log in dev). Failures never break the
 * triggering action — notifying is always fire-and-forget semantics.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { notifications, teams, users } from "@/lib/db/schema";

export type NotifyType =
  | "your_turn"
  | "pick_made"
  | "trade_offer"
  | "waiver_result"
  | "matchup_result";

export interface NotifyPayload {
  type: NotifyType;
  title: string;
  body?: string;
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "FP Fantasy League <noreply@example.com>";
  if (!key) {
    console.log(`[email:dev] to=${to} subject="${subject}" body="${body}"`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text: body }),
  });
  if (!res.ok) {
    console.error(`[email] resend ${res.status}: ${await res.text()}`);
  }
}

export async function notifyUser(
  userId: string,
  leagueId: number | null,
  payload: NotifyPayload,
): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId,
      leagueId,
      type: payload.type,
      channel: "in_app",
      title: payload.title,
      body: payload.body ?? null,
    });
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (u?.email) {
      await sendEmail(u.email, payload.title, payload.body ?? payload.title);
    }
  } catch (err) {
    console.error("[notify] failed:", err instanceof Error ? err.message : err);
  }
}

export async function notifyTeamOwner(
  teamId: number,
  leagueId: number,
  payload: NotifyPayload,
): Promise<void> {
  const [t] = await db
    .select({ ownerUserId: teams.ownerUserId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (t?.ownerUserId) await notifyUser(t.ownerUserId, leagueId, payload);
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function listNotifications(userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
