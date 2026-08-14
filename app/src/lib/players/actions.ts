"use server";

/**
 * Player game log: weekly stat lines scored under the caller's league rules
 * (same scoring path as the draft rankings and the Scoring Lab), for the
 * league season or the season before. Powers the click-a-name popup.
 *
 * Columns are the league's own scoring components (from scoreStatLine's
 * breakdown), not a fixed stat list — a league scoring EPA and MTF shows
 * EPA and MTF columns; a PPR league shows receptions. Values are the points
 * each component contributed that week; the most valuable components (by
 * season total) get columns, the tail collapses into "Other".
 */

import { and, asc, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, playerWeekStats } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { scoreStatLine } from "@/lib/scoring/score-stat-line";
import { statRowToLine } from "@/lib/scoring/stat-row";

export interface GameLogRow {
  week: number;
  team: string | null;
  /** Component points aligned with GameLog.cols (incl. "Other" if present). */
  values: number[];
  points: number;
}

export interface GameLog {
  error: string | null;
  name?: string;
  position?: string;
  nflTeam?: string | null;
  seasons?: number[];
  season?: number;
  cols?: string[];
  rows?: GameLogRow[];
  total?: number;
}

/** Human labels for scoreStatLine breakdown keys (fallback: the key itself). */
const LABELS: Record<string, string> = {
  passYds: "Pass yds",
  passTd: "Pass TD",
  interception: "INT",
  pass2pt: "2pt pass",
  rushYds: "Rush yds",
  rushTd: "Rush TD",
  rush2pt: "2pt rush",
  receptions: "Rec",
  recYds: "Rec yds",
  recTd: "Rec TD",
  rec2pt: "2pt rec",
  fumbleLost: "Fum",
  bonus_pass_yds: "Pass bonus",
  bonus_rush_yds: "Rush bonus",
  bonus_rec_yds: "Rec bonus",
  deepPassYds: "5+ air yds",
  deepPassFirstDown: "5+ air 1D",
  deepPassTd: "5+ air TD",
  sackTaken: "Sacks",
  incompletion: "Incomp",
  epaPerDropback: "EPA/DB",
  epaTotal: "EPA",
  passAirYds: "Pass air yds",
  accurateThrow: "Accurate",
  catchableThrow: "Catchable",
  turnoverWorthy: "TO-worthy",
  heroThrow: "Hero throw",
  heroCatch: "Hero catch",
  drop: "Drops",
  recAirYds: "Rec air yds",
  recYac: "YAC",
  recYaco: "Rec YACO",
  recFirstDown: "Rec 1D",
  recFirstRead: "1st read",
  missedTackleForced: "MTF",
  rushMtf: "Rush MTF",
  recMtf: "Rec MTF",
  explosivePlay: "Explosive",
  rushExplosive: "Expl rush",
  recExplosive: "Expl rec",
  separation: "Separation",
  sepM2: "Sep −2",
  sepM1: "Sep −1",
  sepP1: "Sep +1",
  sepP2: "Sep +2",
  sepP3: "Sep +3",
  sepP4: "Sep +4",
  rushStuff: "Stuffs",
  rushYbc: "YBC",
  rushYaco: "Rush YACO",
  xfp: "xFP",
  paDropbacks: "PA DBs",
  motionDropbacks: "Motion DBs",
  fourthDownGo: "4th-down go",
  run2ndLong: "Run 2nd&7+",
  deep2ndShort: "Deep 2nd&1-2",
  teamWin: "Win",
  scored30Plus: "30+ pts",
};

const MAX_COLS = 8;
const round1 = (v: number) => Math.round(v * 10) / 10;

export async function getPlayerLog(
  slug: string,
  gsisId: string,
  season?: number,
): Promise<GameLog> {
  const user = await requireUser();
  const ctx = await getLeagueForUser(slug, user.id);
  if (!ctx) return { error: "League not found" };

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.gsisId, gsisId))
    .limit(1);
  if (!player) return { error: "Player not found" };

  const seasons = [ctx.league.season, ctx.league.season - 1];
  const chosen = season && seasons.includes(season) ? season : ctx.league.season;

  const settings = await getSettings(ctx.league.id);
  const rules = settings.scoringRules;

  const statRows = await db
    .select()
    .from(playerWeekStats)
    .where(
      and(
        eq(playerWeekStats.gsisId, gsisId),
        eq(playerWeekStats.seasonType, "REG"),
        eq(playerWeekStats.season, chosen),
      ),
    )
    .orderBy(asc(playerWeekStats.week));

  const scored = statRows.map((s) => ({
    s,
    r: scoreStatLine(statRowToLine(s), rules, {
      isTightEnd: player.position === "TE",
      position: player.position,
    }),
  }));

  // Rank this league's scoring components by season impact for this player.
  const impact = new Map<string, number>();
  for (const { r } of scored) {
    for (const [k, v] of Object.entries(r.breakdown)) {
      impact.set(k, (impact.get(k) ?? 0) + Math.abs(v));
    }
  }
  const ranked = [...impact.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const shown = ranked.slice(0, MAX_COLS);
  const hasOther = ranked.length > MAX_COLS;

  const rows: GameLogRow[] = scored.map(({ s, r }) => {
    const values = shown.map((k) => round1(r.breakdown[k] ?? 0));
    if (hasOther) {
      const rest = Object.entries(r.breakdown)
        .filter(([k]) => !shown.includes(k))
        .reduce((sum, [, v]) => sum + v, 0);
      values.push(round1(rest));
    }
    return { week: s.week, team: s.team, values, points: round1(r.points) };
  });

  return {
    error: null,
    name: player.displayName,
    position: player.position,
    nflTeam: player.nflTeam,
    seasons,
    season: chosen,
    cols: [...shown.map((k) => LABELS[k] ?? k), ...(hasOther ? ["Other"] : [])],
    rows,
    total: round1(rows.reduce((sum, r) => sum + r.points, 0)),
  };
}
