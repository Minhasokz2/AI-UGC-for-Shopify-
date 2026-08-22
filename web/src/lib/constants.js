export const TERMINAL_JOB_STATUSES = ['succeeded', 'failed', 'cancelled'];
export const TERMINAL_BATCH_STATUS = 'complete';

export const LOW_CREDITS_THRESHOLD = 5;
export const LOW_CREDITS_REARM_MULTIPLIER = 2;

export const GOOGLE_AUTH_MESSAGE_SOURCE = 'motionart-google-auth';

export function isJobTerminal(status) {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export function isBatchTerminal(status) {
  return status === TERMINAL_BATCH_STATUS;
}
