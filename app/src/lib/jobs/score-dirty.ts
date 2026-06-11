/**
 * Bridge from the pipeline to the job queue: the local pipeline writes a
 * score_dirty row per changed (season, seasonType, week) slice; the worker
 * polls here and fans out score_week jobs. Marking processed first is safe —
 * scoring is a recompute, and the next push re-dirties the slice on any change.
 */

import { pool } from "@/lib/db";
import { enqueue } from "@/lib/jobs/queue";

export async function pollScoreDirty(): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE score_dirty
        SET processed_at = now()
      WHERE processed_at IS NULL
      RETURNING season, season_type, week`,
  );
  for (const r of rows) {
    await enqueue("score_week", {
      season: r.season,
      seasonType: r.season_type,
      week: r.week,
    });
  }
  return rows.length;
}
