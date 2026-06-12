"use server";

/**
 * Scoring Lab: score historical player_week_stats under arbitrary rules so the
 * site admins can calibrate league scoring before the season. Pure compute on
 * already-pushed data — nothing is written.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { players, playerWeekStats } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { scoreStatLine } from "@/lib/scoring/score-stat-line";
import type { ScoringRules } from "@/lib/scoring/scoring-systems";
import { scoringRulesSchema } from "@/lib/leagues/settings";
import { statRowToLine } from "@/lib/scoring/stat-row";
import { rulesFromForm } from "@/lib/scoring/lab-form";

export interface LabRow {
  /** Overall rank across every position in the scope. */
  rank: number;
  /** Rank within the player's own position (drives the leaderboard filter). */
  posRank: number;
  gsisId: string;
  name: string;
  position: string;
  team: string;
  games: number;
  points: number;
  ppg: number;
  /** Full per-component points breakdown (summed over the scope). */
  components: Record<string, number>;
}

export interface LabState {
  error: string | null;
  rows?: LabRow[];
  rulesUsed?: ScoringRules;
  scope?: string;
  /** The "show top" cap — applied per position so the filter has full depth. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Saved scoring sets: save the current Lab form under a name, or delete one.
// ---------------------------------------------------------------------------

export async function saveScoringSet(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return;

  const { revalidatePath } = await import("next/cache");
  const { scoringSets } = await import("@/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  const name = String(formData.get("setName") ?? "").trim().slice(0, 60);
  if (!name) return;

  const rules = rulesFromForm(formData);
  const validated = scoringRulesSchema.safeParse(rules);
  if (!validated.success) return;

  await db
    .insert(scoringSets)
    .values({ name, rules: validated.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: scoringSets.name,
      set: { rules: validated.data, updatedAt: sql`now()` },
    });
  revalidatePath("/admin/scoring-lab");
}

export async function deleteScoringSet(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return;

  const { revalidatePath } = await import("next/cache");
  const { scoringSets } = await import("@/lib/db/schema");
  const id = Number(formData.get("setId"));
  if (!Number.isInteger(id)) return;
  await db.delete(scoringSets).where(eq(scoringSets.id, id));
  revalidatePath("/admin/scoring-lab");
}

export async function runScoringLab(_prev: LabState, formData: FormData): Promise<LabState> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return { error: "Site admin only" };

  const season = Number(formData.get("season"));
  const week = Number(formData.get("week") ?? 0); // 0 = full season
  const position = String(formData.get("position") ?? "ALL");
  const limit = Math.min(Number(formData.get("limit") ?? 100), 500);

  const rules: ScoringRules = rulesFromForm(formData);
  const validated = scoringRulesSchema.safeParse(rules);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    return { error: `Invalid rules at ${issue?.path.join(".")}: ${issue?.message}` };
  }

  const conditions = [
    eq(playerWeekStats.season, season),
    eq(playerWeekStats.seasonType, "REG"),
  ];
  if (week > 0) conditions.push(eq(playerWeekStats.week, week));

  const rows = await db
    .select({
      stat: playerWeekStats,
      name: players.displayName,
      position: players.position,
      team: players.nflTeam,
    })
    .from(playerWeekStats)
    .innerJoin(players, eq(playerWeekStats.gsisId, players.gsisId))
    .where(and(...conditions));

  if (rows.length === 0) {
    return { error: `No stats found for ${season}${week > 0 ? ` week ${week}` : ""}` };
  }

  // Score each player-week, then aggregate per player.
  const agg = new Map<
    string,
    { name: string; position: string; team: string; games: number; points: number; components: Map<string, number> }
  >();
  const OFFENSE = new Set(["QB", "RB", "WR", "TE", "COACH"]); // no kickers / defenses
  for (const r of rows) {
    if (!OFFENSE.has(r.position)) continue;
    if (position !== "ALL" && r.position !== position) continue;
    const { points, breakdown } = scoreStatLine(statRowToLine(r.stat), rules, {
      isTightEnd: r.position === "TE",
      position: r.position,
    });
    const cur = agg.get(r.stat.gsisId) ?? {
      name: r.name,
      position: r.position,
      team: r.team ?? r.stat.team ?? "",
      games: 0,
      points: 0,
      components: new Map<string, number>(),
    };
    cur.games += 1;
    cur.points += points;
    for (const [key, v] of Object.entries(breakdown)) {
      cur.components.set(key, (cur.components.get(key) ?? 0) + v);
    }
    agg.set(r.stat.gsisId, cur);
  }

  // Keep the top `limit` of EACH position (not just overall) so the
  // leaderboard's position filter has full depth without a re-run.
  const sorted = [...agg.entries()].sort((a, b) => b[1].points - a[1].points);
  const posSeen = new Map<string, number>();
  const ranked: LabRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const [gsisId, p] = sorted[i];
    const posRank = (posSeen.get(p.position) ?? 0) + 1;
    posSeen.set(p.position, posRank);
    if (posRank > limit) continue;
    ranked.push({
      rank: i + 1,
      posRank,
      gsisId,
      name: p.name,
      position: p.position,
      team: p.team,
      games: p.games,
      points: Math.round(p.points * 100) / 100,
      ppg: Math.round((p.points / Math.max(p.games, 1)) * 100) / 100,
      components: Object.fromEntries(
        [...p.components.entries()].map(([k, v]) => [k, Math.round(v * 10) / 10]),
      ),
    });
  }

  return {
    error: null,
    rows: ranked,
    rulesUsed: rules,
    scope: `${season} ${week > 0 ? `week ${week}` : "full season"} · ${position} · ${agg.size} players`,
    limit,
  };
}
