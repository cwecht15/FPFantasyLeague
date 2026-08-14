/**
 * Simulate the remainder of an in-progress draft: make best-available picks
 * (team queue first, then last-season points under the league's own rules —
 * exactly what worker autopick would do) for every remaining slot until the
 * draft completes and the league flips to in_season.
 *
 * Picks are marked is_autopick so the board shows them as auto.
 *
 *   npx tsx scripts/sim-draft.ts <league-slug>              # status only (DB from .env.local)
 *   npx tsx scripts/sim-draft.ts <league-slug> run          # actually pick
 *   npx tsx scripts/sim-draft.ts <league-slug> run --prod   # against prod (APP_DB_URL
 *                                                             from tools/scoring/.env)
 *
 * --prod forces EMAIL_MODE=log; every pick otherwise fires a "you're on the
 * clock" email to the next real manager.
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { asc, eq, isNull, and } from "drizzle-orm";

async function main() {
  const args = process.argv.slice(2);
  const prod = args.includes("--prod");
  const [slug, runArg] = args.filter((a) => a !== "--prod");
  const doRun = runArg === "run";
  if (!slug) {
    console.error("usage: npx tsx scripts/sim-draft.ts <league-slug> [run] [--prod]");
    process.exit(1);
  }
  if (prod) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (!m) {
      console.error("APP_DB_URL not found in ../tools/scoring/.env");
      process.exit(1);
    }
    process.env.DATABASE_URL = m[1];
    process.env.EMAIL_MODE = "log";
  }
  if (doRun && process.env.EMAIL_MODE !== "log") {
    console.error("refusing to run without EMAIL_MODE=log (would email real managers)");
    process.exit(1);
  }

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { chooseAutopick, makePick } = await import("../src/lib/draft/service");

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league with slug ${slug}`);
    process.exit(1);
  }
  const [draft] = await db
    .select()
    .from(s.drafts)
    .where(eq(s.drafts.leagueId, league.id))
    .limit(1);
  if (!draft) {
    console.error("no draft exists for this league");
    process.exit(1);
  }

  const teamRows = await db.select().from(s.teams).where(eq(s.teams.leagueId, league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  const picks = await db
    .select()
    .from(s.draftPicks)
    .where(eq(s.draftPicks.draftId, draft.id))
    .orderBy(asc(s.draftPicks.overallPick));
  const made = picks.filter((p) => p.pickedAt).length;
  console.log(
    `${slug}: draft ${draft.id} status=${draft.status}, season ${league.season}, ` +
      `${made}/${picks.length} picks made`,
  );
  const current = picks.find((p) => p.id === draft.currentPickId);
  if (current) {
    console.log(
      `on the clock: pick ${current.overallPick} (R${current.round}.${current.pickInRound}) — ${teamName.get(current.teamId)}`,
    );
  }

  if (!doRun) {
    console.log("(status only — pass 'run' to simulate the remaining picks)");
    await pool.end();
    return;
  }
  if (draft.status !== "in_progress") {
    console.error(`draft is ${draft.status} — nothing to simulate`);
    process.exit(1);
  }

  let complete = false;
  let guard = picks.length + 5;
  while (!complete && guard-- > 0) {
    const [d] = await db.select().from(s.drafts).where(eq(s.drafts.id, draft.id)).limit(1);
    if (!d.currentPickId) break;
    const [pick] = await db
      .select()
      .from(s.draftPicks)
      .where(eq(s.draftPicks.id, d.currentPickId))
      .limit(1);
    const gsisId = await chooseAutopick(draft.id, league.id, pick.teamId, league.season);
    if (!gsisId) {
      console.error("no available player to pick — stopping");
      break;
    }
    const res = await makePick({
      draftId: draft.id,
      gsisId,
      byUserId: null,
      force: true,
      isAutopick: true,
    });
    if (res.error) {
      console.error(`pick ${pick.overallPick} failed: ${res.error}`);
      break;
    }
    const [pl] = await db
      .select({ name: s.players.displayName, pos: s.players.position })
      .from(s.players)
      .where(eq(s.players.gsisId, gsisId))
      .limit(1);
    console.log(
      `pick ${pick.overallPick} (R${pick.round}.${pick.pickInRound}) ${teamName.get(pick.teamId)}: ` +
        `${pl?.name ?? gsisId} (${pl?.pos ?? "?"})`,
    );
    complete = !!res.draftComplete;
  }

  if (complete) {
    console.log("draft complete — league is now in_season");
    for (const t of teamRows) {
      const roster = await db
        .select({ pos: s.players.position })
        .from(s.rosterEntries)
        .innerJoin(s.players, eq(s.players.gsisId, s.rosterEntries.gsisId))
        .where(
          and(
            eq(s.rosterEntries.teamId, t.id),
            eq(s.rosterEntries.leagueId, league.id),
            isNull(s.rosterEntries.droppedAt),
          ),
        );
      const byPos = new Map<string, number>();
      for (const r of roster) byPos.set(r.pos, (byPos.get(r.pos) ?? 0) + 1);
      const summary = [...byPos.entries()].map(([p, n]) => `${p}x${n}`).join(" ");
      console.log(`  ${t.name}: ${roster.length} players (${summary})`);
    }
  }
  await pool.end();
}

void main();
