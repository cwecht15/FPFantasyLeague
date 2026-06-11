/**
 * Build a demo league showing the async draft mid-flight:
 *   - 4 teams: your admin account + 3 dummy managers
 *   - schedule generated, draft started (manual order, you pick 3rd)
 *   - picks 1-2 already made by the dummies (best available by 2025 production)
 *   - YOU are on the clock â€” open /leagues/<slug>/draft to try it
 *
 * Run:  npx tsx scripts/dev-demo-league.ts
 * Re-runnable: deletes any prior league named 'FP Demo League' first.
 */

import "../src/lib/db/load-env";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";

const ADMIN_EMAIL = "agiantmet@yahoo.com";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { createLeague, joinLeague, getSettings } = await import("../src/lib/leagues/service");
  const { generateSchedule } = await import("../src/lib/matchups/schedule");
  const { startDraft, makePick, getDraft, getDraftBoard, listAvailable } = await import(
    "../src/lib/draft/service"
  );

  const [admin] = await db
    .select()
    .from(s.users)
    .where(sql`lower(${s.users.email}) = ${ADMIN_EMAIL}`)
    .limit(1);
  if (!admin) throw new Error(`admin ${ADMIN_EMAIL} not found â€” run db:seed first`);

  // wipe a prior demo league
  const old = await db.select().from(s.leagues).where(eq(s.leagues.name, "FP Demo League"));
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

  const dummies = [
    { email: "demo-gridiron@fpfl.dev", user: "Gridiron Gary", team: "Gridiron Gurus" },
    { email: "demo-blitz@fpfl.dev", user: "Blitz Betty", team: "Blitz Brigade" },
    { email: "demo-redzone@fpfl.dev", user: "Redzone Rick", team: "Red Zone Raiders" },
    { email: "demo-hailmary@fpfl.dev", user: "Hail Mary Hank", team: "Hail Mary Heroes" },
    { email: "demo-pylon@fpfl.dev", user: "Pylon Pete", team: "Pylon Pushers" },
    { email: "demo-audible@fpfl.dev", user: "Audible Annie", team: "Audible Architects" },
    { email: "demo-shotgun@fpfl.dev", user: "Shotgun Sue", team: "Shotgun Specials" },
    { email: "demo-flexplay@fpfl.dev", user: "Flex Frank", team: "Flex Appeal" },
    { email: "demo-endzone@fpfl.dev", user: "Endzone Ed", team: "End Zone Elite" },
    { email: "demo-snapcount@fpfl.dev", user: "Snap Count Sam", team: "Snap Counts" },
    { email: "demo-playaction@fpfl.dev", user: "Play Action Pat", team: "Play Action Pack" },
  ];

  const league = await createLeague({
    name: "FP Demo League",
    season: 2026,
    numTeams: 12,
    scoringPreset: "fp_advanced",
    teamName: "Team Chris",
    commissionerUserId: admin.id,
    isDemo: true, // visible to site admins only
  });
  console.log(`league: ${league.name} â†’ /leagues/${league.slug}`);

  for (const d of dummies) {
    const userId = await ensureUser(d.email, d.user);
    const j = await joinLeague({ inviteCode: league.inviteCode, teamName: d.team, userId });
    if (j.error) throw new Error(j.error);
  }

  const settings = await getSettings(league.id);
  await generateSchedule(league.id, league.season, settings.playoffConfig.startWeek - 1);

  // Manual order with the admin picking 3rd (so two picks can already be made).
  const teams = await db
    .select()
    .from(s.teams)
    .where(eq(s.teams.leagueId, league.id))
    .orderBy(s.teams.id);
  const adminTeam = teams.find((t) => t.ownerUserId === admin.id)!;
  const others = teams.filter((t) => t.id !== adminTeam.id);
  const order = [others[0], others[1], adminTeam, ...others.slice(2)];
  for (let i = 0; i < order.length; i++) {
    await db.update(s.teams).set({ draftPosition: i + 1 }).where(eq(s.teams.id, order[i].id));
  }

  const started = await startDraft(league.id, { ...settings.draftConfig, orderMode: "manual" });
  if (started.error) throw new Error(started.error);
  const draft = (await getDraft(league.id))!;

  // Dummies make picks 1-2 from the top of the 2025-production board.
  const board = await getDraftBoard(draft.id);
  const teamOwner = new Map(teams.map((t) => [t.id, t.ownerUserId!]));
  for (const overall of [1, 2]) {
    const pick = board.find((p) => p.overallPick === overall)!;
    const [top] = await listAvailable(league.id, league.season, { limit: 1 });
    const r = await makePick({
      draftId: draft.id,
      gsisId: top.gsisId,
      byUserId: teamOwner.get(pick.teamId)!,
    });
    if (r.error) throw new Error(r.error);
    console.log(`pick ${overall}: ${top.name} (${top.position}, ${top.nflTeam})`);
  }

  console.log(`\nDemo ready â€” you are ON THE CLOCK at pick 3.`);
  console.log(`Open: http://localhost:3100/leagues/${league.slug}/draft`);
  await pool.end();
}

void main();
