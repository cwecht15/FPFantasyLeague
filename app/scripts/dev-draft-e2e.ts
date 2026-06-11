/**
 * Draft-engine end-to-end exercise against the local dev DB:
 *   4-team league → start draft (snake pre-gen) → human picks → wrong-turn
 *   rejected → double-pick rejected → queue-driven autopick on expiry →
 *   best-available autopick → draft completion → league in_season.
 *
 * Run:  npx tsx scripts/dev-draft-e2e.ts
 */

import "../src/lib/db/load-env";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { createLeague, joinLeague, getSettings } = await import("../src/lib/leagues/service");
  const { startDraft, makePick, getDraft, getDraftBoard, advanceExpiredDrafts, listAvailable } =
    await import("../src/lib/draft/service");

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

  const userIds: string[] = [];
  for (let i = 1; i <= 4; i++) userIds.push(await ensureUser(`draft-e2e-${i}@fpfl.dev`, `Drafter ${i}`));

  const league = await createLeague({
    name: `Draft E2E ${Date.now()}`,
    season: 2025, // draft season AFTER the loaded 2024 data → last-season ranks work
    numTeams: 4,
    scoringPreset: "ppr",
    teamName: "Team 1",
    commissionerUserId: userIds[0],
  });
  for (let i = 1; i < 4; i++) {
    const j = await joinLeague({
      inviteCode: league.inviteCode,
      teamName: `Team ${i + 1}`,
      userId: userIds[i],
    });
    if (j.error) fail(`join ${i}: ${j.error}`);
  }

  // Short draft for the test: 3 rounds, manual order = team id order, 60s clock.
  const settings = await getSettings(league.id);
  const config = { ...settings.draftConfig, rounds: 3, orderMode: "manual" as const, secondsPerPick: 60 };
  const teams = await db
    .select()
    .from(s.teams)
    .where(eq(s.teams.leagueId, league.id))
    .orderBy(s.teams.id);
  for (let i = 0; i < teams.length; i++) {
    await db.update(s.teams).set({ draftPosition: i + 1 }).where(eq(s.teams.id, teams[i].id));
  }

  const started = await startDraft(league.id, config);
  if (started.error) fail(`start: ${started.error}`);
  const draft = (await getDraft(league.id))!;
  console.log(`draft ${draft.id} started`);

  let board = await getDraftBoard(draft.id);
  if (board.length !== 12) fail(`expected 12 picks pre-generated, got ${board.length}`);
  // Snake check: round 2 reverses round 1.
  const r1 = board.filter((p) => p.round === 1).map((p) => p.teamId);
  const r2 = board.filter((p) => p.round === 2).map((p) => p.teamId);
  if (JSON.stringify(r2) !== JSON.stringify([...r1].reverse())) fail("round 2 is not reversed");
  console.log("snake order verified (R2 = reverse R1)");

  const teamOwner = new Map(teams.map((t) => [t.id, t.ownerUserId!]));
  const available = await listAvailable(league.id, league.season, { limit: 30 });
  if (available.length < 10) fail("expected available players ranked by 2024 production");
  console.log(`available top-3: ${available.slice(0, 3).map((p) => p.name).join(", ")}`);

  // Wrong-turn rejection: pick 1 belongs to teams[0]'s owner; user 2 tries.
  const wrong = await makePick({ draftId: draft.id, gsisId: available[0].gsisId, byUserId: userIds[1] });
  if (!wrong.error) fail("expected wrong-turn pick to be rejected");
  console.log(`wrong-turn rejected: "${wrong.error}"`);

  // Human pick 1 (correct owner).
  const p1 = await makePick({
    draftId: draft.id,
    gsisId: available[0].gsisId,
    byUserId: teamOwner.get(board[0].teamId)!,
  });
  if (p1.error) fail(`pick 1: ${p1.error}`);

  // Double-pick rejection: pick 2 tries the SAME player.
  board = await getDraftBoard(draft.id);
  const onClock2 = board.find((p) => p.overallPick === 2)!;
  const dup = await makePick({
    draftId: draft.id,
    gsisId: available[0].gsisId,
    byUserId: teamOwner.get(onClock2.teamId)!,
  });
  if (!dup.error) fail("expected double-pick to be rejected");
  console.log(`double-pick rejected: "${dup.error}"`);

  // Queue-driven autopick: team on pick 2 queues a specific player, clock expires.
  const queuedPlayer = available[5];
  await db.insert(s.draftQueue).values({
    draftId: draft.id,
    teamId: onClock2.teamId,
    gsisId: queuedPlayer.gsisId,
    rank: 1,
  });
  await pool.query(
    `UPDATE draft_picks SET deadline_at = now() - interval '1 second' WHERE id = $1`,
    [onClock2.id],
  );
  const autos = await advanceExpiredDrafts();
  if (autos !== 1) fail(`expected 1 autopick, got ${autos}`);
  board = await getDraftBoard(draft.id);
  const pick2 = board.find((p) => p.overallPick === 2)!;
  if (pick2.gsisId !== queuedPlayer.gsisId || !pick2.isAutopick) {
    fail(`autopick should take queued ${queuedPlayer.name}, got ${pick2.gsisId}`);
  }
  console.log(`queue autopick took ${queuedPlayer.name} ✔`);

  // Finish the draft: expire every remaining pick → best-available autopicks.
  for (let guard = 0; guard < 15; guard++) {
    const d = (await getDraft(league.id))!;
    if (d.status === "complete") break;
    await pool.query(
      `UPDATE draft_picks SET deadline_at = now() - interval '1 second'
        WHERE id = (SELECT current_pick_id FROM drafts WHERE id = $1)`,
      [draft.id],
    );
    await advanceExpiredDrafts();
  }
  const final = (await getDraft(league.id))!;
  if (final.status !== "complete") fail(`draft did not complete (status ${final.status})`);

  const [leagueRow] = await db.select().from(s.leagues).where(eq(s.leagues.id, league.id));
  if (leagueRow.status !== "in_season") fail(`league should be in_season, is ${leagueRow.status}`);

  // Every pick made, every roster has 3 players, no duplicates.
  board = await getDraftBoard(draft.id);
  if (board.some((p) => !p.gsisId)) fail("unmade picks remain");
  const ids = board.map((p) => p.gsisId);
  if (new Set(ids).size !== ids.length) fail("duplicate players drafted");
  for (const t of teams) {
    const roster = await db
      .select()
      .from(s.rosterEntries)
      .where(and(eq(s.rosterEntries.teamId, t.id), isNull(s.rosterEntries.droppedAt)));
    if (roster.length !== 3) fail(`team ${t.id} roster has ${roster.length} players, expected 3`);
  }
  console.log("draft complete: 12/12 picks, no dupes, rosters of 3, league in_season");

  await db.delete(s.leagues).where(eq(s.leagues.id, league.id));
  console.log("cleanup: e2e league deleted");
  console.log("\nDRAFT E2E PASS");
  await pool.end();
}

void main();
