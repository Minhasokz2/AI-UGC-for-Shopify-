import { isJobTerminal, isBatchTerminal } from './constants.js';

const JOB_FAST_INTERVAL_MS = 3000;
const JOB_SLOW_INTERVAL_MS = 15000;
const JOB_BACKOFF_AFTER_MS = 5 * 60 * 1000; // 5 minutes

const BATCH_INTERVAL_MS = 2000;
const JOB_LIST_INTERVAL_MS = 4000;

/**
 * Pure decision function for the ['job', jobId] query's refetchInterval.
 * Injected `now` for testability — never call Date.now() inside this.
 *
 * @param {{ status: string, createdAt: string | number | Date } | null | undefined} job
 * @param {number} now - epoch ms
 * @returns {number | false}
 */
export function getJobRefetchInterval(job, now) {
  if (!job) return JOB_FAST_INTERVAL_MS;
  if (isJobTerminal(job.status)) return false;

  const createdAtMs = new Date(job.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return JOB_FAST_INTERVAL_MS;

  const elapsed = now - createdAtMs;
  return elapsed > JOB_BACKOFF_AFTER_MS ? JOB_SLOW_INTERVAL_MS : JOB_FAST_INTERVAL_MS;
}

/**
 * @param {{ status: string } | null | undefined} batch
 * @returns {number | false}
 */
export function getBatchRefetchInterval(batch) {
  if (!batch) return BATCH_INTERVAL_MS;
  return isBatchTerminal(batch.status) ? false : BATCH_INTERVAL_MS;
}

/**
 * @param {Array<{ status: string }>} jobs
 * @returns {number | false}
 */
export function getJobListRefetchInterval(jobs) {
  if (!jobs || jobs.length === 0) return false;
  const anyInFlight = jobs.some((job) => !isJobTerminal(job.status));
  return anyInFlight ? JOB_LIST_INTERVAL_MS : false;
}
