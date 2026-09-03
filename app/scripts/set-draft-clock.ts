/**
 * Set a league's draft pick clock — including turning it off (0 = no clock:
 * picks never expire or autopick; the draft moves only when managers pick).
 * Optionally with an overnight quiet window (ET hours) during which the clock
 * pauses — see src/lib/draft/clock.ts.
 *
 * Updates the league's stored draft config, and if a draft is already
 * in progress, also the live draft row and the current pick's deadline, so
 * the change takes effect immediately. Remember: a running clock needs the
 * worker scaled up, or nothing ever expires.
 *
 * Run against the target DB (DATABASE_URL / .env.local):
 *   npx tsx scripts/set-draft-clock.ts <league-slug> <seconds> [quietStartEt quietEndEt]
 *   npx tsx scripts/set-draft-clock.ts my-league-abc123 0            # no clock
 *   npx tsx scripts/set-draft-clock.ts my-league-abc123 14400 0 10   # 4h, paused 12AM-10AM ET
 */

import "../src/lib/db/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { clockDeadline, quietWindowFrom } from "../src/lib/draft/clock";

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== "--prod");
  if (process.argv.includes("--prod")) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (!m) {
      console.error("APP_DB_URL not found in ../tools/scoring/.env");
      process.exit(1);
    }
    process.env.DATABASE_URL = m[1];
  }
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");

  const slug = argv[0];
  const seconds = Number(argv[1]);
  const quietArgs = [argv[2], argv[3]];
  const hasQuiet = quietArgs[0] !== undefined;
  const quietStart = hasQuiet ? Number(quietArgs[0]) : undefined;
  const quietEnd = hasQuiet ? Number(quietArgs[1]) : undefined;
  const badHour = (h: number | undefined) =>
    h !== undefined && (!Number.isInteger(h) || h < 0 || h > 23);
  if (
    !slug ||
    !Number.isInteger(seconds) ||
    seconds < 0 ||
    (seconds > 0 && seconds < 30) ||
    badHour(quietStart) ||
    badHour(quietEnd) ||
    (hasQuiet && quietEnd === undefined)
  ) {
    console.error(
      "usage: npx tsx scripts/set-draft-clock.ts <league-slug> <seconds (0 or >=30)> [quietStartEt quietEndEt]",
    );
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
  const nextConfig = {
    ...settings.draftConfig,
    secondsPerPick: seconds,
    clockQuietStartHourEt: quietStart,
    clockQuietEndHourEt: quietEnd,
  };
  await db
    .update(s.leagueSettings)
    .set({ draftConfig: nextConfig })
    .where(eq(s.leagueSettings.leagueId, league.id));
  const quiet = quietWindowFrom(nextConfig);
  console.log(
    `config: secondsPerPick = ${seconds}${seconds === 0 ? " (no clock)" : ""}` +
      (quiet ? `, clock paused ${quiet.startHourEt}:00-${quiet.endHourEt}:00 ET` : ""),
  );

  const [draft] = await db.select().from(s.drafts).where(eq(s.drafts.leagueId, league.id)).limit(1);
  if (draft && draft.status !== "complete") {
    await db.update(s.drafts).set({ secondsPerPick: seconds }).where(eq(s.drafts.id, draft.id));
    if (draft.currentPickId) {
      const deadline =
        seconds > 0 && draft.status === "in_progress"
          ? clockDeadline(new Date(), seconds, quiet)
          : null;
      await db
        .update(s.draftPicks)
        .set({ deadlineAt: deadline })
        .where(eq(s.draftPicks.id, draft.currentPickId));
      if (deadline) console.log(`current pick deadline: ${deadline.toISOString()}`);
    }
    console.log(`live draft ${draft.id} (${draft.status}) updated — current pick deadline ${seconds > 0 ? "restarted" : "cleared"}`);
  } else {
    console.log(draft ? "draft already complete — config change affects nothing" : "no draft yet — applies when the draft starts");
  }
  await pool.end();
}

void main();
