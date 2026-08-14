/**
 * Game-lock + FAAB waivers end-to-end (dev DB):
 *
 *  1. Wed-3AM-ET boundary math (nextWeeklyEt / lastWeeklyEt sanity).
 *  2. lockedNflTeams: a synthetic game that kicked off inside the current
 *     window locks both team codes; outside the window locks nothing.
 *  3. FAAB processing: higher bid wins; tie goes to the worse record; budget
 *     is deducted; loser claim marked lost; over-budget claim invalid.
 *
 * Creates a throwaway league (season 3000, synthetic players/games) and
 * deletes it at the end.
 *
 *   npx tsx scripts/dev-waivers-e2e.ts
 */

import "../src/lib/db/load-env";
import { and, eq, inArray } from "drizzle-orm";

const SEASON = 3000;
const TAG = "waivers-e2e";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { nextWeeklyEt, lastWeeklyEt, lockedNflTeams, WAIVER_DOW, WAIVER_HOUR_ET } = await import(
    "../src/lib/transactions/game-lock"
  );
  const { createClaim, processDueWaivers, faabRemaining } = await import(
    "../src/lib/transactions/waivers"
  );
  const { DEFAULT_ROSTER_TEMPLATE, waiverConfigSchema } = await import(
    "../src/lib/leagues/settings"
  );

  // ---- 1. boundary math ----
  const now = new Date();
  const next = nextWeeklyEt(WAIVER_DOW, WAIVER_HOUR_ET, now);
  const last = lastWeeklyEt(WAIVER_DOW, WAIVER_HOUR_ET, now);
  const etParts = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(d);
  const wd = (d: Date) => etParts(d).find((p) => p.type === "weekday")?.value;
  const hr = (d: Date) => Number(etParts(d).find((p) => p.type === "hour")?.value);
  check("next boundary is Wed 3AM ET", wd(next) === "Wed" && hr(next) === 3, next.toISOString());
  check("last boundary is Wed 3AM ET", wd(last) === "Wed" && hr(last) === 3, last.toISOString());
  check("last <= now < next", last <= now && now < next);
  const spanDays = (next.getTime() - last.getTime()) / 86400e3;
  check("boundaries ~1 week apart", spanDays > 6.9 && spanDays < 7.1, `${spanDays.toFixed(2)}d`);

  // ---- synthetic fixtures ----
  await cleanup(db, s); // in case a previous run died

  const [anyUser] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (!anyUser) throw new Error("dev DB has no users — seed an admin first");
  const [league] = await db
    .insert(s.leagues)
    .values({
      name: TAG,
      slug: TAG,
      season: SEASON,
      status: "in_season",
      isDemo: true,
      commissionerUserId: anyUser.id,
      inviteCode: `${TAG}-${Date.now().toString(36)}`,
    })
    .returning();
  const config = waiverConfigSchema.parse({ mode: "faab", faabBudget: 100 });
  await db.insert(s.leagueSettings).values({
    leagueId: league.id,
    rosterTemplate: DEFAULT_ROSTER_TEMPLATE,
    scoringRules: {} as never,
    draftConfig: { type: "snake", secondsPerPick: 0, orderMode: "random", thirdRoundReversal: false, rounds: 12 } as never,
    waiverConfig: config,
    playoffConfig: { mode: "championship", teams: 6, startWeek: 15, weeksPerRound: 1 } as never,
  });

  const teamRows = await db
    .insert(s.teams)
    .values([
      { leagueId: league.id, name: "Good Record" },
      { leagueId: league.id, name: "Bad Record" },
      { leagueId: league.id, name: "Mid Record" },
    ])
    .returning();
  const [good, bad, mid] = teamRows;
  await db.insert(s.standings).values([
    { leagueId: league.id, season: SEASON, teamId: good.id, wins: 5, losses: 1, pointsFor: 700, rank: 1 },
    { leagueId: league.id, season: SEASON, teamId: bad.id, wins: 1, losses: 5, pointsFor: 400, rank: 3 },
    { leagueId: league.id, season: SEASON, teamId: mid.id, wins: 1, losses: 5, pointsFor: 500, rank: 2 },
  ]);

  const mkPlayer = (n: number, team: string) => ({
    gsisId: `${TAG}-${n}`,
    displayName: `${TAG} Player ${n}`,
    position: "RB",
    nflTeam: team,
  });
  await db
    .insert(s.players)
    .values([mkPlayer(1, "ZZA"), mkPlayer(2, "ZZB"), mkPlayer(3, "ZZC"), mkPlayer(4, "ZZD")])
    .onConflictDoNothing();

  // ---- 2. lock window ----
  const hourAgo = new Date(now.getTime() - 3600e3);
  const beforeWindow = new Date(last.getTime() - 3600e3); // just before last Wed 3AM
  const inFuture = new Date(now.getTime() + 3600e3);
  await db.insert(s.nflGames).values([
    { gameId: `${TAG}-g1`, season: SEASON, seasonType: "REG", week: 1, homeTeam: "ZZA", awayTeam: "ZZB", kickoffAt: hourAgo },
    { gameId: `${TAG}-g2`, season: SEASON, seasonType: "REG", week: 1, homeTeam: "ZZC", awayTeam: "ZZX", kickoffAt: beforeWindow },
    { gameId: `${TAG}-g3`, season: SEASON, seasonType: "REG", week: 1, homeTeam: "ZZD", awayTeam: "ZZY", kickoffAt: inFuture },
  ]);

  const locked = await lockedNflTeams(SEASON);
  check("kicked-off game locks both teams", locked.has("ZZA") && locked.has("ZZB"));
  check("pre-window kickoff not locked", !locked.has("ZZC"));
  check("future kickoff not locked", !locked.has("ZZD"));

  // ---- 3. FAAB processing ----
  // Player 1: good bids $30, bad bids $40 → bad wins on bid.
  // Player 2: good bids $20, bad bids $20, mid bids $20 → bad wins tie (worse
  //           record than mid on PF, worse than good on wins).
  // Player 4: mid bids $999 → invalid (over budget at settle: budget check).
  const claim = (teamId: number, gsisId: string, bid: number) =>
    createClaim({ leagueId: league.id, teamId, gsisId, bidAmount: bid, config });

  check("bid over budget rejected at create", (await claim(mid.id, `${TAG}-4`, 999)).error !== null);

  for (const [t, g, b] of [
    [good.id, `${TAG}-1`, 30],
    [bad.id, `${TAG}-1`, 40],
    [good.id, `${TAG}-2`, 20],
    [bad.id, `${TAG}-2`, 20],
    [mid.id, `${TAG}-2`, 20],
  ] as const) {
    const r = await claim(t, g, b);
    if (r.error) check(`claim ${g} by team ${t}`, false, r.error);
  }

  // Duplicate claim updates in place rather than inserting a second row.
  await claim(good.id, `${TAG}-1`, 35);
  const dupes = await db
    .select()
    .from(s.waiverClaims)
    .where(
      and(
        eq(s.waiverClaims.leagueId, league.id),
        eq(s.waiverClaims.teamId, good.id),
        eq(s.waiverClaims.addGsisId, `${TAG}-1`),
      ),
    );
  check("re-claim updates bid in place", dupes.length === 1 && dupes[0].bidAmount === 35);

  // Make everything due now, then process.
  await db
    .update(s.waiverClaims)
    .set({ processAfter: new Date(now.getTime() - 1000) })
    .where(eq(s.waiverClaims.leagueId, league.id));
  await processDueWaivers();

  const owner = async (g: string) => {
    const [r] = await db
      .select({ teamId: s.rosterEntries.teamId })
      .from(s.rosterEntries)
      .where(and(eq(s.rosterEntries.leagueId, league.id), eq(s.rosterEntries.gsisId, g)));
    return r?.teamId ?? null;
  };
  check("higher bid wins", (await owner(`${TAG}-1`)) === bad.id);
  check("tie goes to worse record", (await owner(`${TAG}-2`)) === bad.id);

  const [badTeam] = await db.select().from(s.teams).where(eq(s.teams.id, bad.id));
  check("budget deducted (100-40-20=40)", faabRemaining(badTeam, config) === 40, `$${badTeam.faabBudget}`);

  const lost = await db
    .select()
    .from(s.waiverClaims)
    .where(and(eq(s.waiverClaims.leagueId, league.id), eq(s.waiverClaims.status, "lost")));
  check("losing claims marked lost", lost.length === 3, `${lost.length} lost`);

  await cleanup(db, s);
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup(db: any, s: any) {
  const old = await db.select().from(s.leagues).where(eq(s.leagues.slug, TAG));
  for (const l of old) await db.delete(s.leagues).where(eq(s.leagues.id, l.id));
  await db.delete(s.nflGames).where(inArray(s.nflGames.gameId, [`${TAG}-g1`, `${TAG}-g2`, `${TAG}-g3`]));
  await db
    .delete(s.players)
    .where(inArray(s.players.gsisId, [1, 2, 3, 4].map((n) => `${TAG}-${n}`)));
}

void main();
