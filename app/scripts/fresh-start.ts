/**
 * Wipe a database back to "just the site admins" and create one fresh league —
 * the reset used before Season 1 (2026-08-30) to retire the mock-draft league.
 *
 *   npx tsx scripts/fresh-start.ts --name "Scott Bear Bowl 2026" [--season 2026]
 *       [--teams 12] [--preset fp_advanced] [--keep-users] [--prod] [--yes]
 *
 * Without --yes it only prints what WOULD be deleted/created. With --yes it:
 *   1. deletes EVERY league (cascades teams, drafts, picks, lineups, matchups,
 *      standings, waivers, transactions, notifications),
 *   2. deletes every non-admin user (their sessions/accounts cascade) unless
 *      --keep-users,
 *   3. creates the league via createLeague (same path as the admin form) with
 *      NO pick clock and rounds = roster size, and prints its invite link.
 * The nfl_games schedule and player pool are untouched.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "../src/lib/db/load-env";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const name = arg("name");
  const season = Number(arg("season", "2026"));
  const numTeams = Number(arg("teams", "12"));
  const preset = arg("preset", "fp_advanced")!;
  const prod = flag("prod");
  const yes = flag("yes");
  const keepUsers = flag("keep-users");
  if (!name) {
    console.error('usage: npx tsx scripts/fresh-start.ts --name "<league name>" [--season 2026] [--teams 12] [--preset fp_advanced] [--keep-users] [--prod] [--yes]');
    process.exit(1);
  }
  if (prod) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (!m) throw new Error("APP_DB_URL not found in ../tools/scoring/.env");
    process.env.DATABASE_URL = m[1];
  }
  process.env.EMAIL_MODE = "log";

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");
  const { createLeague } = await import("../src/lib/leagues/service");
  const { SITE_URL } = await import("../src/lib/brand");

  const target = prod ? "PRODUCTION (APP_DB_URL)" : "local (.env.local)";
  console.log(`target: ${target}`);

  const leagues = await db
    .select({ id: s.leagues.id, slug: s.leagues.slug, name: s.leagues.name, status: s.leagues.status })
    .from(s.leagues);
  const users = await db
    .select({ id: s.users.id, email: s.users.email, isAdmin: s.users.isSiteAdmin })
    .from(s.users);
  const admins = users.filter((u) => u.isAdmin);
  const doomed = keepUsers ? [] : users.filter((u) => !u.isAdmin);
  if (admins.length === 0) throw new Error("no site admin found — refusing to run");

  console.log(`\nleagues to delete (${leagues.length}):`);
  for (const l of leagues) console.log(`  #${l.id} ${l.slug} — ${l.name} [${l.status}]`);
  console.log(`users to delete (${doomed.length}):`);
  for (const u of doomed) console.log(`  ${u.email}`);
  console.log(`admins kept (${admins.length}): ${admins.map((a) => a.email).join(", ")}`);
  console.log(`\nleague to create: "${name}" — season ${season}, ${numTeams} teams, preset ${preset}, no pick clock`);

  if (!yes) {
    console.log("\nDRY RUN — re-run with --yes to execute.");
    await pool.end();
    return;
  }

  // 1. leagues (cascades everything league-scoped)
  for (const l of leagues) {
    await db.delete(s.leagues).where(eq(s.leagues.id, l.id));
    console.log(`deleted league #${l.id} ${l.slug}`);
  }
  // 2. non-admin users
  for (const u of doomed) {
    await db.delete(s.users).where(eq(s.users.id, u.id));
    console.log(`deleted user ${u.email}`);
  }

  // 3. the fresh league, owned by the first admin
  const league = await createLeague({
    name,
    season,
    numTeams,
    scoringPreset: preset,
    commissionerUserId: admins[0].id,
  });
  const [settings] = await db
    .select()
    .from(s.leagueSettings)
    .where(eq(s.leagueSettings.leagueId, league.id))
    .limit(1);
  const rounds = settings.rosterTemplate.slots.reduce((n, slot) => n + slot.count, 0);
  await db
    .update(s.leagueSettings)
    .set({ draftConfig: { ...settings.draftConfig, secondsPerPick: 0, rounds } })
    .where(eq(s.leagueSettings.leagueId, league.id));

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(s.leagues);
  console.log(`\ncreated league #${league.id} ${league.slug} (${count} league(s) now in DB)`);
  console.log(`  invite code: ${league.inviteCode}`);
  console.log(`  join link:   ${SITE_URL}/join/${league.inviteCode}`);
  console.log(`  draft: no clock, ${rounds} rounds; waivers ${settings.waiverConfig.mode}; playoffs ${settings.playoffConfig.mode}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
