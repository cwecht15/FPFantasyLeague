/**
 * Switch a league (or every league) between waiver modes:
 *   faab     — house rule: game-locked players via blind $ bids, Wed 3AM ET
 *   priority — legacy rolling-priority claims
 *   none     — pure first-come free agency
 *
 * Also backfills processDow/processHourEt/faabBudget defaults on old configs.
 *
 *   npx tsx scripts/set-waiver-mode.ts <league-slug|all> <faab|priority|none> [--prod]
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const [target, modeArg] = args.filter((a) => a !== "--prod");
  const mode = modeArg as "faab" | "priority" | "none";
  if (!target || !["faab", "priority", "none"].includes(mode)) {
    console.error("usage: npx tsx scripts/set-waiver-mode.ts <league-slug|all> <faab|priority|none> [--prod]");
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

  const leagues =
    target === "all"
      ? await db.select().from(s.leagues)
      : await db.select().from(s.leagues).where(eq(s.leagues.slug, target));
  if (leagues.length === 0) {
    console.error(`no league(s) matching ${target}`);
    process.exit(1);
  }

  for (const league of leagues) {
    const [row] = await db
      .select()
      .from(s.leagueSettings)
      .where(eq(s.leagueSettings.leagueId, league.id))
      .limit(1);
    if (!row) continue;
    const cur = row.waiverConfig as Record<string, unknown>;
    const nextConfig = {
      mode,
      processDow: typeof cur.processDow === "number" ? cur.processDow : 3,
      processHourEt: typeof cur.processHourEt === "number" ? cur.processHourEt : 3,
      faabBudget: typeof cur.faabBudget === "number" ? cur.faabBudget : 100,
    };
    await db
      .update(s.leagueSettings)
      .set({ waiverConfig: nextConfig })
      .where(eq(s.leagueSettings.leagueId, league.id));
    console.log(`${league.slug}: waivers -> ${JSON.stringify(nextConfig)}`);
  }
  await pool.end();
}

void main();
