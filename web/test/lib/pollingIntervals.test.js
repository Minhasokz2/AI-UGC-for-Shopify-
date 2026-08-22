import { describe, it, expect } from 'vitest';
import {
  getJobRefetchInterval,
  getBatchRefetchInterval,
  getJobListRefetchInterval,
} from '../../src/lib/pollingIntervals.js';

const NOW = new Date('2026-08-22T12:00:00.000Z').getTime();

describe('getJobRefetchInterval', () => {
  it('polls every 3s while pending and freshly created', () => {
    const job = { status: 'pending', createdAt: new Date(NOW - 1000).toISOString() };
    expect(getJobRefetchInterval(job, NOW)).toBe(3000);
  });

  it('polls every 3s while processing and freshly created', () => {
    const job = { status: 'processing', createdAt: new Date(NOW - 1000).toISOString() };
    expect(getJobRefetchInterval(job, NOW)).toBe(3000);
  });

  it('backs off to 15s once non-terminal for more than 5 minutes', () => {
    const sixMinutesAgo = NOW - 6 * 60 * 1000;
    const job = { status: 'processing', createdAt: new Date(sixMinutesAgo).toISOString() };
    expect(getJobRefetchInterval(job, NOW)).toBe(15000);
  });

  it('does not back off at exactly 5 minutes (boundary is exclusive)', () => {
    const fiveMinutesAgo = NOW - 5 * 60 * 1000;
    const job = { status: 'processing', createdAt: new Date(fiveMinutesAgo).toISOString() };
    expect(getJobRefetchInterval(job, NOW)).toBe(3000);
  });

  it('stops polling once terminal (succeeded)', () => {
    const job = { status: 'succeeded', createdAt: new Date(NOW - 10 * 60 * 1000).toISOString() };
    expect(getJobRefetchInterval(job, NOW)).toBe(false);
  });

  it('stops polling once terminal (failed)', () => {
    const job = { status: 'failed', createdAt: new Date(NOW - 1000).toISOString() };
    expect(getJobRefetchInterval(job, NOW)).toBe(false);
  });

  it('stops polling once terminal (cancelled)', () => {
    const job = { status: 'cancelled', createdAt: new Date(NOW - 1000).toISOString() };
    expect(getJobRefetchInterval(job, NOW)).toBe(false);
  });

  it('defaults to the fast interval when there is no job yet', () => {
    expect(getJobRefetchInterval(undefined, NOW)).toBe(3000);
  });
});

describe('getBatchRefetchInterval', () => {
  it('polls every 2s until complete', () => {
    expect(getBatchRefetchInterval({ status: 'pending' })).toBe(2000);
    expect(getBatchRefetchInterval({ status: 'processing' })).toBe(2000);
  });

  it('stops once complete — a different vocabulary than job status', () => {
    expect(getBatchRefetchInterval({ status: 'complete' })).toBe(false);
  });

  it('does NOT treat batch "succeeded" as terminal (jobs and batches use different vocab)', () => {
    // Batches never actually report 'succeeded', but guard against
    // accidentally reusing the job terminal-status list for batches.
    expect(getBatchRefetchInterval({ status: 'succeeded' })).toBe(2000);
  });
});

describe('getJobListRefetchInterval', () => {
  it('polls every 4s while any job in the list is non-terminal', () => {
    const jobs = [{ status: 'succeeded' }, { status: 'processing' }];
    expect(getJobListRefetchInterval(jobs)).toBe(4000);
  });

  it('stops when every job is terminal', () => {
    const jobs = [{ status: 'succeeded' }, { status: 'failed' }, { status: 'cancelled' }];
    expect(getJobListRefetchInterval(jobs)).toBe(false);
  });

  it('stops for an empty list', () => {
    expect(getJobListRefetchInterval([])).toBe(false);
    expect(getJobListRefetchInterval(undefined)).toBe(false);
  });
});
