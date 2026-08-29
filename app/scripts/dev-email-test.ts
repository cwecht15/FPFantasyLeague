/**
 * Send one test email through the app's configured transport and report what
 * happened. Verifies credentials end to end (SMTP AUTH, then a real send) so
 * email problems surface here rather than silently in a notification.
 *
 * Run:  npx tsx scripts/dev-email-test.ts <to-address>
 */

import "../src/lib/db/load-env";
import { SITE_NAME } from "../src/lib/brand";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("usage: npx tsx scripts/dev-email-test.ts <to-address>");
    process.exit(1);
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "");
  const from = process.env.EMAIL_FROM ?? (user ? `${SITE_NAME} <${user}>` : "");
  console.log(
    `transport: ${user ? `SMTP (${process.env.SMTP_HOST ?? "smtp.gmail.com"} as ${user})` : process.env.RESEND_API_KEY ? "Resend" : "none — would log only"}`,
  );
  if (!user || !pass) {
    console.error("SMTP_USER / SMTP_PASS not set in the environment");
    process.exit(1);
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user, pass },
  });

  await transport.verify();
  console.log("SMTP auth: ok");

  const info = await transport.sendMail({
    from,
    to,
    subject: `${SITE_NAME} — email test (em dash · middot)`,
    text:
      "Sent through the app's own transport.\n\n" +
      "Your draft pick is up — make it at /leagues/<slug>/draft · results post Tuesday 6:00 AM ET",
  });
  console.log(`accepted: ${info.accepted.join(", ")}`);
  console.log(`rejected: ${info.rejected.length ? info.rejected.join(", ") : "none"}`);
  console.log(`server:   ${info.response}`);
  transport.close();
}

void main().catch((err) => {
  console.error(`FAIL: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
