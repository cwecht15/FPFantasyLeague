/**
 * Trade engine E2E: propose → wrong-team accept rejected → receiver accepts →
 * admin approves → rosters swap, lineups cleared, ownership re-validated.
 *
 * Run:  npx tsx scripts/dev-trade-e2e.ts
 */

import "../src/lib/db/load-env";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { createLeague, joinLeague, getSettings } = await import("../src/lib/leagues/service");
  const { addFreeAgent } = await import("../src/lib/transactions/service");
  const { proposeTrade, respondToTrade, resolveTrade, listTrades } = await import(
    "../src/lib/trades/service"
  );
  const { getLineupView } = await import("../src/lib/lineups/service");

  const fail = (msg: string): never => {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  };

  async function ensureUser(email: string, name: string): Promise<string> {
    const [existing] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(sql`lower(${s.users.email}) = ${email}`)
      .limit(1);
    if (existing) return existing.id;
    const [u] = await db
      .insert(s.users)
      .values({ email, name, displayName: name, passwordHash: await bcrypt.hash("x", 4) })
      .returning({ id: s.users.id });
    return u.id;
  }

  const u1 = await ensureUser("trade-e2e-1@fpfl.dev", "Trader One");
  const u2 = await ensureUser("trade-e2e-2@fpfl.dev", "Trader Two");

  const league = await createLeague({
    name: `Trade E2E ${Date.now()}`,
    season: 2025,
    numTeams: 4,
    scoringPreset: "fp_advanced",
    teamName: "Team One",
    commissionerUserId: u1,
  });
  const j = await joinLeague({ inviteCode: league.inviteCode, teamName: "Team Two", userId: u2 });
  if (j.error) fail(j.error);

  const settings = await getSettings(league.id);
  const teams = await db
    .select()
    .from(s.teams)
    .where(eq(s.teams.leagueId, league.id))
    .orderBy(s.teams.id);
  const [t1, t2] = teams;

  // Give each team two players (top 2024 producers).
  const top = await db
    .select({ gsisId: s.playerWeekStats.gsisId })
    .from(s.playerWeekStats)
    .innerJoin(s.players, eq(s.players.gsisId, s.playerWeekStats.gsisId))
    .where(
      and(
        eq(s.playerWeekStats.season, 2024),
        eq(s.playerWeekStats.week, 1),
        eq(s.players.position, "WR"),
      ),
    )
    .orderBy(sql`${s.playerWeekStats.recYds} DESC`)
    .limit(4);
  const [a1, a2, b1, b2] = top.map((t) => t.gsisId);
  for (const [team, players, user] of [
    [t1, [a1, a2], u1],
    [t2, [b1, b2], u2],
  ] as const) {
    for (const gsisId of players) {
      const r = await addFreeAgent({
        leagueId: league.id,
        teamId: team.id,
        gsisId,
        userId: user,
        template: settings.rosterTemplate,
      });
      if (r.error) fail(`add: ${r.error}`);
    }
  }

  // Put t1's tradable player into a lineup slot — it must be cleared on apply.
  const view = await getLineupView(league.id, t1.id, 2025, 10, settings.rosterTemplate);
  if (!view.slots.some((sl) => sl.gsisId === a1)) fail("autofill should have placed a1");

  // Propose a1 <-> b1.
  const prop = await proposeTrade({
    leagueId: league.id,
    proposingTeamId: t1.id,
    receivingTeamId: t2.id,
    give: [a1],
    get: [b1],
  });
  if (prop.error || !prop.tradeId) fail(`propose: ${prop.error}`);

  // Proposer cannot accept their own trade.
  const selfAccept = await respondToTrade({ tradeId: prop.tradeId!, teamId: t1.id, accept: true });
  if (!selfAccept.error) fail("proposer accept should be rejected");
  console.log(`self-accept rejected: "${selfAccept.error}"`);

  // Receiver accepts; admin approves.
  const acc = await respondToTrade({ tradeId: prop.tradeId!, teamId: t2.id, accept: true });
  if (acc.error) fail(`accept: ${acc.error}`);
  const res = await resolveTrade({
    tradeId: prop.tradeId!,
    approve: true,
    template: settings.rosterTemplate,
  });
  if (res.error) fail(`approve: ${res.error}`);

  // Ownership swapped?
  const owner = async (gsisId: string) => {
    const [row] = await db
      .select({ teamId: s.rosterEntries.teamId })
      .from(s.rosterEntries)
      .where(
        and(
          eq(s.rosterEntries.leagueId, league.id),
          eq(s.rosterEntries.gsisId, gsisId),
          isNull(s.rosterEntries.droppedAt),
        ),
      );
    return row?.teamId;
  };
  if ((await owner(a1)) !== t2.id) fail("a1 should now belong to team 2");
  if ((await owner(b1)) !== t1.id) fail("b1 should now belong to team 1");

  // Lineup slot cleared?
  const slots = await db
    .select({ gsisId: s.lineupSlots.gsisId })
    .from(s.lineupSlots)
    .innerJoin(s.lineups, eq(s.lineups.id, s.lineupSlots.lineupId))
    .where(eq(s.lineups.teamId, t1.id));
  if (slots.some((sl) => sl.gsisId === a1)) fail("a1 should be cleared from team 1 lineups");

  const [tv] = await listTrades(league.id);
  if (tv.trade.status !== "applied") fail(`trade status ${tv.trade.status}, expected applied`);
  console.log(
    `trade applied: ${tv.proposingTeam} sent ${tv.give.map((p) => p.name)} for ${tv.get.map((p) => p.name)}`,
  );

  await db.delete(s.leagues).where(eq(s.leagues.id, league.id));
  console.log("cleanup done\nTRADE E2E PASS");
  await pool.end();
}

void main();
