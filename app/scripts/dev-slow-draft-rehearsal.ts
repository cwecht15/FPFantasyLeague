/**
 * Slow-draft rehearsal setup: creates (or resets) a "Slow Draft Rehearsal"
 * league on the target DB with N dedicated users so a real multi-browser
 * draft can be exercised end to end — admin starts it from the UI, managers
 * pick from their own sessions, and the worker autopicks expired clocks.
 *
 * Users:  rehearsal-<n>@fpfl.dev / rehearsal123!   (created if missing)
 * Config: short pick clock + few rounds so a rehearsal finishes in minutes.
 *
 * Run:  npx tsx scripts/dev-slow-draft-rehearsal.ts [users=3] [secondsPerPick=30] [rounds=2] [season=2025]
 *       (season N ranks draft availables by season N-1 stats — use 2026 on prod)
 * Then: sign in as the site admin, open the league's Draft tab, Start draft.
 * NOTE: run the worker (npm run worker) or expired clocks will never autopick.
 */

import "../src/lib/db/load-env";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";

const LEAGUE_NAME = "Slow Draft Rehearsal";
const PASSWORD = "rehearsal123!";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { createLeague, joinLeague } = await import("../src/lib/leagues/service");

  const numUsers = Number(process.argv[2] ?? 3);
  const spRaw = Number(process.argv[3] ?? 30);
  const secondsPerPick = spRaw <= 0 ? 0 : Math.max(spRaw, 30); // 0 = no clock
  const rounds = Number(process.argv[4] ?? 2);
  const season = Number(process.argv[5] ?? 2025);

  // Reset any previous rehearsal league (cascades picks/rosters/settings).
  const old = await db
    .select({ id: s.leagues.id })
    .from(s.leagues)
    .where(eq(s.leagues.name, LEAGUE_NAME));
  for (const l of old) await db.delete(s.leagues).where(eq(s.leagues.id, l.id));
  if (old.length) console.log(`reset: deleted ${old.length} previous rehearsal league(s)`);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const userIds: string[] = [];
  for (let i = 1; i <= numUsers; i++) {
    const email = `rehearsal-${i}@fpfl.dev`;
    const [existing] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(sql`lower(${s.users.email}) = ${email}`)
      .limit(1);
    if (existing) {
      userIds.push(existing.id);
    } else {
      const [u] = await db
        .insert(s.users)
        .values({ email, name: `Rehearsal ${i}`, displayName: `Rehearsal ${i}`, passwordHash })
        .returning({ id: s.users.id });
      userIds.push(u.id);
    }
  }

  const league = await createLeague({
    name: LEAGUE_NAME,
    season,
    numTeams: numUsers,
    scoringPreset: "fp_advanced",
    teamName: "Rehearsal 1",
    commissionerUserId: userIds[0],
  });
  for (let i = 1; i < numUsers; i++) {
    const j = await joinLeague({
      inviteCode: league.inviteCode,
      teamName: `Rehearsal ${i + 1}`,
      userId: userIds[i],
    });
    if (j.error) throw new Error(`join ${i + 1}: ${j.error}`);
  }

  // Short clock, manual order (= join order), few rounds — via the league's
  // stored draft config so the admin's UI "Start draft" uses it as-is.
  const [settingsRow] = await db
    .select()
    .from(s.leagueSettings)
    .where(eq(s.leagueSettings.leagueId, league.id))
    .limit(1);
  await db
    .update(s.leagueSettings)
    .set({
      draftConfig: {
        ...settingsRow.draftConfig,
        secondsPerPick,
        rounds,
        orderMode: "manual" as const,
        thirdRoundReversal: false,
      },
    })
    .where(eq(s.leagueSettings.leagueId, league.id));
  const leagueTeams = await db
    .select()
    .from(s.teams)
    .where(eq(s.teams.leagueId, league.id))
    .orderBy(s.teams.id);
  for (let i = 0; i < leagueTeams.length; i++) {
    await db
      .update(s.teams)
      .set({ draftPosition: i + 1 })
      .where(eq(s.teams.id, leagueTeams[i].id));
  }

  console.log(`league ready: /leagues/${league.slug}/draft`);
  console.log(`config: ${numUsers} teams · ${secondsPerPick}s clock · ${rounds} rounds`);
  console.log(`managers: rehearsal-1..${numUsers}@fpfl.dev / ${PASSWORD}`);
  console.log("next: sign in as site admin → Draft tab → Start draft (worker must be running)");
  await pool.end();
}

void main();
