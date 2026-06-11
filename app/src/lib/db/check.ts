/**
 * Quick connectivity + schema check. Run with `npm run db:check`.
 * Confirms DATABASE_URL works and the migration has been applied.
 */
import "./load-env";
import { pool } from "./index";

async function main() {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
      ORDER BY table_name`,
  );
  console.log(`[db:check] connected — ${rows.length} tables:`);
  console.log("  " + rows.map((r) => r.table_name).join(", "));

  for (const t of ["users", "leagues", "players", "player_week_stats", "jobs"]) {
    try {
      const c = await pool.query(`SELECT count(*)::int AS n FROM "${t}"`);
      console.log(`  ${t}: ${c.rows[0].n} rows`);
    } catch {
      console.log(`  ${t}: (missing — migration not applied?)`);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[db:check] failed:", err);
  process.exit(1);
});
