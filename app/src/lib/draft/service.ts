/**
 * Async snake-draft engine.
 *
 * Concurrency discipline (per plan): the current pick row is read FOR UPDATE
 * inside a transaction to serialize simultaneous pick attempts; the partial
 * unique index (draft_id, gsis_id) is the hard double-pick guard; the worker's
 * clock scan uses FOR UPDATE SKIP LOCKED so a human pick that lands first
 * simply wins.
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db, pool } from "@/lib/db";
import {
  draftPicks,
  draftQueue,
  drafts,
  leagues,
  leagueSettings,
  players,
  playerWeekStats,
  rosterEntries,
  teams,
  transactions,
} from "@/lib/db/schema";
import {
  SLOT_ELIGIBILITY,
  draftConfigSchema,
  type DraftConfig,
  type RosterTemplate,
} from "@/lib/leagues/settings";
import { clockDeadline, quietWindowFrom, type QuietWindow } from "./clock";
import guideRanks from "./guide-ranks.json";
import { scoreStatLine } from "@/lib/scoring/score-stat-line";
import { statRowToLine } from "@/lib/scoring/stat-row";
import type { ScoringRules } from "@/lib/scoring/scoring-systems";

/** Quiet window for a league's clock, straight from stored draft_config. */
async function leagueQuietWindow(leagueId: number): Promise<QuietWindow | null> {
  const [row] = await db
    .select({ draftConfig: leagueSettings.draftConfig })
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  if (!row) return null;
  const parsed = draftConfigSchema.safeParse(row.draftConfig);
  return parsed.success ? quietWindowFrom(parsed.data) : null;
}

export type Draft = typeof drafts.$inferSelect;
export type DraftPick = typeof draftPicks.$inferSelect;

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/** Snake order of team ids for a round (1-indexed), honoring 3rd-round reversal. */
export function snakeOrder(
  teamIds: number[],
  round: number,
  thirdRoundReversal: boolean,
): number[] {
  // With 3RR: R1 forward, R2 reverse, R3 reverse again, then alternate.
  const reversed = thirdRoundReversal
    ? round === 1
      ? false
      : round === 2
        ? true
        : round % 2 === 1 // R3 rev, R4 fwd, R5 rev …
    : round % 2 === 0;
  return reversed ? [...teamIds].reverse() : teamIds;
}

