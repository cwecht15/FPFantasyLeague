/**
 * Dev end-to-end exercise of the Phase 1 spine against the local dev DB:
 *   league + 2 extra users → schedule → free-agent adds → lineups →
 *   score_week → rollup_matchups → standings.
 *
 * Run:  npx tsx scripts/dev-e2e.ts
 * Idempotent-ish: creates a fresh league each run (timestamped name); users
 * are reused by email.
 */

import "../src/lib/db/load-env";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { createLeague, joinLeague, getSettings } = await import("../src/lib/leagues/service");
  const { generateSchedule } = await import("../src/lib/matchups/schedule");
  const { addFreeAgent } = await import("../src/lib/transactions/service");
  const { getLineupView, setLineupSlot, eligiblePositions } = await import(
    "../src/lib/lineups/service"
  );
  const { scoreWeekForLeague } = await import("../src/lib/scoring/score-week");
  const { rollupLeagueWeek, recomputeStandings } = await import("../src/lib/matchups/rollup");

  const fail = (msg: string): never => {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  };

  // --- users ---------------------------------------------------------------
  async function ensureUser(email: string, name: string): Promise<string> {
    const [existing] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(sql`lower(${s.users.email}) = ${email}`)
      .limit(1);
    if (existing) return existing.id;
    const [u] = await db
      .insert(s.users)
      .values({
        email,
        name,
        displayName: name,
        passwordHash: await bcrypt.hash("dev-password-123", 4),
      })
      .returning({ id: s.users.id });
    return u.id;
  }

  const admin = await ensureUser("e2e-admin@fpfl.dev", "E2E Admin");
  const user2 = await ensureUser("e2e-user2@fpfl.dev", "E2E User Two");
  await db.update(s.users).set({ isSiteAdmin: true }).where(eq(s.users.id, admin));

  // --- league (4 teams: admin + user2 + 2 unclaimed via direct insert) ------
  const league = await createLeague({
    name: `E2E League ${Date.now()}`,
    season: 2024,
    numTeams: 4,
    scoringPreset: "ppr",
    teamName: "Admin Team",
    commissionerUserId: admin,
  });
  console.log(`league ${league.id} (${league.slug})`);

  const joined = await joinLeague({
    inviteCode: league.inviteCode,
    teamName: "User Two Team",
    userId: user2,
  });
  if (joined.error) fail(`join: ${joined.error}`);

  await db.insert(s.teams).values([
    { leagueId: league.id, name: "Ghost A" },
    { leagueId: league.id, name: "Ghost B" },
  ]);

  // --- schedule (weeks 1..14 by default playoff config) ---------------------
  const settings = await getSettings(league.id);
  const lastWeek = settings.playoffConfig.startWeek - 1;
  const created = await generateSchedule(league.id, league.season, lastWeek);
  console.log(`schedule: ${created} matchups over ${lastWeek} weeks`);
  if (created !== lastWeek * 2) fail(`expected ${lastWeek * 2} matchups, got ${created}`);

  // --- rosters: top 2024 players by week-1 production, alternating ----------
  const teams = await db
    .select()
    .from(s.teams)
    .where(eq(s.teams.leagueId, league.id))
    .orderBy(s.teams.id);

  const top = await db
    .select({ gsisId: s.playerWeekStats.gsisId, position: s.players.position })
    .from(s.playerWeekStats)
    .innerJoin(s.players, eq(s.players.gsisId, s.playerWeekStats.gsisId))
    .where(
      and(
        eq(s.playerWeekStats.season, 2024),
        eq(s.playerWeekStats.week, 1),
        eq(s.playerWeekStats.seasonType, "REG"),
      ),
    )
    .orderBy(
      sql`${s.playerWeekStats.passYds} + ${s.playerWeekStats.rushYds} * 4 + ${s.playerWeekStats.recYds} * 4 DESC`,
    )
    .limit(400);

  const byPos: Record<string, string[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of top) if (byPos[p.position]) byPos[p.position].push(p.gsisId);

  // each team: 1 QB, 2 RB, 2 WR, 1 TE
  const want: [string, number][] = [
    ["QB", 1],
    ["RB", 2],
    ["WR", 2],
    ["TE", 1],
  ];
  for (let t = 0; t < teams.length; t++) {
    for (const [pos, count] of want) {
      for (let i = 0; i < count; i++) {
        const gsisId = byPos[pos].shift();
        if (!gsisId) fail(`ran out of ${pos}`);
        const r = await addFreeAgent({
          leagueId: league.id,
          teamId: teams[t].id,
          gsisId: gsisId!,
          userId: admin,
          template: settings.rosterTemplate,
        });
        if (r.error) fail(`add ${pos} to team ${teams[t].id}: ${r.error}`);
      }
    }
  }
  console.log("rosters filled (6 players/team)");

  // --- lineups for week 1: place everyone into starter slots ----------------
  // 2024 kickoffs are in the past, so interactive edits are (correctly) locked;
  // seed the slots directly at the DB layer, like a draft would have.
  for (const team of teams) {
    const view = await getLineupView(league.id, team.id, 2024, 1, settings.rosterTemplate);
    const open = view.slots.filter((sl) => sl.slot !== "BENCH" && sl.slot !== "IR");
    const used = new Set<string>();
    for (const slot of open) {
      const allowed = eligiblePositions(settings.rosterTemplate, slot.slot);
      const candidate = view.roster.find(
        (p) => !used.has(p.gsisId) && (allowed.length === 0 || allowed.includes(p.position)),
      );
      if (!candidate) continue; // FLEX may stay empty with 6-man roster
      await db
        .update(s.lineupSlots)
        .set({ gsisId: candidate.gsisId })
        .where(eq(s.lineupSlots.id, slot.slotId));
      used.add(candidate.gsisId);
    }
  }
  console.log("week-1 lineups set (direct DB seed)");

  // --- locks: week-1 2024 kickoffs are in the past → slots must be locked ---
  const view = await getLineupView(league.id, teams[0].id, 2024, 1, settings.rosterTemplate);
  const filledStarters = view.slots.filter(
    (sl) => sl.gsisId && sl.slot !== "BENCH" && sl.slot !== "IR",
  );
  const lockedCount = filledStarters.filter((sl) => sl.locked).length;
  console.log(`lock check: ${lockedCount}/${filledStarters.length} filled starters locked`);
  if (lockedCount !== filledStarters.length) fail("expected all 2024 players to be locked");
  const relock = await setLineupSlot({
    leagueId: league.id,
    teamId: teams[0].id,
    season: 2024,
    week: 1,
    template: settings.rosterTemplate,
    slotId: filledStarters[0].slotId,
    gsisId: null,
  });
  if (!relock.error) fail("expected locked-slot edit to be rejected");
  console.log(`locked-slot edit correctly rejected: "${relock.error}"`);

  // an empty future-ish slot with an unlocked player is exercised in unit terms
  // by the eligibility test below: putting a QB into an RB slot must fail fast.
  const emptyBench = view.slots.find((sl) => sl.slot === "BENCH" && !sl.gsisId);
  const rbSlot = view.slots.find((sl) => sl.slot === "RB" && sl.gsisId);
  if (emptyBench && rbSlot) {
    const qb = view.roster.find((p) => p.position === "QB");
    const wrongPos = await setLineupSlot({
      leagueId: league.id,
      teamId: teams[0].id,
      season: 2024,
      week: 1,
      template: settings.rosterTemplate,
      slotId: rbSlot.slotId,
      gsisId: qb?.gsisId ?? null,
    });
    if (!wrongPos.error) fail("expected QB-in-RB-slot to be rejected");
    console.log(`eligibility correctly rejected: "${wrongPos.error}"`);
  }

  // --- score + rollup + standings -------------------------------------------
  const written = await scoreWeekForLeague(league.id, 2024, "REG", 1);
  console.log(`score_week: ${written} player scores`);
  if (written < 300) fail("expected ~376 scored rows");

  const rolled = await rollupLeagueWeek(league.id, 2024, 1);
  await recomputeStandings(league.id, 2024);
  console.log(`rollup: ${rolled} matchups`);

  const matchups = await db
    .select()
    .from(s.matchups)
    .where(and(eq(s.matchups.leagueId, league.id), eq(s.matchups.week, 1)));
  for (const m of matchups) {
    console.log(
      `  matchup: home=${m.homePoints} away=${m.awayPoints} status=${m.status} winner=${m.winnerTeamId} tie=${m.isTie}`,
    );
    if (m.status !== "final") fail("2024 week 1 should be final");
    if ((m.homePoints ?? 0) <= 0) fail("home points should be > 0");
  }

  const standings = await db
    .select({ teamId: s.standings.teamId, wins: s.standings.wins, pf: s.standings.pointsFor, rank: s.standings.rank })
    .from(s.standings)
    .where(eq(s.standings.leagueId, league.id))
    .orderBy(s.standings.rank);
  console.log("standings:", standings);
  const totalWins = standings.reduce((acc, r) => acc + r.wins, 0);
  if (totalWins !== 2) fail(`expected 2 total wins after one week, got ${totalWins}`);

  // --- idempotency: re-run scoring + rollup, standings unchanged ------------
  await scoreWeekForLeague(league.id, 2024, "REG", 1);
  await rollupLeagueWeek(league.id, 2024, 1);
  await recomputeStandings(league.id, 2024);
  const standings2 = await db
    .select({ teamId: s.standings.teamId, wins: s.standings.wins, pf: s.standings.pointsFor })
    .from(s.standings)
    .where(eq(s.standings.leagueId, league.id));
  const pf1 = standings.map((r) => r.pf).sort();
  const pf2 = standings2.map((r) => r.pf).sort();
  if (JSON.stringify(pf1) !== JSON.stringify(pf2)) fail("re-run changed standings (not idempotent)");
  console.log("idempotency: re-score + re-rollup left standings unchanged");

  // --- cleanup: remove the throwaway league (cascades) -----------------------
  await db.delete(s.leagues).where(eq(s.leagues.id, league.id));
  // roster_entries/lineups cascade via league/team FKs; standings cascade too.
  console.log("cleanup: e2e league deleted");

  console.log("\nE2E PASS");
  await pool.end();
}

void main();
