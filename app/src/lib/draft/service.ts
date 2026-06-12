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
  rosterEntries,
  teams,
  transactions,
} from "@/lib/db/schema";
import type { DraftConfig } from "@/lib/leagues/settings";

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
    const deadline = new Date(now.getTime() + config.secondsPerPick * 1000);
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
      await client.query(
        `UPDATE draft_picks
            SET clock_started_at = now(),
                deadline_at = now() + ($2 || ' seconds')::interval
          WHERE id = $1`,
        [next.id, draft.seconds_per_pick],
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
          await notifyTeamOwner(info.team_id, draft.league_id, {
            type: "your_turn",
            title: "You're on the clock!",
            body: `Your draft pick is up — make it at /leagues/${info.slug}/draft`,
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
// Autopick (worker)
// ---------------------------------------------------------------------------

/** Best available: queue first (rank order), else last-season production. */
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

  // 2) best available by last season's raw production (offense only).
  const { rows } = await pool.query(
    `SELECT p.gsis_id
       FROM players p
       LEFT JOIN (
         SELECT gsis_id,
                SUM(pass_yds / 25.0 + pass_td * 4 + rush_yds / 10.0 + rush_td * 6
                    + receptions + rec_yds / 10.0 + rec_td * 6 - pass_int - fumbles_lost) AS pts
           FROM player_week_stats
          WHERE season = $2 AND season_type = 'REG'
          GROUP BY gsis_id
       ) s ON s.gsis_id = p.gsis_id
      WHERE p.position IN ('QB','RB','WR','TE','COACH')
        AND NOT EXISTS (
          SELECT 1 FROM roster_entries r
           WHERE r.league_id = $1 AND r.gsis_id = p.gsis_id AND r.dropped_at IS NULL
        )
      ORDER BY s.pts DESC NULLS LAST
      LIMIT 1`,
    [leagueId, season - 1],
  );
  return rows[0]?.gsis_id ?? null;
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
  lastSeasonPts: number | null;
}

/** Undrafted/unrostered offensive players, ranked by last-season production. */
export async function listAvailable(
  leagueId: number,
  season: number,
  opts: { q?: string; pos?: string; limit?: number } = {},
): Promise<AvailablePlayer[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  const params: unknown[] = [leagueId, season - 1];
  let filter = "";
  if (opts.pos && opts.pos !== "ALL") {
    params.push(opts.pos);
    filter += ` AND p.position = $${params.length}`;
  }
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim()}%`);
    filter += ` AND p.display_name ILIKE $${params.length}`;
  }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT p.gsis_id, p.display_name, p.position, p.nfl_team, ROUND(s.pts::numeric, 1) AS pts
       FROM players p
       LEFT JOIN (
         SELECT gsis_id,
                SUM(pass_yds / 25.0 + pass_td * 4 + rush_yds / 10.0 + rush_td * 6
                    + receptions + rec_yds / 10.0 + rec_td * 6 - pass_int - fumbles_lost) AS pts
           FROM player_week_stats
          WHERE season = $2 AND season_type = 'REG'
          GROUP BY gsis_id
       ) s ON s.gsis_id = p.gsis_id
      WHERE p.position IN ('QB','RB','WR','TE','COACH')
        AND NOT EXISTS (
          SELECT 1 FROM roster_entries r
           WHERE r.league_id = $1 AND r.gsis_id = p.gsis_id AND r.dropped_at IS NULL
        )${filter}
      ORDER BY s.pts DESC NULLS LAST
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    gsisId: r.gsis_id,
    name: r.display_name,
    position: r.position,
    nflTeam: r.nfl_team,
    lastSeasonPts: r.pts === null ? null : Number(r.pts),
  }));
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
        await tx
          .update(draftPicks)
          .set({
            clockStartedAt: new Date(),
            deadlineAt: sql`now() + (${d.secondsPerPick} || ' seconds')::interval`,
          })
          .where(eq(draftPicks.id, d.currentPickId));
      }
    }
  });
}
