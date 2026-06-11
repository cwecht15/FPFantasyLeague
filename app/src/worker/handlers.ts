/**
 * Job handler registry. One function per job `type`. Phase 1/2 register the
 * real handlers (score_week, rollup_matchups, draft_advance, process_waivers,
 * send_email); this module is the single place the worker dispatches through.
 */

import type { ClaimedJob } from "@/lib/jobs/queue";

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const registry: Record<string, JobHandler> = {};

export function registerHandler(type: string, fn: JobHandler): void {
  registry[type] = fn;
}

export async function runJob(job: ClaimedJob): Promise<void> {
  const handler = registry[job.type];
  if (!handler) {
    throw new Error(`No handler registered for job type "${job.type}"`);
  }
  await handler(job.payload ?? {});
}

// ---- handler registration (Phase 1/2 import their handlers here) ----
// import "./handlers/scoring"; // registers score_week + rollup_matchups
// import "./handlers/draft";   // registers draft_advance
// import "./handlers/waivers"; // registers process_waivers
// import "./handlers/email";   // registers send_email
