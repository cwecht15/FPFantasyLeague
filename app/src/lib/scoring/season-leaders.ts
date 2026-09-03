/**
 * Season leaderboard support for the spectator pages: which seasons have
 * pushed stats, and a per-player season breakdown re-scored through
 * scoreStatLine under the league's rules. Past seasons were never
 * league-scored into player_week_scores, so everything here recomputes from
 * player_week_stats — the same approach (and numbers) as the draft room's
 * seasonPointsByPlayer.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { playerWeekStats } from "@/lib/db/schema";
import { scoreStatLine } from "./score-stat-line";
import { statRowToLine } from "./stat-row";
import type { ScoringRules } from "./scoring-systems";

/** Seasons with any REG stat lines pushed, newest first. */
export async function availableSeasons(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ season: playerWeekStats.season })
    .from(playerWeekStats)
    .where(eq(playerWeekStats.seasonType, "REG"));
  return rows.map((r) => r.season).sort((a, b) => b - a);
}

export interface PlayerSeasonBreakdown {
  points: number;
  games: number;
  /** Season-total points per scoring component (nonzero only), engine keys. */
  components: Record<string, number>;
  /** Per-week points, ascending week order. */
  weeks: { week: number; points: number }[];
}

export async function playerSeasonBreakdown(
  gsisId: string,
  season: number,
  rules: ScoringRules,
  position: string,
): Promise<PlayerSeasonBreakdown | null> {
  const rows = await db
    .select()
    .from(playerWeekStats)
    .where(
      and(
        eq(playerWeekStats.gsisId, gsisId),
        eq(playerWeekStats.season, season),
        eq(playerWeekStats.seasonType, "REG"),
      ),
    )
    .orderBy(playerWeekStats.week);
  if (rows.length === 0) return null;

  const components: Record<string, number> = {};
  const weeks: { week: number; points: number }[] = [];
  let total = 0;
  for (const r of rows) {
    const { points, breakdown } = scoreStatLine(statRowToLine(r), rules, {
      isTightEnd: position === "TE",
      position,
    });
    total += points;
    weeks.push({ week: r.week, points });
    for (const [k, v] of Object.entries(breakdown)) {
      components[k] = (components[k] ?? 0) + v;
    }
  }
  for (const k of Object.keys(components)) {
    components[k] = Math.round(components[k] * 100) / 100;
    if (components[k] === 0) delete components[k];
  }
  return { points: Math.round(total * 100) / 100, games: rows.length, components, weeks };
}

/** Display labels for scoreStatLine breakdown keys (spectator-facing). */
export const BREAKDOWN_LABELS: Record<string, string> = {
  passYds: "Passing yards",
  passTd: "Passing TDs",
  interception: "Interceptions",
  pass2pt: "Passing 2-pt",
  rushYds: "Rushing yards",
  rushTd: "Rushing TDs",
  rush2pt: "Rushing 2-pt",
  receptions: "Receptions",
  recYds: "Receiving yards",
  recTd: "Receiving TDs",
  rec2pt: "Receiving 2-pt",
  fumbleLost: "Fumbles lost",
  accurateThrow: "Accurate throws",
  catchableThrow: "Catchable throws",
  turnoverWorthy: "Turnover-worthy throws",
  heroThrow: "Hero throws",
  heroCatch: "Hero catches",
  drop: "Drops",
  missedTackleForced: "Missed tackles forced",
  rushMtf: "MTF (rushing)",
  recMtf: "MTF (receiving)",
  passAirYds: "Passing air yards",
  recAirYds: "Receiving air yards",
  recYac: "Yards after catch",
  recYaco: "Rec. yards after contact",
  recFirstDown: "Receiving first downs",
  recFirstRead: "First-read targets",
  explosivePlay: "Explosive plays",
  rushExplosive: "Explosive rushes (10+)",
  recExplosive: "Explosive catches (15+)",
  separation: "Separation (per point)",
  sepM2: "Routes at −2 separation",
  sepM1: "Routes at −1 separation",
  sepP1: "Routes at +1 separation",
  sepP2: "Routes at +2 separation",
  sepP3: "Routes at +3 separation",
  sepP4: "Routes at +4 separation",
  rushStuff: "Stuffed runs",
  rushYbc: "Yards before contact",
  rushYaco: "Rush yards after contact",
  deepPassYds: "Passing yards, 5+ air",
  deepPassFirstDown: "Passing 1Ds, 5+ air",
  deepPassTd: "Passing TDs, 5+ air",
  sackTaken: "Sacks taken",
  incompletion: "Incompletions",
  epaPerDropback: "EPA per dropback",
  epaTotal: "EPA total",
  xfp: "Expected fantasy points",
  paDropbacks: "Play-action dropbacks",
  motionDropbacks: "Motion dropbacks",
  fourthDownGo: "4th-down go",
  run2ndLong: "Runs on 2nd & 7+",
  deep2ndShort: "Deep shots on 2nd & short",
  teamWin: "Team wins",
  scored30Plus: "30+ point games",
};

export function breakdownLabel(key: string): string {
  return BREAKDOWN_LABELS[key] ?? key;
}
