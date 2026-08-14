/** Probe getLineupView for every team in a league and report any invalid
 *  kickoff dates (the RSC serializer throws RangeError on them).
 *
 *  npx tsx scripts/dev-lineup-probe.ts <slug> [--prod]
 */
import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const [slug] = args.filter((a) => a !== "--prod");
  if (prod) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (!m) throw new Error("APP_DB_URL not found");
    process.env.DATABASE_URL = m[1];
    process.env.EMAIL_MODE = "log";
  }

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { getLineupView } = await import("../src/lib/lineups/service");
  const { getSettings } = await import("../src/lib/leagues/service");
  const { leagueCurrentWeek } = await import("../src/lib/nfl/week");

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) throw new Error(`no league ${slug}`);
  const week = await leagueCurrentWeek(league.id, league.season);
  console.log(`league ${slug} season ${league.season} currentWeek ${week}`);
  const settings = await getSettings(league.id);
  const teams = await db.select().from(s.teams).where(eq(s.teams.leagueId, league.id));

  let bad = 0;
  for (const t of teams) {
    const { slots, roster } = await getLineupView(
      league.id,
      t.id,
      league.season,
      week,
      settings.rosterTemplate,
    );
    for (const x of [...slots, ...roster]) {
      const k = x.kickoffAt;
      if (k && !Number.isFinite(k.getTime())) {
        bad++;
        console.log(`INVALID kickoff: team=${t.name}`, JSON.stringify(x));
      }
    }
    console.log(`${t.name}: ${slots.length} slots, ${roster.length} rostered — ok`);
  }
  console.log(bad ? `${bad} INVALID DATES` : "all kickoff dates valid");
  await pool.end();
}

void main();
