/**
 * Sanity check the FP Advanced preset against a full season: prints the top
 * QBs (advanced mode: 5+ air-yard production, sacks, EPA/DB x10) and top RBs
 * (PPR + 2/MTF) with their component breakdowns.
 *
 * Run:  npx tsx scripts/dev-fp-advanced-check.ts [season]
 */

import "../src/lib/db/load-env";
import { and, eq } from "drizzle-orm";

async function main() {
  const season = Number(process.argv[2] ?? 2024);
  const { db, pool } = await import("../src/lib/db");
  const s = await import("../src/lib/db/schema");
  const { scoreStatLine } = await import("../src/lib/scoring/score-stat-line");
  const { SCORING_PRESETS } = await import("../src/lib/scoring/scoring-systems");
  const { statRowToLine } = await import("../src/lib/scoring/stat-row");

  const rules = SCORING_PRESETS.fp_advanced;
  const rows = await db
    .select({ stat: s.playerWeekStats, name: s.players.displayName, position: s.players.position })
    .from(s.playerWeekStats)
    .innerJoin(s.players, eq(s.players.gsisId, s.playerWeekStats.gsisId))
    .where(and(eq(s.playerWeekStats.season, season), eq(s.playerWeekStats.seasonType, "REG")));

  const agg = new Map<string, { name: string; pos: string; g: number; pts: number; comp: Map<string, number> }>();
  for (const r of rows) {
    if (!["QB", "RB", "WR", "TE"].includes(r.position)) continue;
    const { points, breakdown } = scoreStatLine(statRowToLine(r.stat), rules, {
      isTightEnd: r.position === "TE",
      position: r.position,
    });
    const cur = agg.get(r.stat.gsisId) ?? {
      name: r.name,
      pos: r.position,
      g: 0,
      pts: 0,
      comp: new Map<string, number>(),
    };
    cur.g++;
    cur.pts += points;
    for (const [k, v] of Object.entries(breakdown)) cur.comp.set(k, (cur.comp.get(k) ?? 0) + v);
    agg.set(r.stat.gsisId, cur);
  }

  for (const pos of ["QB", "RB", "WR"]) {
    console.log(`\n=== ${season} top ${pos}s (FP Advanced) ===`);
    [...agg.values()]
      .filter((p) => p.pos === pos)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 8)
      .forEach((p, i) => {
        const top = [...p.comp.entries()]
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 4)
          .map(([k, v]) => `${k} ${v.toFixed(1)}`)
          .join(", ");
        console.log(
          `${String(i + 1).padStart(2)}. ${p.name.padEnd(24)} ${p.pts.toFixed(1).padStart(7)} (${p.g}g, ${(p.pts / p.g).toFixed(1)}/g)  ${top}`,
        );
      });
  }
  await pool.end();
}

void main();
