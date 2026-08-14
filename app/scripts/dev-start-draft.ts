/**
 * Start a league's draft from the CLI (same code path as the admin UI button).
 * Useful with dev-slow-draft-rehearsal.ts + sim-draft.ts to build a
 * post-draft league without clicking through the app.
 *
 *   npx tsx scripts/dev-start-draft.ts <league-slug>
 */

import "../src/lib/db/load-env";
import { eq } from "drizzle-orm";

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("usage: npx tsx scripts/dev-start-draft.ts <league-slug>");
    process.exit(1);
  }

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { startDraft } = await import("../src/lib/draft/service");

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

  const result = await startDraft(league.id, settings.draftConfig);
  if (result.error) {
    console.error(`startDraft: ${result.error}`);
    process.exit(1);
  }
  console.log(`draft ${result.draftId} started for ${slug}`);
  await pool.end();
}

void main();
