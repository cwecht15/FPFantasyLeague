/**
 * Step 6: score projected stat lines with the app's REAL scoring engine.
 *
 * Reads out/projected_stat_lines.csv + out/league_rules.json (the live league's
 * stored scoring_rules), scores each player's PER-GAME AVERAGE line via
 * scoreStatLine, and multiplies by games. Every component of the league's rules
 * is linear in the weekly stats, so this is exact — except the COACH 30-point
 * bonus (a threshold), which is added afterward as score30Bonus x exp30 from
 * the coach model.
 *
 * Run from app/:  npx tsx ../tools/draft_guide/score_projections.ts
 * Out:            out/projected_points.json  [{gsisId, points, breakdown}]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { scoreStatLine, type RawStatLine } from "../../app/src/lib/scoring/score-stat-line";
import type { ScoringRules } from "../../app/src/lib/scoring/scoring-systems";

const OUT = path.join(__dirname, "out");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const NUMERIC_FIELDS: (keyof RawStatLine)[] = [
  "accurateThrows", "catchableThrows", "heroThrows", "toWorthyThrows",
  "incompletions", "sacksTaken", "dropbacks", "mtf", "rushMtf", "recMtf",
  "rushYaco", "recYaco", "rushExplosives", "recExplosives", "explosivePlays",
  "recFd", "heroCatches", "drops", "firstReadTargets", "routes", "sepTotal",
  "sepM2", "sepM1", "sepP1", "sepP2", "sepP3", "sepP4", "passYds", "passTd",
  "passInt", "rushYds", "rushTd", "receptions", "recYds", "recTd", "fumblesLost",
  "paDropbacks", "motionDropbacks", "fourthDownAttempts", "run2ndLong",
  "deep2ndShort", "teamWin",
];

function main() {
  const inPath = process.argv[2] ?? path.join(OUT, "projected_stat_lines.csv");
  const outPath = process.argv[3] ?? path.join(OUT, "projected_points.json");
  const rules = JSON.parse(
    fs.readFileSync(path.join(OUT, "league_rules.json"), "utf8"),
  ) as ScoringRules;
  const rows = parseCsv(fs.readFileSync(inPath, "utf8"));

  const results = rows.map((r) => {
    const games = Number(r.games) || 17;
    const perGame: RawStatLine = {};
    for (const f of NUMERIC_FIELDS) {
      const v = Number(r[f]);
      if (r[f] !== "" && r[f] !== undefined && Number.isFinite(v)) {
        (perGame as Record<string, number>)[f] = v / games;
      }
    }
    const { points, breakdown } = scoreStatLine(perGame, rules, {
      position: r.position,
      isTightEnd: r.position === "TE",
    });
    const season: Record<string, number> = {};
    for (const [k, v] of Object.entries(breakdown)) {
      season[k] = Math.round(v * games * 100) / 100;
    }
    let total = Math.round(points * games * 100) / 100;
    // COACH 30+ bonus: threshold can't fire on an average line; add expectation.
    const exp30 = Number(r.exp30);
    if (r.position === "COACH" && Number.isFinite(exp30) && rules.coaching) {
      const bonus = Math.round(exp30 * rules.coaching.score30Bonus * 100) / 100;
      season.scored30Plus = bonus;
      total = Math.round((total + bonus) * 100) / 100;
    }
    return { gsisId: r.gsisId, points: total, breakdown: season };
  });

  fs.writeFileSync(outPath, JSON.stringify(results, null, 1));
  const top = [...results].sort((a, b) => b.points - a.points).slice(0, 10);
  console.log(`${path.basename(outPath)}: ${results.length} rows`);
  for (const t of top) console.log(`  ${t.gsisId}  ${t.points}`);
}

main();