export async function startDraft(
  leagueId: number,
  config: DraftConfig,
): Promise<{ draftId?: number; error?: string }> {
  const leagueTeams = await db
    .select()
    .from(teams)
    .where(eq(teams.leagueId, leagueId))
    .orderBy(teams.id);
  if (leagueTeams.length < 2) return { error: "Need at least 2 teams" };
  if (leagueTeams.some((t) => !t.ownerUserId)) {
    return { error: "All teams must be claimed before drafting" };
  }

  const [existing] = await db
    .select({ id: drafts.id })
    .from(drafts)
    .where(eq(drafts.leagueId, leagueId))
    .limit(1);
  if (existing) return { error: "Draft already exists for this league" };

  // Resolve order.
  let ordered = [...leagueTeams];
  if (config.orderMode === "manual") {
    ordered.sort((a, b) => (a.draftPosition ?? 99) - (b.draftPosition ?? 99));
  } else {
    // random (reverse_standings only meaningful in later seasons; random for now)
    for (let i = ordered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  }

  return db.transaction(async (tx) => {
    // Persist resolved order.
    for (let i = 0; i < ordered.length; i++) {
      await tx.update(teams).set({ draftPosition: i + 1 }).where(eq(teams.id, ordered[i].id));
    }

    const [draft] = await tx
      .insert(drafts)
      .values({
        leagueId,
        status: "in_progress",
        secondsPerPick: config.secondsPerPick,
        startedAt: new Date(),
      })
      .returning();

    const teamIds = ordered.map((t) => t.id);
    const values = [];
    let overall = 1;
    for (let round = 1; round <= config.rounds; round++) {
      const order = snakeOrder(teamIds, round, config.thirdRoundReversal);
      for (let i = 0; i < order.length; i++) {
        values.push({
          draftId: draft.id,
          overallPick: overall++,
          round,
          pickInRound: i + 1,
          teamId: order[i],
        });
      }
    }
    const inserted = await tx.insert(draftPicks).values(values).returning({
      id: draftPicks.id,
      overallPick: draftPicks.overallPick,
    });

    const first = inserted.find((p) => p.overallPick === 1)!;
    const now = new Date();
    // secondsPerPick 0 = no clock: the pick has no deadline, so it can never
    // expire into an autopick — the draft only moves when someone picks.
    const deadline =
      config.secondsPerPick > 0
        ? clockDeadline(now, config.secondsPerPick, quietWindowFrom(config))
        : null;
    await tx
      .update(draftPicks)
      .set({ clockStartedAt: now, deadlineAt: deadline })
      .where(eq(draftPicks.id, first.id));
    await tx.update(drafts).set({ currentPickId: first.id }).where(eq(drafts.id, draft.id));
    await tx.update(leagues).set({ status: "drafting" }).where(eq(leagues.id, leagueId));

    return { draftId: draft.id };
  });
}

// ---------------------------------------------------------------------------
// Pick
// ---------------------------------------------------------------------------

export interface PickResult {
  error: string | null;
  draftComplete?: boolean;
}

/** Make the current pick. `byUserId` must own the on-clock team (admins may
 *  pass `force` to pick for a team). `isAutopick` marks worker picks. */
export async function makePick(opts: {
  draftId: number;
  gsisId: string;
  byUserId: string | null;
  force?: boolean;
  isAutopick?: boolean;
}): Promise<PickResult> {
  const { draftId, gsisId, byUserId, force, isAutopick } = opts;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      rows: [draft],
    } = await client.query(
      `SELECT id, league_id, status, current_pick_id, seconds_per_pick
         FROM drafts WHERE id = $1 FOR UPDATE`,
      [draftId],
    );
    if (!draft) throw new Error("Draft not found");
    if (draft.status !== "in_progress") {
      await client.query("ROLLBACK");
      return { error: `Draft is ${draft.status}` };
    }

    const {
      rows: [pick],
    } = await client.query(
      `SELECT p.id, p.team_id, p.overall_pick, p.picked_at, t.owner_user_id
         FROM draft_picks p JOIN teams t ON t.id = p.team_id
        WHERE p.id = $1 FOR UPDATE OF p`,
      [draft.current_pick_id],
    );
    if (!pick || pick.picked_at) {
      await client.query("ROLLBACK");
      return { error: "No pick is currently on the clock" };
    }
    if (!force && pick.owner_user_id !== byUserId) {
      await client.query("ROLLBACK");
      return { error: "It's not your pick" };
    }

    // Player must not already be rostered in this league (covers pre-draft adds).
    const {
      rows: [owned],
    } = await client.query(
      `SELECT 1 FROM roster_entries
        WHERE league_id = $1 AND gsis_id = $2 AND dropped_at IS NULL LIMIT 1`,
      [draft.league_id, gsisId],
    );
    if (owned) {
      await client.query("ROLLBACK");
      return { error: "That player is already on a roster" };
    }

    // The unique index is the hard double-pick guard.
    try {
      await client.query(
        `UPDATE draft_picks
            SET gsis_id = $2, picked_at = now(), picked_by_user_id = $3, is_autopick = $4
          WHERE id = $1`,
        [pick.id, gsisId, byUserId, isAutopick ?? false],
      );
    } catch (err) {
      await client.query("ROLLBACK");
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("draft_picks_player_unique")) {
        return { error: "That player was just drafted" };
      }
      throw err;
    }

    await client.query(
      `INSERT INTO roster_entries (league_id, team_id, gsis_id, acquired_via)
       VALUES ($1, $2, $3, 'draft')`,
      [draft.league_id, pick.team_id, gsisId],
    );
    await client.query(
      `INSERT INTO transactions (league_id, team_id, type, add_gsis_id, created_by_user_id, processed_at)
       VALUES ($1, $2, 'draft', $3, $4, now())`,
      [draft.league_id, pick.team_id, gsisId, byUserId],
    );

    // Remove from every queue in this draft.
    await client.query(`DELETE FROM draft_queue WHERE draft_id = $1 AND gsis_id = $2`, [
      draftId,
      gsisId,
    ]);

    // Advance the clock.
    const {
      rows: [next],
    } = await client.query(
      `SELECT id FROM draft_picks
        WHERE draft_id = $1 AND picked_at IS NULL
        ORDER BY overall_pick LIMIT 1`,
      [draftId],
    );
    let draftComplete = false;
    if (next) {
      // Deadline computed here (not in SQL) so the overnight quiet window in
      // the league's draft config can pause the clock.
      let nextDeadline: Date | null = null;
      if (draft.seconds_per_pick > 0) {
        const {
          rows: [cfgRow],
        } = await client.query(`SELECT draft_config FROM league_settings WHERE league_id = $1`, [
          draft.league_id,
        ]);
        const parsed = draftConfigSchema.safeParse(cfgRow?.draft_config);
        const quiet = parsed.success ? quietWindowFrom(parsed.data) : null;
        nextDeadline = clockDeadline(new Date(), draft.seconds_per_pick, quiet);
      }
      await client.query(
        `UPDATE draft_picks SET clock_started_at = now(), deadline_at = $2 WHERE id = $1`,
        [next.id, nextDeadline],
      );
      await client.query(`UPDATE drafts SET current_pick_id = $2 WHERE id = $1`, [
        draftId,
        next.id,
      ]);
    } else {
      draftComplete = true;
      await client.query(
        `UPDATE drafts SET status = 'complete', completed_at = now(), current_pick_id = NULL
          WHERE id = $1`,
        [draftId],
      );
      await client.query(`UPDATE leagues SET status = 'in_season' WHERE id = $1`, [
        draft.league_id,
      ]);
    }

    await client.query("COMMIT");

    // Fire-and-forget: tell the next manager they're on the clock.
    if (next) {
      try {
        const {
          rows: [info],
        } = await client.query(
          `SELECT t.id AS team_id, l.slug
             FROM draft_picks p
             JOIN teams t ON t.id = p.team_id
             JOIN leagues l ON l.id = $2
            WHERE p.id = $1`,
          [next.id, draft.league_id],
        );
        if (info) {
          const { notifyTeamOwner } = await import("@/lib/notifications/service");
          const base = process.env.AUTH_URL ?? "http://localhost:3000";
          await notifyTeamOwner(info.team_id, draft.league_id, {
            type: "your_turn",
            title: "You're on the clock!",
            body: `Your draft pick is up — make it at ${base}/leagues/${info.slug}/draft`,
          });
        }
      } catch (err) {
        console.error("[draft] your-turn notify failed:", err);
      }
    }

    return { error: null, draftComplete };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Prior-season points under a rule set (draft rankings)
