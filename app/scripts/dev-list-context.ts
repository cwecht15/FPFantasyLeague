/** Quick dev inventory: site admins + each league's team count and configs.
 *  npx tsx scripts/dev-list-context.ts [--prod] */
import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  if (process.argv.includes("--prod")) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (m) process.env.DATABASE_URL = m[1];
  }
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");

  const admins = await db
    .select({ email: s.users.email })
    .from(s.users)
    .where(eq(s.users.isSiteAdmin, true));
  console.log("site admins:", admins.map((a) => a.email).join(", ") || "(none)");

  const leagues = await db.select().from(s.leagues);
  for (const l of leagues) {
    const teams = await db.select().from(s.teams).where(eq(s.teams.leagueId, l.id));
    const [st] = await db
      .select()
      .from(s.leagueSettings)
      .where(eq(s.leagueSettings.leagueId, l.id))
      .limit(1);
    console.log(
      `${l.slug}: ${teams.length} teams, status=${l.status}, playoffs=${JSON.stringify(st?.playoffConfig)}`,
    );
  }
  await pool.end();
}

void main();
