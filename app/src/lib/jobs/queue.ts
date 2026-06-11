/**
 * Durable job queue backed by the `jobs` Postgres table. Producers (Server
 * Actions, ingest routes, the pipeline signal) call `enqueue`. The worker
 * claims with `FOR UPDATE SKIP LOCKED` so multiple workers never double-run a
 * job, and a crash mid-job leaves it reclaimable after the lock is released.
 */

import { db, pool } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

export type JobType =
  | "draft_advance"
  | "score_week"
  | "rollup_matchups"
  | "process_waivers"
  | "send_email";

export const MAX_ATTEMPTS = 5;

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown> = {},
  opts: { runAfter?: Date } = {},
): Promise<void> {
  await db.insert(jobs).values({
    type,
    payload,
    runAfter: opts.runAfter ?? new Date(),
  });
}

export interface ClaimedJob {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
  attempts: number;
}

/** Atomically claim up to `limit` due jobs, marking them running. */
export async function claimJobs(limit: number, workerId: string): Promise<ClaimedJob[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, type, payload, attempts
         FROM jobs
        WHERE status = 'queued' AND run_after <= now()
        ORDER BY run_after
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit],
    );
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      await client.query(
        `UPDATE jobs
            SET status = 'running', locked_at = now(), locked_by = $2, attempts = attempts + 1
          WHERE id = ANY($1)`,
        [ids, workerId],
      );
    }
    await client.query("COMMIT");
    return rows as ClaimedJob[];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function completeJob(id: number): Promise<void> {
  await pool.query(`UPDATE jobs SET status = 'done', locked_at = NULL WHERE id = $1`, [id]);
}

/** On failure: re-queue with exponential backoff until MAX_ATTEMPTS, then mark failed. */
export async function failJob(id: number, attempts: number, error: string): Promise<void> {
  if (attempts >= MAX_ATTEMPTS) {
    await pool.query(
      `UPDATE jobs SET status = 'failed', last_error = $2, locked_at = NULL WHERE id = $1`,
      [id, error.slice(0, 2000)],
    );
    return;
  }
  const backoffSec = Math.min(300, 2 ** attempts * 5); // 5s,10s,20s,…capped 5m
  await pool.query(
    `UPDATE jobs
        SET status = 'queued', last_error = $2, locked_at = NULL,
            run_after = now() + ($3 || ' seconds')::interval
      WHERE id = $1`,
    [id, error.slice(0, 2000), backoffSec],
  );
}
