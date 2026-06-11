/**
 * Second demo league: "FP Demo Season League" — 12 teams, season 2025, frozen
 * HALFWAY through the year so standings / waivers / transactions / upcoming
 * matchups all have something to show:
 *   - full 15-round autopick draft (rosters of 15 from 2024 production)
 *   - lineups set for weeks 1-8, scored + rolled up (FP Advanced preset)
 *   - weeks 9+ remain scheduled/unscored = "upcoming"
 *   - a few free-agent moves in the history + pending waiver claims
 *
 * Run:  npx tsx scripts/dev-demo-season.ts   (re-runnable; replaces the league)
 */

import "../src/lib/db/load-env";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";

const ADMIN_EMAIL = "agiantmet@yahoo.com";
const SEASON = 2025;
const PLAYED_WEEKS = 8;

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { createLeague, joinLeague, getSettings } = await import("../src/lib/leagues/service");
  const { generateSchedule } = await import("../src/lib/matchups/schedule");
  const { startDraft, getDraft, advanceExpiredDrafts } = await import("../src/lib/draft/service");
  const { getLineupView, eligiblePositions } = await import("../src/lib/lineups/service");
  const { scoreWeekForLeague } = await import("../src/lib/scoring/score-week");
  const { rollupLeagueWeek, recomputeStandings } = await import("../src/lib/matchups/rollup");
  const { addFreeAgent, dropPlayer } = await import("../src/lib/transactions/service");
  const { createClaim } = await import("../src/lib/transactions/waivers");
  const { listAvailable } = await import("../src/lib/draft/service");

  const [admin] = await db
    .select()
    .from(s.users)
    .where(sql`lower(${s.users.email}) = ${ADMIN_EMAIL}`)
    .limit(1);
  if (!admin) throw new Error(`admin ${ADMIN_EMAIL} not found — run db:seed first`);

  const old = await db.select().from(s.leagues).where(eq(s.leagues.name, "FP Demo Season League"));
  for (const l of old) await db.delete(s.leagues).where(eq(s.leagues.id, l.id));

  async function ensureUser(email: string, name: string): Promise<string> {
    const [existing] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(sql`lower(${s.users.email}) = ${email}`)
      .limit(1);
    if (existing) return existing.id;
    const [u] = await db
      .insert(s.users)
      .values({ email, name, displayName: name, passwordHash: await bcrypt.hash("demo-pass-123", 4) })
      .returning({ id: s.users.id });
    return u.id;
  }

  const league = await createLeague({
    name: "FP Demo Season League",
    season: SEASON,
    numTeams: 12,
    scoringPreset: "fp_advanced",
    teamName: "Team Chris",
    commissionerUserId: admin.id,
    isDemo: true, // visible to site admins only
  });
  console.log(`league: ${league.name} → /leagues/${league.slug}`);

  const teamNames = [
    "Gridiron Gurus", "Blitz Brigade", "Red Zone Raiders", "Hail Mary Heroes",
    "Pylon Pushers", "Audible Architects", "Shotgun Specials", "Flex Appeal",
    "End Zone Elite", "Snap Counts", "Play Action Pack",
  ];
  for (let i = 0; i < teamNames.length; i++) {
    const userId = await ensureUser(`demo-season-${i + 1}@fpfl.dev`, `Manager ${i + 1}`);
    const j = await joinLeague({ inviteCode: league.inviteCode, teamName: teamNames[i], userId });
    if (j.error) throw new Error(j.error);
  }

  const settings = await getSettings(league.id);
  await generateSchedule(league.id, SEASON, settings.playoffConfig.startWeek - 1);
  console.log("schedule generated (weeks 1-14)");

  // ---- full draft via autopick (rosters from 2024 production) --------------
  const started = await startDraft(league.id, {
    ...settings.draftConfig,
    orderMode: "random",
    secondsPerPick: 60,
  });
  if (started.error) throw new Error(started.error);
  const draft = (await getDraft(league.id))!;
  for (let guard = 0; guard < 12 * settings.draftConfig.rounds + 10; guard++) {
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
  if (final.status !== "complete") throw new Error("draft did not complete");
  console.log(`draft complete (${12 * settings.draftConfig.rounds} autopicks)`);

  // ---- lineups for weeks 1..PLAYED_WEEKS (direct DB seed; locks bypassed) ---
  const teams = await db.select().from(s.teams).where(eq(s.teams.leagueId, league.id));
  for (let week = 1; week <= PLAYED_WEEKS; week++) {
    for (const team of teams) {
      const view = await getLineupView(league.id, team.id, SEASON, week, settings.rosterTemplate);
      const open = view.slots.filter((sl) => sl.slot !== "BENCH" && sl.slot !== "IR");
      const used = new Set<string>();
      for (const slot of open) {
        const allowed = eligiblePositions(settings.rosterTemplate, slot.slot);
        const candidate = view.roster.find(
          (p) => !used.has(p.gsisId) && (allowed.length === 0 || allowed.includes(p.position)),
        );
        if (!candidate) continue;
        await db
          .update(s.lineupSlots)
          .set({ gsisId: candidate.gsisId })
          .where(eq(s.lineupSlots.id, slot.slotId));
        used.add(candidate.gsisId);
      }
    }
  }
  console.log(`lineups set for weeks 1-${PLAYED_WEEKS}`);

  // ---- score + roll up the played weeks ------------------------------------
  for (let week = 1; week <= PLAYED_WEEKS; week++) {
    await scoreWeekForLeague(league.id, SEASON, "REG", week);
    await rollupLeagueWeek(league.id, SEASON, week);
  }
  await recomputeStandings(league.id, SEASON);
  console.log(`weeks 1-${PLAYED_WEEKS} scored, matchups final, standings computed`);

  // ---- transaction history + pending waiver claims -------------------------
  const adminTeam = teams.find((t) => t.ownerUserId === admin.id)!;
  const available = await listAvailable(league.id, SEASON, { limit: 12 });

  // one real add/drop on the admin team for the history
  const [benchGuy] = await db
    .select({ gsisId: s.rosterEntries.gsisId })
    .from(s.rosterEntries)
    .where(and(eq(s.rosterEntries.teamId, adminTeam.id), isNull(s.rosterEntries.droppedAt)))
    .orderBy(sql`${s.rosterEntries.id} DESC`)
    .limit(1);
  if (benchGuy && available[0]) {
    await dropPlayer({ leagueId: league.id, teamId: adminTeam.id, gsisId: benchGuy.gsisId, userId: admin.id });
    const add = await addFreeAgent({
      leagueId: league.id,
      teamId: adminTeam.id,
      gsisId: available[0].gsisId,
      userId: admin.id,
      template: settings.rosterTemplate,
    });
    if (add.error) console.warn(`demo add: ${add.error}`);
    else console.log(`history: dropped ${benchGuy.gsisId}, added ${available[0].name}`);
  }

  // pending claims from three other teams on the next-best free agents
  const otherTeams = teams.filter((t) => t.id !== adminTeam.id).slice(0, 3);
  for (let i = 0; i < otherTeams.length && i + 1 < available.length; i++) {
    const r = await createClaim({
      leagueId: league.id,
      teamId: otherTeams[i].id,
      gsisId: available[i + 1].gsisId,
      config: settings.waiverConfig,
    });
    if (r.error) console.warn(`claim: ${r.error}`);
  }
  console.log("3 pending waiver claims queued");

  console.log(`\nMid-season demo ready (through week ${PLAYED_WEEKS}, week ${PLAYED_WEEKS + 1} upcoming):`);
  console.log(`http://localhost:3100/leagues/${league.slug}`);
  await pool.end();
}

void main();
