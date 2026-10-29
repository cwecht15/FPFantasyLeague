/**
 * Turn best ball on/off for a league, optionally re-scoring past weeks with it.
 * In best ball every team's starters are rewritten, once a week is scored, to
 * the highest-scoring legal lineup from the roster it held that week.
 *
 *   npx tsx scripts/set-best-ball.ts <league-slug> <on|off> [--rescore <from>-<to>] [--prod] [--yes]
 *
 * --rescore rewrites lineups and matchup results for those weeks, INCLUDING
 * Thursday-locked ones, then recomputes standings. Without --yes it only
 * prints what would change (nothing is written). With --yes it first saves a
 * JSON snapshot of lineups/matchups/standings to --snapshot <path> (required).
 */

import "../src/lib/db/load-env";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const prod = args.includes("--prod");
  const yes = args.includes("--yes");
  const rescore = flag("--rescore");
  const snapshot = flag("--snapshot");
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && !["--rescore", "--snapshot"].includes(args[i - 1]),
  );
  const [slug, mode] = positional;
  if (!slug || !["on", "off"].includes(mode)) {
    console.error(
      "usage: npx tsx scripts/set-best-ball.ts <slug> <on|off> [--rescore <from>-<to>] [--prod] [--yes --snapshot <path>]",
    );
    process.exit(1);
  }
  let weeks: number[] = [];
  if (rescore) {
    const [a, b] = rescore.split("-").map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b ?? a)) throw new Error("bad --rescore range");
    for (let w = a; w <= (b ?? a); w++) weeks.push(w);
  }
  if (yes && weeks.length && !snapshot) throw new Error("--snapshot <path> is required with --rescore --yes");
  if (prod) {
    const env = readFileSync(resolve(process.cwd(), "../tools/scoring/.env"), "utf8");
    const m = env.match(/^APP_DB_URL="?([^"\r\n]+)"?/m);
    if (!m) throw new Error("APP_DB_URL not found in ../tools/scoring/.env");
    process.env.DATABASE_URL = m[1];
  }
  process.env.EMAIL_MODE = "log";

  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { getSettings } = await import("../src/lib/leagues/service");
  const { applyBestBallLineup } = await import("../src/lib/lineups/best-ball");
  const { rollupLeagueWeek, recomputeStandings } = await import("../src/lib/matchups/rollup");
  const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;

  const [league] = await db.select().from(s.leagues).where(eq(s.leagues.slug, slug)).limit(1);
  if (!league) throw new Error(`no league ${slug}`);
  const settings = await getSettings(league.id);
  const template = { ...settings.rosterTemplate, bestBall: mode === "on" };

  const results = async () =>
    q(
      `select m.week, ht.name home, m.home_points hp, at.name away, m.away_points ap, w.name winner
       from matchups m join teams ht on ht.id=m.home_team_id left join teams at on at.id=m.away_team_id
       left join teams w on w.id=m.winner_team_id
       where m.league_id=$1 and m.season=$2 and m.week = any($3) order by m.week, m.id`,
      [league.id, league.season, weeks],
    );

  if (!yes) {
    console.log(`DRY RUN — would set bestBall=${mode === "on"} on ${league.name}`);
    if (weeks.length) console.log(`and re-score weeks ${weeks.join(",")} (run with --yes to apply)`);
    await pool.end();
    return;
  }

  if (weeks.length) {
    const snap = {
      at: new Date().toISOString(),
      league: league.slug,
      weeks,
      lineups: await q(
        `select l.*, ls.id slot_id, ls.slot, ls.slot_index, ls.gsis_id from lineups l
         join teams t on t.id=l.team_id left join lineup_slots ls on ls.lineup_id=l.id
         where t.league_id=$1 and l.season=$2 and l.week = any($3)`,
        [league.id, league.season, weeks],
      ),
      matchups: await q(`select * from matchups where league_id=$1 and season=$2 and week = any($3)`, [
        league.id,
        league.season,
        weeks,
      ]),
      standings: await q(`select * from standings where league_id=$1 and season=$2`, [league.id, league.season]),
    };
    writeFileSync(snapshot!, JSON.stringify(snap, null, 1));
    console.log(`snapshot → ${snapshot}`);
  }

  await db
    .update(s.leagueSettings)
    .set({ rosterTemplate: template, updatedAt: new Date() })
    .where(eq(s.leagueSettings.leagueId, league.id));
  console.log(`bestBall=${template.bestBall} on ${league.name}`);

  if (weeks.length) {
    const teams = await db.select({ id: s.teams.id }).from(s.teams).where(eq(s.teams.leagueId, league.id));
    for (const w of weeks) {
      if (template.bestBall) {
        for (const t of teams) await applyBestBallLineup(league.id, t.id, league.season, w, template);
      }
      const n = await rollupLeagueWeek(league.id, league.season, w, { force: true });
      console.log(`week ${w}: ${n} matchups re-rolled`);
    }
    await recomputeStandings(league.id, league.season);
    for (const r of await results()) {
      console.log(
        `W${r.week} ${r.home} ${Number(r.hp).toFixed(1)} - ${Number(r.ap).toFixed(1)} ${r.away}  → ${r.winner ?? "tie"}`,
      );
    }
    console.log(
      await q(
        `select t.name, s.wins, s.losses, s.ties, round(s.points_for::numeric,1) pf, s.rank
         from standings s join teams t on t.id=s.team_id where s.league_id=$1 and s.season=$2 order by s.rank`,
        [league.id, league.season],
      ),
    );
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
