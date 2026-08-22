import { useEffect, useRef } from 'react';
import { useAppBridgeToast } from './useAppBridgeToast.js';
import { isJobTerminal } from '../lib/constants.js';

/**
 * Core bookkeeping shared by useJobStatusToast and useJobListStatusToasts.
 *
 * `map` is a Map<jobId, hasSeenInFlight> — mutated in place (it's meant to
 * back a useRef, not React state, so re-renders don't wipe history and
 * updating it doesn't itself trigger a render).
 *
 * On first observation of a job, we only record whether it's currently
 * non-terminal — we never toast on first sight, so mounting on an
 * already-succeeded job never toasts.
 *
 * A later transition to a terminal status *while hasSeenInFlight was true*
 * returns that terminal status (so the caller fires exactly one toast) and
 * flips the flag to false so it can never fire again for that job.
 *
 * @param {Map<string, boolean>} map
 * @param {{ id: string, status: string } | null | undefined} job
 * @returns {string | null} the terminal status to toast for, or null
 */
export function evaluateJobTransition(map, job) {
  if (!job || !job.id) return null;

  const nonTerminal = !isJobTerminal(job.status);
  const wasSeen = map.has(job.id);

  if (!wasSeen) {
    map.set(job.id, nonTerminal);
    return null;
  }

  const hasSeenInFlight = map.get(job.id);

  if (hasSeenInFlight && isJobTerminal(job.status)) {
    map.set(job.id, false);
    return job.status;
  }

  if (nonTerminal) {
    map.set(job.id, true);
  }

  return null;
}

function contentTypeLabel(contentType) {
  switch (contentType) {
    case 'scene':
      return 'Product scene';
    case 'ugc':
      return 'UGC image';
    case 'video':
      return 'Video';
    case 'tryOn':
      return 'Virtual try-on';
    case 'custom':
    default:
      return 'Generation';
  }
}

function successMessage(job) {
  return `${contentTypeLabel(job.contentType)} job is ready to review`;
}

function failureMessage(job) {
  if (job.status === 'cancelled') {
    return `${contentTypeLabel(job.contentType)} job was cancelled`;
  }
  return `${contentTypeLabel(job.contentType)} job failed`;
}

function fireToastForTerminalStatus(terminalStatus, job, { showSuccess, showError }) {
  if (terminalStatus === 'succeeded') {
    showSuccess(successMessage(job));
  } else if (terminalStatus === 'failed' || terminalStatus === 'cancelled') {
    showError(failureMessage(job));
  }
}

/**
 * Fires exactly one toast when a single job transitions from non-terminal
 * (pending/processing) to terminal (succeeded/failed/cancelled), and never
 * toasts on mount for a job that is already terminal.
 *
 * @param {{ id: string, status: string, contentType: string } | null | undefined} job
 */
export function useJobStatusToast(job) {
  const mapRef = useRef(new Map());
  const toast = useAppBridgeToast();

  useEffect(() => {
    const terminalStatus = evaluateJobTransition(mapRef.current, job);
    if (terminalStatus) {
      fireToastForTerminalStatus(terminalStatus, job, toast);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);
}

/**
 * List variant: backs a single shared Map across every job currently in
 * the list, so each job's transition fires independently and exactly once.
 *
 * @param {Array<{ id: string, status: string, contentType: string }>} jobs
 */
export function useJobListStatusToasts(jobs) {
  const mapRef = useRef(new Map());
  const toast = useAppBridgeToast();

  useEffect(() => {
    for (const job of jobs ?? []) {
      const terminalStatus = evaluateJobTransition(mapRef.current, job);
      if (terminalStatus) {
        fireToastForTerminalStatus(terminalStatus, job, toast);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);
}