// ---------------------------------------------------------------------------

/** Prior-season production per player under `rules`: total points and games
 *  played (weeks with a stat line). Cached ~10 min — the draft room polls every
 *  12s and re-scoring a full season's stat lines (~7k rows) on every refresh
 *  would be wasteful. Keyed by season + the rules JSON, so a scoring change
 *  naturally invalidates. */
export interface SeasonLine {
  points: number;
  games: number;
}

const seasonPtsCache = new Map<string, { at: number; map: Map<string, SeasonLine> }>();
const SEASON_PTS_TTL_MS = 10 * 60 * 1000;
/** Past seasons are immutable after the Thursday lock, but re-pulling a full
 *  season of stat lines is the app's single biggest DB egress (it exhausted
 *  the Neon transfer quota on 2026-09-04) — cache them for a day. */
const PAST_SEASON_TTL_MS = 24 * 60 * 60 * 1000;

export async function seasonPointsByPlayer(
  season: number,
  rules: ScoringRules,
): Promise<Map<string, SeasonLine>> {
  const key = `${season}:${JSON.stringify(rules)}`;
  const hit = seasonPtsCache.get(key);
  const ttl = season < new Date().getFullYear() ? PAST_SEASON_TTL_MS : SEASON_PTS_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.map;

  const rows = await db
    .select({ stat: playerWeekStats, position: players.position })
    .from(playerWeekStats)
    .innerJoin(players, eq(playerWeekStats.gsisId, players.gsisId))
    .where(and(eq(playerWeekStats.season, season), eq(playerWeekStats.seasonType, "REG")));
  const map = new Map<string, SeasonLine>();
  for (const r of rows) {
    const { points } = scoreStatLine(statRowToLine(r.stat), rules, {
      isTightEnd: r.position === "TE",
      position: r.position,
    });
    const cur = map.get(r.stat.gsisId) ?? { points: 0, games: 0 };
    cur.points += points;
    cur.games += 1;
    map.set(r.stat.gsisId, cur);
  }
  seasonPtsCache.set(key, { at: Date.now(), map });
  return map;
}

