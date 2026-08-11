/**
 * Set a league's playoff mode:
 *   bracket      — standard in-league playoffs: top N by record (points-for
 *                  tiebreak) seed a bracket from startWeek, one week per round
 *                  (house: top 6, weeks 15-17, seeds 1-2 first-round byes).
 *   championship — no in-league bracket; the league only feeds the
 *                  cross-league championship sprint (the default).
 *
 * The bracket itself is created/advanced automatically by the worker's rollup
 * once the regular season is final (lib/matchups/playoffs.ts).
 *
 * Run against the target DB (DATABASE_URL / .env.local):
 *   npx tsx scripts/set-playoff-mode.ts <league-slug> <bracket|championship> [teams] [startWeek]
 *   npx tsx scripts/set-playoff-mode.ts real-league-abc123 bracket        # top 6, weeks 15-17
 */

import "../src/lib/db/load-env";
import { eq, sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { playoffConfigSchema } = await import("../src/lib/leagues/settings");

  const slug = process.argv[2];
  const mode = process.argv[3];
  if (!slug || (mode !== "bracket" && mode !== "championship")) {
    console.error(
      "usage: npx tsx scripts/set-playoff-mode.ts <league-slug> <bracket|championship> [teams] [startWeek]",
    );
    process.exit(1);
  }

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league with slug ${slug}`);
    process.exit(1);
  }

  const [settings] = await db
    .select()
    .from(s.leagueSettings)
    .where(eq(s.leagueSettings.leagueId, league.id))
    .limit(1);

  const next = playoffConfigSchema.parse({
    ...settings.playoffConfig,
    mode,
    ...(process.argv[4] ? { teams: Number(process.argv[4]) } : {}),
    ...(process.argv[5] ? { startWeek: Number(process.argv[5]) } : {}),
  });

  await db
    .update(s.leagueSettings)
    .set({
      playoffConfig: next,
      version: sql`${s.leagueSettings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(s.leagueSettings.leagueId, league.id));

  console.log(`${league.name} (${slug}) playoff config:`, next);
  if (next.mode === "bracket") {
    const rounds = Math.ceil(Math.log2(Math.max(2, next.teams)));
    console.log(
      `bracket: top ${next.teams} by record (points-for tiebreak), weeks ${next.startWeek}-${
        next.startWeek + rounds - 1
      }`,
    );
  }
  await pool.end();
}

void main();
