/**
 * Set a league's playoff mode (or every league with `all`):
 *   bracket      — the house format: top N by WINS (points-for breaks ties)
 *                  seed a bracket from startWeek, one week per round
 *                  (house: top 6, weeks 15-17, seeds 1-2 first-round byes).
 *   championship — retired cross-league sprint; kept only so old stored
 *                  configs still parse. Don't set this.
 *
 * The bracket itself is created/advanced automatically by the worker's rollup
 * once the regular season is final (lib/matchups/playoffs.ts).
 *
 *   npx tsx scripts/set-playoff-mode.ts <league-slug|all> <bracket|championship> [teams] [startWeek] [--prod]
 *   npx tsx scripts/set-playoff-mode.ts all bracket 6 15 --prod
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";

async function main() {
  const argv = process.argv.slice(2);
  const prod = argv.includes("--prod");
  const [slug, mode, teamsArg, startArg] = argv.filter((a) => a !== "--prod");
  if (!slug || (mode !== "bracket" && mode !== "championship")) {
    console.error(
      "usage: npx tsx scripts/set-playoff-mode.ts <league-slug|all> <bracket|championship> [teams] [startWeek] [--prod]",
    );
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
  const { playoffConfigSchema } = await import("../src/lib/leagues/settings");

  const leagues =
    slug === "all"
      ? await db.select().from(s.leagues)
      : await db.select().from(s.leagues).where(eq(s.leagues.slug, slug));
  if (leagues.length === 0) {
    console.error(`no league(s) matching ${slug}`);
    process.exit(1);
  }

  for (const league of leagues) {
    const [settings] = await db
      .select()
      .from(s.leagueSettings)
      .where(eq(s.leagueSettings.leagueId, league.id))
      .limit(1);
    if (!settings) continue;

    const next = playoffConfigSchema.parse({
      ...settings.playoffConfig,
      mode,
      ...(teamsArg ? { teams: Number(teamsArg) } : {}),
      ...(startArg ? { startWeek: Number(startArg) } : {}),
    });

    await db
      .update(s.leagueSettings)
      .set({
        playoffConfig: next,
        version: sql`${s.leagueSettings.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(s.leagueSettings.leagueId, league.id));

    const rounds = Math.ceil(Math.log2(Math.max(2, next.teams)));
    console.log(
      `${league.slug}: ${next.mode} — top ${next.teams} by wins (PF tiebreak), weeks ` +
        `${next.startWeek}-${next.startWeek + rounds - 1}`,
    );
  }
  await pool.end();
}

void main();