async function leagueScoringRules(leagueId: number): Promise<ScoringRules | null> {
  const [row] = await db
    .select({ scoringRules: leagueSettings.scoringRules })
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  return row?.scoringRules ?? null;
}

// ---------------------------------------------------------------------------
// Autopick (worker)
// ---------------------------------------------------------------------------

/** Positional cap for autopick: dedicated starters + flex share + a small
 *  bench allowance. Autopick never drafts past the cap (humans still can) —
 *  on the house template: QB 2, RB 5, WR 5, TE 2, COACH 1 (a backup TE or
 *  COACH is dead weight; only 32 coaches exist). */
function autopickCap(position: string, template: RosterTemplate): number {
  const dedicated = template.slots
    .filter((s) => s.slot === position)
    .reduce((n, s) => n + s.count, 0);
  const flexEligible = (SLOT_ELIGIBILITY.FLEX as readonly string[]).includes(position);
  const flexCount = template.slots
    .filter((s) => s.slot === "FLEX")
    .reduce((n, s) => n + s.count, 0);
  if (position === "COACH") return Math.max(1, dedicated);
  if (position === "QB" || position === "TE") return dedicated + 1;
  return dedicated + (flexEligible ? flexCount : 0) + 2;
}

/** Best available: queue first (rank order); else best remaining by a blend of
 *  the owner's draft guide board (65%, ships as guide-ranks.json — also gives
 *  rookies a real rank) and last-season production under the league's rules
 *  (35%), constrained by positional caps and a guarantee that the last picks
 *  fill any empty dedicated starter slots. */
