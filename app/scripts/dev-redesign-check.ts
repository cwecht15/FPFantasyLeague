/** Exercise the Game Day redesign's new data paths against the dev DB. */
import "../src/lib/db/load-env";
import { eq } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { getHomeData } = await import("../src/lib/leagues/home");
  const { getSettings } = await import("../src/lib/leagues/service");
  const { getLineupView } = await import("../src/lib/lineups/service");

  const [lg] = await db
    .select()
    .from(s.leagues)
    .where(eq(s.leagues.name, "FP Demo Season League"));
  if (!lg) throw new Error("demo season league missing");
  const teams = await db.select().from(s.teams).where(eq(s.teams.leagueId, lg.id));
  const team = teams[0];

  const home = await getHomeData(lg, team);
  console.log(
    `home: week=${home.week} standings=${home.standings.length} matchup=${home.matchup ? `vs ${home.matchup.oppName} (${home.matchup.myPoints ?? "—"})` : "none"} lineup=${home.lineup.filled}/${home.lineup.total} lastWeek=${home.lastWeek ? (home.lastWeek.won ? "W" : "L") : "—"}`,
  );

  // matchup detail data path: both lineups for the home matchup's week
  const [m] = await db
    .select()
    .from(s.matchups)
    .where(eq(s.matchups.leagueId, lg.id))
    .limit(1);
  const settings = await getSettings(lg.id);
  const hv = await getLineupView(lg.id, m.homeTeamId, lg.season, m.week, settings.rosterTemplate);
  const av = await getLineupView(lg.id, m.awayTeamId!, lg.season, m.week, settings.rosterTemplate);
  console.log(
    `matchup detail: W${m.week} homeSlots=${hv.slots.length} awaySlots=${av.slots.length} scored=${hv.slots.filter((x) => x.points !== null).length}`,
  );

  console.log("REDESIGN DATA CHECK PASS");
  await pool.end();
}

void main();
