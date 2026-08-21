const { env } = require('./env');

// Job lifecycle
const JOB_TERMINAL_STATUSES = Object.freeze(['succeeded', 'failed', 'cancelled']);
const BATCH_TERMINAL_STATUSES = Object.freeze(['complete']);
const JOB_LEASE_TIMEOUT_MS = env.JOB_LEASE_TIMEOUT_MS;
const IDEMPOTENCY_CLAIM_STALE_MS = 30_000;

// Worker concurrency (in-process, no Redis/BullMQ — see workers/jobWorker.js)
const JOB_WORKER_PER_SHOP_CONCURRENCY = env.JOB_WORKER_PER_SHOP_CONCURRENCY;
const JOB_WORKER_GLOBAL_CONCURRENCY = env.JOB_WORKER_GLOBAL_CONCURRENCY;

// HTTP burst guard — a general safety net, distinct from the per-shop concurrent-job
// admission control enforced in the job-creation route itself.
const RATE_LIMIT_PER_SHOP_PER_MIN = env.RATE_LIMIT_PER_SHOP_PER_MIN;

// Image Optimizer add-on
const IMAGE_OPTIMIZER_FREE_DAILY_QUOTA = env.IMAGE_OPTIMIZER_FREE_DAILY_QUOTA;

// Firestore query helper
const JOBS_QUERY_CANDIDATE_WINDOW_MIN = 200;
const JOBS_QUERY_CANDIDATE_WINDOW_MULTIPLIER = 4;

// Trial credits
const FREE_TRIAL_CREDITS = 10;

module.exports = {
  JOB_TERMINAL_STATUSES,
  BATCH_TERMINAL_STATUSES,
  JOB_LEASE_TIMEOUT_MS,
  IDEMPOTENCY_CLAIM_STALE_MS,
  JOB_WORKER_PER_SHOP_CONCURRENCY,
  JOB_WORKER_GLOBAL_CONCURRENCY,
  RATE_LIMIT_PER_SHOP_PER_MIN,
  IMAGE_OPTIMIZER_FREE_DAILY_QUOTA,
  JOBS_QUERY_CANDIDATE_WINDOW_MIN,
  JOBS_QUERY_CANDIDATE_WINDOW_MULTIPLIER,
  FREE_TRIAL_CREDITS,
};