export async function chooseAutopick(
  draftId: number,
  leagueId: number,
  teamId: number,
  season: number,
): Promise<string | null> {
  // 1) the team's queue, top-ranked available player
  const queued = await db
    .select({ gsisId: draftQueue.gsisId })
    .from(draftQueue)
    .where(and(eq(draftQueue.draftId, draftId), eq(draftQueue.teamId, teamId)))
    .orderBy(asc(draftQueue.rank));
  for (const q of queued) {
    const [taken] = await db
      .select({ id: rosterEntries.id })
      .from(rosterEntries)
      .where(
        and(
          eq(rosterEntries.leagueId, leagueId),
          eq(rosterEntries.gsisId, q.gsisId),
          isNull(rosterEntries.droppedAt),
        ),
      )
      .limit(1);
    if (!taken) return q.gsisId;
  }

  // 2) best available, needs-aware.
  const { rows } = await pool.query(
    `SELECT p.gsis_id, p.position
       FROM players p
      WHERE p.position IN ('QB','RB','WR','TE','COACH')
        AND NOT EXISTS (
          SELECT 1 FROM roster_entries r
           WHERE r.league_id = $1 AND r.gsis_id = p.gsis_id AND r.dropped_at IS NULL
        )`,
    [leagueId],
  );
  if (rows.length === 0) return null;
  const rules = await leagueScoringRules(leagueId);
  if (!rules) return rows[0].gsis_id;

  // The team's roster so far (by position) and its remaining pick count.
  const rosterRows = await db
    .select({ position: players.position })
    .from(rosterEntries)
    .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
    .where(and(eq(rosterEntries.teamId, teamId), isNull(rosterEntries.droppedAt)));
  const have = new Map<string, number>();
  for (const r of rosterRows) have.set(r.position, (have.get(r.position) ?? 0) + 1);
  const [{ remaining }] = (
    await pool.query(
      `SELECT COUNT(*)::int AS remaining FROM draft_picks
        WHERE draft_id = $1 AND team_id = $2 AND picked_at IS NULL`,
      [draftId, teamId],
    )
  ).rows as { remaining: number }[];

  const [settingsRow] = await db
    .select({ rosterTemplate: leagueSettings.rosterTemplate })
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  const template = settingsRow?.rosterTemplate ?? null;

  // Empty dedicated starter slots this team still has to fill; when the picks
  // left are only just enough, restrict to those positions (never finish the
  // draft without, say, a COACH).
  const mustFill = new Set<string>();
  let unfilled = 0;
  if (template) {
    for (const pos of ["QB", "RB", "WR", "TE", "COACH"]) {
      const dedicated = template.slots
        .filter((s) => s.slot === pos)
        .reduce((n, s) => n + s.count, 0);
      const need = Math.max(0, dedicated - (have.get(pos) ?? 0));
      if (need > 0) mustFill.add(pos);
      unfilled += need;
    }
  }
  const restrictToNeeds = template !== null && remaining <= unfilled;

  const allowed = (position: string): boolean => {
    if (!template) return true;
    if (restrictToNeeds) return mustFill.has(position);
    return (have.get(position) ?? 0) < autopickCap(position, template);
  };

  // Rank blend: the draft guide board leads, last-season points sanity-check it.
  const pts = await seasonPointsByPlayer(season - 1, rules);
  const byPts = [...rows].sort(
    (a, b) => (pts.get(b.gsis_id)?.points ?? -Infinity) - (pts.get(a.gsis_id)?.points ?? -Infinity),
  );
  const seasonRank = new Map(byPts.map((r, i) => [r.gsis_id, i + 1]));
  const ranks = guideRanks as Record<string, number>;
  const UNRANKED = 300;
  const blended = (id: string): number =>
    0.65 * (ranks[id] ?? UNRANKED) + 0.35 * (seasonRank.get(id) ?? UNRANKED);

  const pickFrom = (candidates: typeof rows): string | null => {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const r of candidates) {
      const v = blended(r.gsis_id);
      if (v < bestScore) {
        best = r.gsis_id;
        bestScore = v;
      }
    }
    return best;
  };

  // Constrained first; if the caps somehow exclude everyone, pick unconstrained
  // rather than stall the draft.
  return pickFrom(rows.filter((r) => allowed(r.position))) ?? pickFrom(rows) ?? rows[0].gsis_id;
}

