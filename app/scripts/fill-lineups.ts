/**
 * Materialize and auto-fill every team's lineup for a week (the same
 * ensureLineup + fillEmptyLineup pass the lineup page runs on view), so teams
 * whose managers never open the page still have their starters set before
 * kickoff. Existing slot assignments are never touched; only empty slots get
 * filled from unslotted roster players, and nobody whose game already kicked
 * off is auto-started.
 *
 *   npx tsx scripts/fill-lineups.ts <league-slug> <week> [--prod] [--dry]
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";

async function main() {
  const argv = process.argv.slice(2);
  const prod = argv.includes("--prod");
  const dry = argv.includes("--dry");
  const [slug, weekArg] = argv.filter((a) => !a.startsWith("--"));
  const week = Number(weekArg);
  if (!slug || !Number.isInteger(week) || week < 1) {
    console.error("usage: npx tsx scripts/fill-lineups.ts <league-slug> <week> [--prod] [--dry]");
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
  const { ensureLineup, fillEmptyLineup } = await import("../src/lib/lineups/service");
  const { getSettings } = await import("../src/lib/leagues/service");

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league with slug ${slug}`);
    process.exit(1);
  }
  const settings = await getSettings(league.id);
  const teams = await db
    .select({ id: s.teams.id, name: s.teams.name })
    .from(s.teams)
    .where(eq(s.teams.leagueId, league.id))
    .orderBy(s.teams.name);

  const emptyStarters = async (teamId: number) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.lineupSlots)
      .innerJoin(s.lineups, eq(s.lineups.id, s.lineupSlots.lineupId))
      .where(
        and(
          eq(s.lineups.teamId, teamId),
          eq(s.lineups.season, league.season),
          eq(s.lineups.week, week),
          isNull(s.lineupSlots.gsisId),
          sql`${s.lineupSlots.slot} not in ('BENCH', 'IR')`,
        ),
      );
    return row?.n ?? 0;
  };
  const unslotted = async (teamId: number) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.rosterEntries)
      .where(
        and(
          eq(s.rosterEntries.teamId, teamId),
          isNull(s.rosterEntries.droppedAt),
          sql`not exists (select 1 from ${s.lineupSlots} ls join ${s.lineups} li on li.id = ls.lineup_id
                where li.team_id = ${teamId} and li.season = ${league.season} and li.week = ${week}
                  and ls.gsis_id = ${s.rosterEntries.gsisId})`,
        ),
      );
    return row?.n ?? 0;
  };

  console.log(`${league.name} — week ${week}${dry ? " (dry run)" : ""}`);
  for (const t of teams) {
    const before = { empty: await emptyStarters(t.id), unslotted: await unslotted(t.id) };
    if (!dry) {
      const lineupId = await ensureLineup(t.id, league.season, week, settings.rosterTemplate);
      await fillEmptyLineup(t.id, league.season, week, settings.rosterTemplate, lineupId);
    }
    const after = dry ? before : { empty: await emptyStarters(t.id), unslotted: await unslotted(t.id) };
    console.log(
      `  ${t.name.padEnd(22)} empty starters ${before.empty} -> ${after.empty}   unslotted ${before.unslotted} -> ${after.unslotted}`,
    );
  }
  await pool.end();
}

void main();
