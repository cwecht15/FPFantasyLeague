/**
 * Background worker entrypoint (Fly `worker` process group; `npm run worker`
 * locally). A simple tick loop that claims due jobs from the Postgres `jobs`
 * table and runs their handlers. No Redis/queue infra — the DB is the queue.
 *
 * Built to a self-contained bundle via `npm run build:worker` (dist/worker.js).
 */

import "@/lib/db/load-env";
import { claimJobs, completeJob, failJob, type ClaimedJob } from "@/lib/jobs/queue";
import { pollScoreDirty } from "@/lib/jobs/score-dirty";
import { advanceExpiredDrafts } from "@/lib/draft/service";
import { processDueWaivers } from "@/lib/transactions/waivers";
import { runJob } from "./handlers";
import "./handlers/scoring"; // registers score_week + rollup_matchups

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 5000);
const BATCH = Number(process.env.WORKER_BATCH ?? 10);
const WORKER_ID = `${process.pid}@${process.env.FLY_MACHINE_ID ?? "local"}`;

let shuttingDown = false;

async function processOne(job: ClaimedJob): Promise<void> {
  try {
    await runJob(job);
    await completeJob(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.id} (${job.type}) failed: ${msg}`);
    await failJob(job.id, job.attempts, msg);
  }
}

async function tick(): Promise<void> {
  const dirtied = await pollScoreDirty();
  if (dirtied > 0) console.log(`[worker] score_dirty: enqueued ${dirtied} score_week job(s)`);
  const autopicks = await advanceExpiredDrafts();
  if (autopicks > 0) console.log(`[worker] draft clock: ${autopicks} autopick(s)`);
  const waivers = await processDueWaivers();
  if (waivers > 0) console.log(`[worker] waivers: processed ${waivers} claim(s)`);
  const jobs = await claimJobs(BATCH, WORKER_ID);
  if (jobs.length === 0) return;
  console.log(`[worker] claimed ${jobs.length} job(s)`);
  // Run the batch concurrently — handlers guard their own row-level locks.
  await Promise.all(jobs.map(processOne));
}

async function loop(): Promise<void> {
  console.log(`[worker] started (${WORKER_ID}); tick=${TICK_MS}ms batch=${BATCH}`);
  while (!shuttingDown) {
    try {
      await tick();
    } catch (err) {
      console.error("[worker] tick error:", err);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  console.log("[worker] stopped");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received — finishing current tick then exiting`);
    shuttingDown = true;
  });
}

void loop();
