/**
 * (Re)generate a league's regular-season schedule from the CLI — same code
 * path as the admin Settings button (round-robin, weeks 1..playoffStart-1).
 *
 *   npx tsx scripts/generate-schedule.ts <league-slug> [--prod]
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const [slug] = args.filter((a) => a !== "--prod");
  if (!slug) {
    console.error("usage: npx tsx scripts/generate-schedule.ts <league-slug> [--prod]");
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
    process.env.EMAIL_MODE = "log";
  }

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { generateSchedule } = await import("../src/lib/matchups/schedule");
  const { getSettings } = await import("../src/lib/leagues/service");

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league with slug ${slug}`);
    process.exit(1);
  }
  const settings = await getSettings(league.id);
  const lastWeek = Math.max(1, settings.playoffConfig.startWeek - 1);
  const created = await generateSchedule(league.id, league.season, lastWeek);
  console.log(`${slug}: ${created} matchups created for weeks 1–${lastWeek}`);
  await pool.end();
}

void main();
