/**
 * Make a league publicly viewable (or private again). Public leagues get
 * anonymous read-only spectator pages at /watch/<slug> — draft board,
 * matchups, standings. Demo leagues stay hidden regardless.
 *
 *   npx tsx scripts/set-league-visibility.ts <league-slug> <public|private> [--prod]
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const [slug, visArg] = args.filter((a) => a !== "--prod");
  const visibility = visArg as "public" | "private";
  if (!slug || !["public", "private"].includes(visibility)) {
    console.error("usage: npx tsx scripts/set-league-visibility.ts <league-slug> <public|private> [--prod]");
    process.exit(1);
  }
  if (prod) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (!m) {
      console.error("APP_DB_URL not found in ../tools/scoring/.env");
      process.exit(1);
    }
    process.env.DATABASE_URL = m[1];
  }

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league matching ${slug}`);
    process.exit(1);
  }
  if (league.isDemo && visibility === "public") {
    console.error(`${slug} is a demo league — demo leagues are never public`);
    process.exit(1);
  }

  await db.update(s.leagues).set({ visibility }).where(eq(s.leagues.id, league.id));
  console.log(`${league.slug}: visibility -> ${visibility}`);
  if (visibility === "public") {
    console.log(`spectator pages: /watch/${league.slug}`);
  }
  await pool.end();
}

void main();
