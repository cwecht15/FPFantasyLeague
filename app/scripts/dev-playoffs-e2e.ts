/**
 * Dev end-to-end for bracket-mode playoffs (lib/matchups/playoffs.ts):
 *   12-team league → synthetic final regular season (t0 best … t11 worst,
 *   top six tied on wins so points-for is the live tiebreaker) →
 *   advancePlayoffs three times, finalizing each round by hand:
 *     R1 (wk 15): seeds 1-2 bye, 3v6, 4v5 — 6 upsets 3, 4v5 ties (seed 4 on)
 *     R2 (wk 16): 1v6, 2v4 — 6 upsets 1 again
 *     R3 (wk 17): 2v6 championship
 *   Also asserts idempotency and that playoff results never touch standings.
 *
 * Run:  npx tsx scripts/dev-playoffs-e2e.ts
 */

import "../src/lib/db/load-env";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { createLeague } = await import("../src/lib/leagues/service");
  const { recomputeStandings } = await import("../src/lib/matchups/rollup");
  const { advancePlayoffs } = await import("../src/lib/matchups/playoffs");

  const fail = (msg: string): never => {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  };

  const [existing] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(sql`lower(${s.users.email}) = ${"e2e-admin@fpfl.dev"}`)
    .limit(1);
  const admin =
    existing?.id ??
    (
      await db
        .insert(s.users)
        .values({
          email: "e2e-admin@fpfl.dev",
          name: "E2E Admin",
          displayName: "E2E Admin",
          passwordHash: await bcrypt.hash("dev-password-123", 4),
        })
        .returning({ id: s.users.id })
    )[0].id;

  const league = await createLeague({
    name: `Playoff E2E ${Date.now()}`,
    season: 2024,
    numTeams: 12,
    scoringPreset: "ppr",
    commissionerUserId: admin,
  });
  console.log(`league ${league.id} (${league.slug})`);

  await db
    .update(s.leagueSettings)
    .set({
      playoffConfig: { mode: "bracket", teams: 6, startWeek: 15, weeksPerRound: 1 },
      updatedAt: new Date(),
    })
    .where(eq(s.leagueSettings.leagueId, league.id));

  const t: number[] = [];
  for (let i = 0; i < 12; i++) {
    const [row] = await db
      .insert(s.teams)
      .values({ leagueId: league.id, name: `T${i}` })
      .returning({ id: s.teams.id });
    t.push(row.id);
  }

  // One synthetic "regular season" week, already final: t0..t5 beat t6..t11.
  // Winners all sit at 1-0, so seeding must fall through to points-for:
  // t0 scores highest → seed 1, t5 lowest of the winners → seed 6.
  for (let i = 0; i < 6; i++) {
    await db.insert(s.matchups).values({
      leagueId: league.id,
      season: 2024,
      week: 1,
      homeTeamId: t[i],
      awayTeamId: t[i + 6],
      homePoints: 150 - i,
      awayPoints: 80 - i,
      winnerTeamId: t[i],
      status: "final",
    });
  }
  await recomputeStandings(league.id, 2024);

  const playoffRows = async () =>
    db
      .select()
      .from(s.matchups)
      .where(
        and(
          eq(s.matchups.leagueId, league.id),
          eq(s.matchups.season, 2024),
          eq(s.matchups.isPlayoff, true),
        ),
      )
      .orderBy(s.matchups.week, s.matchups.id);

  const finalize = async (
    id: number,
    homePoints: number,
    awayPoints: number | null,
  ) => {
    await db
      .update(s.matchups)
      .set({
        homePoints,
        awayPoints,
        winnerTeamId:
          awayPoints === null || homePoints === awayPoints
            ? null
            : homePoints > awayPoints
              ? sql`home_team_id`
              : sql`away_team_id`,
        isTie: awayPoints !== null && homePoints === awayPoints,
        status: "final",
      })
      .where(eq(s.matchups.id, id));
  };

  // --- Round 1 ---------------------------------------------------------------
  await advancePlayoffs(league.id, 2024);
  let rows = await playoffRows();
  if (rows.length !== 4) fail(`round 1: expected 4 rows (2 byes + 2 games), got ${rows.length}`);
  const byes = rows.filter((m) => !m.awayTeamId);
  const games = rows.filter((m) => m.awayTeamId);
  if (rows.some((m) => m.week !== 15 || m.playoffRound !== 1)) fail("round 1 rows misplaced");
  if (new Set(byes.map((m) => m.homeTeamId)).size !== 2 || !byes.every((m) => [t[0], t[1]].includes(m.homeTeamId)))
    fail("byes should be seeds 1-2 (t0, t1)");
  const g36 = games.find((m) => m.homeTeamId === t[2]);
  const g45 = games.find((m) => m.homeTeamId === t[3]);
  if (!g36 || g36.awayTeamId !== t[5]) fail("expected 3v6 with seed 3 home");
  if (!g45 || g45.awayTeamId !== t[4]) fail("expected 4v5 with seed 4 home");
  console.log("round 1 OK: byes for seeds 1-2, 3v6 + 4v5 in week 15");

  const seeds = await db
    .select({ teamId: s.standings.teamId, seed: s.standings.playoffSeed })
    .from(s.standings)
    .where(and(eq(s.standings.leagueId, league.id), eq(s.standings.season, 2024)));
  for (let i = 0; i < 6; i++) {
    if (seeds.find((r) => r.teamId === t[i])?.seed !== i + 1) fail(`t${i} should be seed ${i + 1}`);
  }
  if (seeds.filter((r) => r.seed !== null).length !== 6) fail("only 6 teams should be seeded");
  console.log("seeds persisted 1..6 by record then points-for");

  // Not final yet → re-running must not create round 2 or duplicates.
  await advancePlayoffs(league.id, 2024);
  if ((await playoffRows()).length !== 4) fail("advance before results changed the bracket");

  // Finalize: byes final, 6 upsets 3, 4v5 is a TIE (higher seed 4 advances).
  for (const b of byes) await finalize(b.id, 100, null);
  await finalize(g36!.id, 90, 95); // away (t5, seed 6) wins
  await finalize(g45!.id, 88, 88); // tie → t3 (seed 4) advances

  // --- Round 2: reseeded 1v6, 2v4 -------------------------------------------
  await advancePlayoffs(league.id, 2024);
  rows = await playoffRows();
  const r2 = rows.filter((m) => m.playoffRound === 2);
  if (r2.length !== 2 || r2.some((m) => m.week !== 16)) fail("round 2: expected 2 games in week 16");
  const semi1 = r2.find((m) => m.homeTeamId === t[0]);
  const semi2 = r2.find((m) => m.homeTeamId === t[1]);
  if (!semi1 || semi1.awayTeamId !== t[5]) fail("semi 1 should be seed 1 vs seed 6 (worst survivor)");
  if (!semi2 || semi2.awayTeamId !== t[3]) fail("semi 2 should be seed 2 vs seed 4 (tie survivor)");
  console.log("round 2 OK: 1v6 and 2v4 in week 16 (tie advanced the higher seed)");

  await finalize(semi1!.id, 80, 101); // t5 keeps upsetting
  await finalize(semi2!.id, 120, 70); // t1 rolls

  // --- Round 3: championship -------------------------------------------------
  await advancePlayoffs(league.id, 2024);
  rows = await playoffRows();
  const r3 = rows.filter((m) => m.playoffRound === 3);
  if (r3.length !== 1 || r3[0].week !== 17) fail("round 3: expected 1 game in week 17");
  if (r3[0].homeTeamId !== t[1] || r3[0].awayTeamId !== t[5])
    fail("championship should be seed 2 (home) vs seed 6");
  console.log("round 3 OK: seed 2 vs seed 6 championship in week 17");

  await finalize(r3[0].id, 130, 131);
  await advancePlayoffs(league.id, 2024);
  if ((await playoffRows()).length !== 7) fail("post-championship advance should be a no-op");
  console.log("champion decided (t5, seed 6) — bracket stable at 7 rows");

  // --- standings never count playoff games ----------------------------------
  await recomputeStandings(league.id, 2024);
  const after = await db
    .select({ teamId: s.standings.teamId, wins: s.standings.wins, rank: s.standings.rank })
    .from(s.standings)
    .where(and(eq(s.standings.leagueId, league.id), eq(s.standings.season, 2024)));
  const t5row = after.find((r) => r.teamId === t[5]);
  const t0row = after.find((r) => r.teamId === t[0]);
  if (t5row?.wins !== 1 || t0row?.rank !== 1)
    fail("playoff results leaked into regular-season standings");
  console.log("standings unchanged by playoff results");

  await db.delete(s.leagues).where(eq(s.leagues.id, league.id));
  console.log("cleanup: playoff e2e league deleted");

  console.log("\nPLAYOFFS E2E PASS");
  await pool.end();
}

void main();
