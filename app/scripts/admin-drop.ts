/**
 * Admin drop: release a player from a team through the normal drop path
 * (roster entry closed, lineup slot cleared, transaction logged as the admin).
 *
 *   npx tsx scripts/admin-drop.ts <league-slug> "<team name>" <gsis-id> [--prod] [--dry]
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";

async function main() {
  const argv = process.argv.slice(2);
  const prod = argv.includes("--prod");
  const dry = argv.includes("--dry");
  const [slug, teamName, gsisId] = argv.filter((a) => !a.startsWith("--"));
  if (!slug || !teamName || !gsisId) {
    console.error('usage: npx tsx scripts/admin-drop.ts <league-slug> "<team name>" <gsis-id> [--prod] [--dry]');
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
  const { dropPlayer } = await import("../src/lib/transactions/service");

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league with slug ${slug}`);
    process.exit(1);
  }
  const [team] = await db
    .select({ id: s.teams.id, name: s.teams.name })
    .from(s.teams)
    .where(and(eq(s.teams.leagueId, league.id), eq(s.teams.name, teamName)))
    .limit(1);
  if (!team) {
    console.error(`no team named "${teamName}" in ${league.name}`);
    process.exit(1);
  }
  const [player] = await db
    .select({ name: s.players.displayName, pos: s.players.position, nfl: s.players.nflTeam })
    .from(s.players)
    .where(eq(s.players.gsisId, gsisId))
    .limit(1);
  const [admin] = await db
    .select({ id: s.users.id, email: s.users.email })
    .from(s.users)
    .where(eq(s.users.isSiteAdmin, true))
    .limit(1);
  if (!admin) {
    console.error("no site admin user found");
    process.exit(1);
  }

  console.log(
    `${league.name}: drop ${player?.name ?? gsisId} (${player?.pos ?? "?"} ${player?.nfl ?? ""}) from ${team.name} as ${admin.email}${dry ? " (dry run)" : ""}`,
  );
  if (!dry) {
    const res = await dropPlayer({ leagueId: league.id, teamId: team.id, gsisId, userId: admin.id });
    console.log(res.error ? `FAILED: ${res.error}` : "dropped");
  }
  await pool.end();
}

void main();
