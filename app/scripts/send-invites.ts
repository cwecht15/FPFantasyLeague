/**
 * Email league invite links through the app's SMTP transport. Each recipient
 * gets the /join/<code> link, which handles both new signups and existing
 * accounts.
 * Run:  npx tsx scripts/send-invites.ts <inviteCode> <email> [email...]
 */
import "../src/lib/db/load-env";
import { SITE_NAME, SITE_URL } from "../src/lib/brand";

async function main() {
  const [code, ...recipients] = process.argv.slice(2);
  if (!code || recipients.length === 0) {
    console.error("usage: npx tsx scripts/send-invites.ts <inviteCode> <email...>");
    process.exit(1);
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  if (!user || !pass) {
    console.error("SMTP_USER / SMTP_PASS not set");
    process.exit(1);
  }
  const from = process.env.EMAIL_FROM ?? `${SITE_NAME} <${user}>`;

  // Public origin of the site — the same AUTH_URL secret the app uses for
  // password-reset and on-the-clock links. Falls back to the Fly hostname.
  const base = (process.env.AUTH_URL ?? SITE_URL).replace(/\/$/, "");
  const link = `${base}/join/${code}`;
  const subject = `You're invited — ${SITE_NAME}`;
  const body = [
    `You're invited to ${SITE_NAME}.`,
    "",
    `Join here: ${link}`,
    "",
    "New here? The link lets you pick a username, password, and team name in one step.",
    "Already have an account? Click \"Sign in\" on that page and use your existing login",
    "(same email as this one — use Forgot password if you need to reset it).",
    "",
    "The draft will be started once every manager has joined.",
  ].join("\n");

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user, pass },
  });
  await transport.verify();
  console.log("SMTP auth: ok");

  for (const to of recipients) {
    const info = await transport.sendMail({ from, to, subject, text: body });
    console.log(
      `${to}: accepted=${info.accepted.length ? info.accepted.join(",") : "none"} rejected=${info.rejected.length ? info.rejected.join(",") : "none"}`,
    );
  }
  transport.close();
}

void main().catch((err) => {
  console.error(`FAIL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