/** Worker scan: autopick every expired current pick. Returns picks made. */
export async function advanceExpiredDrafts(): Promise<number> {
  // Find in-progress drafts whose current pick is past deadline. SKIP LOCKED:
  // if a human pick is mid-transaction on that draft row, skip this tick.
  const { rows } = await pool.query(
    `SELECT d.id AS draft_id, d.league_id, l.season, p.id AS pick_id, p.team_id
       FROM drafts d
       JOIN leagues l ON l.id = d.league_id
       JOIN draft_picks p ON p.id = d.current_pick_id
      WHERE d.status = 'in_progress'
        AND p.picked_at IS NULL
        AND p.deadline_at IS NOT NULL
        AND p.deadline_at <= now()
      FOR UPDATE OF d SKIP LOCKED`,
  );

  let made = 0;
  for (const r of rows) {
    const gsisId = await chooseAutopick(r.draft_id, r.league_id, r.team_id, r.season);
    if (!gsisId) {
      console.error(`[draft] no available player for autopick (draft ${r.draft_id})`);
      continue;
    }
    const result = await makePick({
      draftId: r.draft_id,
      gsisId,
      byUserId: null,
      force: true,
      isAutopick: true,
    });
    if (result.error) console.error(`[draft] autopick failed: ${result.error}`);
    else made++;
  }
  return made;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface AvailablePlayer {
  gsisId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  /** Prior-season total under the league's rules (null = no stat lines). */
  lastSeasonPts: number | null;
  /** Prior-season games played (weeks with a stat line). */
  games: number;
  /** Prior-season points per game. */
  ppg: number | null;
  /** Rank at this position among everyone still available, by the active sort. */
  posRank: number;
}

/** Undrafted/unrostered offensive players with their prior-season production
 *  under this league's own scoring rules. Ranked by season total (default) or
 *  per-game; position ranks are computed over the whole available pool so they
 *  stay meaningful while searching/filtering. */
export async function listAvailable(
  leagueId: number,
  season: number,
  opts: { q?: string; pos?: string; limit?: number; sort?: "pts" | "ppg" } = {},
): Promise<AvailablePlayer[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const { rows } = await pool.query(
    `SELECT p.gsis_id, p.display_name, p.position, p.nfl_team
       FROM players p
      WHERE p.position IN ('QB','RB','WR','TE','COACH')
        AND NOT EXISTS (
          SELECT 1 FROM roster_entries r
           WHERE r.league_id = $1 AND r.gsis_id = p.gsis_id AND r.dropped_at IS NULL
        )`,
    [leagueId],
  );

  const rules = await leagueScoringRules(leagueId);
  const pts = rules
    ? await seasonPointsByPlayer(season - 1, rules)
    : new Map<string, SeasonLine>();

  const all = rows.map((r) => {
    const line = pts.get(r.gsis_id);
    return {
      gsisId: r.gsis_id as string,
      name: r.display_name as string,
      position: r.position as string,
      nflTeam: r.nfl_team as string | null,
      lastSeasonPts: line ? Math.round(line.points * 10) / 10 : null,
      games: line?.games ?? 0,
      ppg: line && line.games > 0 ? Math.round((line.points / line.games) * 10) / 10 : null,
      posRank: 0,
    };
  });

  const key = (p: AvailablePlayer) =>
    (opts.sort === "ppg" ? p.ppg : p.lastSeasonPts) ?? -Infinity;
  all.sort((a, b) => key(b) - key(a));

  // Position ranks over the full available pool, before search/limit.
  const seen = new Map<string, number>();
  for (const p of all) {
    const rank = (seen.get(p.position) ?? 0) + 1;
    seen.set(p.position, rank);
    p.posRank = rank;
  }

  const q = opts.q?.trim().toLowerCase();
  return all
    .filter(
      (p) =>
        (!opts.pos || opts.pos === "ALL" || p.position === opts.pos) &&
        (!q || p.name.toLowerCase().includes(q)),
    )
    .slice(0, limit);
}

export async function getDraft(leagueId: number): Promise<Draft | null> {
  const [d] = await db.select().from(drafts).where(eq(drafts.leagueId, leagueId)).limit(1);
  return d ?? null;
}

export async function getDraftBoard(draftId: number) {
  return db
    .select({
      id: draftPicks.id,
      overallPick: draftPicks.overallPick,
      round: draftPicks.round,
      pickInRound: draftPicks.pickInRound,
      teamId: draftPicks.teamId,
      gsisId: draftPicks.gsisId,
      pickedAt: draftPicks.pickedAt,
      isAutopick: draftPicks.isAutopick,
      deadlineAt: draftPicks.deadlineAt,
    })
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draftId))
    .orderBy(asc(draftPicks.overallPick));
}

/** Pause/resume: clears or restarts the current pick clock. */
export async function setDraftPaused(draftId: number, paused: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    const [d] = await tx.select().from(drafts).where(eq(drafts.id, draftId)).limit(1);
    if (!d) return;
    if (paused && d.status === "in_progress") {
      await tx.update(drafts).set({ status: "paused", pausedAt: new Date() }).where(eq(drafts.id, draftId));
      if (d.currentPickId) {
        await tx
          .update(draftPicks)
          .set({ deadlineAt: null })
          .where(eq(draftPicks.id, d.currentPickId));
      }
    } else if (!paused && d.status === "paused") {
      await tx
        .update(drafts)
        .set({ status: "in_progress", pausedAt: null })
        .where(eq(drafts.id, draftId));
      if (d.currentPickId) {
        const quiet = d.secondsPerPick > 0 ? await leagueQuietWindow(d.leagueId) : null;
        await tx
          .update(draftPicks)
          .set({
            clockStartedAt: new Date(),
            deadlineAt:
              d.secondsPerPick > 0
                ? clockDeadline(new Date(), d.secondsPerPick, quiet)
                : null,
          })
          .where(eq(draftPicks.id, d.currentPickId));
      }
    }
  });
}
