/**
 * Set a league's draft pick clock — including turning it off (0 = no clock:
 * picks never expire or autopick; the draft moves only when managers pick).
 *
 * Updates the league's stored draft config, and if a draft is already
 * in progress, also the live draft row and the current pick's deadline, so
 * the change takes effect immediately.
 *
 * Run against the target DB (DATABASE_URL / .env.local):
 *   npx tsx scripts/set-draft-clock.ts <league-slug> <seconds>
 *   npx tsx scripts/set-draft-clock.ts my-league-abc123 0        # no clock
 *   npx tsx scripts/set-draft-clock.ts my-league-abc123 28800    # 8 hours
 */

import "../src/lib/db/load-env";
import { eq, isNull, sql } from "drizzle-orm";

async function main() {
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");

  const slug = process.argv[2];
  const seconds = Number(process.argv[3]);
  if (!slug || !Number.isInteger(seconds) || seconds < 0 || (seconds > 0 && seconds < 30)) {
    console.error("usage: npx tsx scripts/set-draft-clock.ts <league-slug> <seconds (0 or >=30)>");
    process.exit(1);
  }

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) {
    console.error(`no league with slug ${slug}`);
    process.exit(1);
  }

  const [settings] = await db
    .select()
    .from(s.leagueSettings)
    .where(eq(s.leagueSettings.leagueId, league.id))
    .limit(1);
  await db
    .update(s.leagueSettings)
    .set({ draftConfig: { ...settings.draftConfig, secondsPerPick: seconds } })
    .where(eq(s.leagueSettings.leagueId, league.id));
  console.log(`config: secondsPerPick = ${seconds}${seconds === 0 ? " (no clock)" : ""}`);

  const [draft] = await db.select().from(s.drafts).where(eq(s.drafts.leagueId, league.id)).limit(1);
  if (draft && draft.status !== "complete") {
    await db.update(s.drafts).set({ secondsPerPick: seconds }).where(eq(s.drafts.id, draft.id));
    if (draft.currentPickId) {
      await db
        .update(s.draftPicks)
        .set({
          deadlineAt:
            seconds > 0 && draft.status === "in_progress"
              ? sql`now() + (${seconds} || ' seconds')::interval`
              : null,
        })
        .where(eq(s.draftPicks.id, draft.currentPickId));
    }
    console.log(`live draft ${draft.id} (${draft.status}) updated — current pick deadline ${seconds > 0 ? "restarted" : "cleared"}`);
  } else {
    console.log(draft ? "draft already complete — config change affects nothing" : "no draft yet — applies when the draft starts");
  }
  await pool.end();
}

void main();
