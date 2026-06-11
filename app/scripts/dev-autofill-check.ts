/** Verify the never-empty lineup autofill: week 9 of the mid-season demo
 *  league should inherit week 8's arrangement on first view. */
import "../src/lib/db/load-env";
import { eq } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { getLineupView } = await import("../src/lib/lineups/service");
  const { getSettings } = await import("../src/lib/leagues/service");

  const [lg] = await db
    .select()
    .from(s.leagues)
    .where(eq(s.leagues.name, "FP Demo Season League"));
  if (!lg) throw new Error("demo season league missing");
  const [team] = await db.select().from(s.teams).where(eq(s.teams.leagueId, lg.id));
  const settings = await getSettings(lg.id);

  const v = await getLineupView(lg.id, team.id, lg.season, 9, settings.rosterTemplate);
  const starters = v.slots.filter((x) => x.slot !== "BENCH" && x.slot !== "IR");
  console.log(`week 9 slots filled: ${v.slots.filter((x) => x.gsisId).length}/${v.slots.length}`);
  console.log(`starters empty: ${starters.filter((x) => !x.gsisId).length}`);
  console.log(
    "starters:",
    starters.map((x) => `${x.slot}${x.slotIndex > 0 ? x.slotIndex + 1 : ""}=${x.playerName}`).join(", "),
  );
  await pool.end();
}

void main();
