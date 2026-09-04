/**
 * League-wide announcement: one in-app alert + best-effort email per member,
 * through the normal notifications service.
 *
 *   npx tsx scripts/announce.ts <league-slug> <subject> <body-file> [--prod] [--dry]
 *
 * --dry lists recipients without writing or sending anything.
 * --prod targets the production DB AND clears EMAIL_MODE=log so emails really
 * send (local runs keep the .env.local log-only safety valve).
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  const argv = process.argv.slice(2);
  const prod = argv.includes("--prod");
  const dry = argv.includes("--dry");
  const [slug, subject, bodyFile] = argv.filter((a) => !a.startsWith("--"));
  if (!slug || !subject || !bodyFile) {
    console.error("usage: npx tsx scripts/announce.ts <league-slug> <subject> <body-file> [--prod] [--dry]");
    process.exit(1);
  }
  const body = readFileSync(resolve(process.cwd(), bodyFile), "utf8").trim();

  if (prod) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (!m) {
      console.error("APP_DB_URL not found in ../tools/scoring/.env");
      process.exit(1);
    }
    process.env.DATABASE_URL = m[1];
    delete process.env.EMAIL_MODE; // .env.local forces log-only; prod sends for real
  }

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { notifyUser } = await import("../src/lib/notifications/service");

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league with slug ${slug}`);
    process.exit(1);
  }
  const members = await db
    .select({ userId: s.leagueMembers.userId, email: s.users.email, name: s.users.displayName })
    .from(s.leagueMembers)
    .innerJoin(s.users, eq(s.users.id, s.leagueMembers.userId))
    .where(eq(s.leagueMembers.leagueId, league.id));

  console.log(`${league.name}: ${members.length} members${dry ? " (dry run)" : ""}`);
  console.log(`subject: ${subject}\n---\n${body}\n---`);
  for (const m of members) {
    if (dry) {
      console.log(`would notify ${m.name ?? m.userId} <${m.email}>`);
      continue;
    }
    await notifyUser(m.userId, league.id, { type: "announcement", title: subject, body });
    console.log(`notified ${m.name ?? m.userId} <${m.email}>`);
  }
  await pool.end();
}

void main();
