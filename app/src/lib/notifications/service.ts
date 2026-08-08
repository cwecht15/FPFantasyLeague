/**
 * Notifications: one in_app row per event, plus best-effort email.
 *
 * Transport is whichever is configured, in order:
 *   1. SMTP  — SMTP_USER + SMTP_PASS (e.g. a Gmail account with an App
 *      Password). Needs no sending domain, so it's the zero-cost option.
 *   2. Resend — RESEND_API_KEY, which requires a verified sending domain
 *      before it will deliver to anyone but the account owner.
 *   3. Neither — log the message and move on (local dev).
 *
 * Failures never break the triggering action: notifying is always
 * fire-and-forget.
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

/** Lazily-built SMTP transport, reused across sends (one pooled connection
 *  rather than a TCP+TLS handshake per notification). */
let smtpTransport: import("nodemailer").Transporter | null = null;

async function getSmtpTransport(): Promise<import("nodemailer").Transporter | null> {
  const user = process.env.SMTP_USER;
  // Google shows App Passwords as "abcd efgh ijkl mnop"; the spaces are display
  // only and SMTP AUTH rejects them, so strip whatever was pasted in.
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  if (!smtpTransport) {
    const nodemailer = await import("nodemailer");
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465, // implicit TLS on 465, STARTTLS on 587
      auth: { user, pass },
      pool: true,
    });
  }
  return smtpTransport;
}

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  // Gmail rewrites From to the authenticated account anyway, so default the
  // sender to SMTP_USER when EMAIL_FROM isn't set for this transport.
  const from =
    process.env.EMAIL_FROM ??
    (process.env.SMTP_USER ? `FP Fantasy League <${process.env.SMTP_USER}>` : null) ??
    "FP Fantasy League <noreply@example.com>";

  const smtp = await getSmtpTransport();
  if (smtp) {
    await smtp.sendMail({ from, to, subject, text: body });
    return;
  }

  const key = process.env.RESEND_API_KEY;
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
