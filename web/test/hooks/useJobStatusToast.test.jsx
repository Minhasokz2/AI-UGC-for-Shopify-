import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useJobStatusToast, useJobListStatusToasts, evaluateJobTransition } from '../../src/hooks/useJobStatusToast.js';

const showMock = vi.fn();

vi.mock('@shopify/app-bridge-react', () => ({
  useAppBridge: () => ({ toast: { show: showMock } }),
}));

beforeEach(() => {
  showMock.mockClear();
});

describe('evaluateJobTransition (core bookkeeping)', () => {
  it('records but does not toast on first observation of a non-terminal job', () => {
    const map = new Map();
    const result = evaluateJobTransition(map, { id: 'j1', status: 'pending' });
    expect(result).toBeNull();
    expect(map.get('j1')).toBe(true);
  });

  it('records but does not toast on first observation of an already-terminal job', () => {
    const map = new Map();
    const result = evaluateJobTransition(map, { id: 'j1', status: 'succeeded' });
    expect(result).toBeNull();
    expect(map.get('j1')).toBe(false);
  });

  it('fires exactly once on a pending -> succeeded transition', () => {
    const map = new Map();
    evaluateJobTransition(map, { id: 'j1', status: 'pending' });
    const result = evaluateJobTransition(map, { id: 'j1', status: 'succeeded' });
    expect(result).toBe('succeeded');
    expect(map.get('j1')).toBe(false);
  });

  it('does not fire again on a later poll of the same terminal status', () => {
    const map = new Map();
    evaluateJobTransition(map, { id: 'j1', status: 'pending' });
    evaluateJobTransition(map, { id: 'j1', status: 'succeeded' });
    const result = evaluateJobTransition(map, { id: 'j1', status: 'succeeded' });
    expect(result).toBeNull();
  });

  it('fires a failure transition for pending -> failed', () => {
    const map = new Map();
    evaluateJobTransition(map, { id: 'j1', status: 'pending' });
    const result = evaluateJobTransition(map, { id: 'j1', status: 'failed' });
    expect(result).toBe('failed');
  });
});

describe('useJobStatusToast (renderHook, manual rerenders)', () => {
  it('mount-on-terminal-job: no toast', () => {
    const { rerender } = renderHook(({ job }) => useJobStatusToast(job), {
      initialProps: { job: { id: 'j1', status: 'succeeded', contentType: 'scene' } },
    });
    rerender({ job: { id: 'j1', status: 'succeeded', contentType: 'scene' } });
    expect(showMock).not.toHaveBeenCalled();
  });

  it('pending -> succeeded: exactly one toast', () => {
    const { rerender } = renderHook(({ job }) => useJobStatusToast(job), {
      initialProps: { job: { id: 'j1', status: 'pending', contentType: 'scene' } },
    });
    expect(showMock).not.toHaveBeenCalled();

    rerender({ job: { id: 'j1', status: 'processing', contentType: 'scene' } });
    expect(showMock).not.toHaveBeenCalled();

    rerender({ job: { id: 'j1', status: 'succeeded', contentType: 'scene' } });
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ isError: false }));
  });

  it('succeeded (already fired) -> still succeeded on a later poll: no second toast', () => {
    const { rerender } = renderHook(({ job }) => useJobStatusToast(job), {
      initialProps: { job: { id: 'j1', status: 'pending', contentType: 'scene' } },
    });
    rerender({ job: { id: 'j1', status: 'succeeded', contentType: 'scene' } });
    expect(showMock).toHaveBeenCalledTimes(1);

    rerender({ job: { id: 'j1', status: 'succeeded', contentType: 'scene' } });
    expect(showMock).toHaveBeenCalledTimes(1);
  });

  it('pending -> failed: one failure-flavored toast', () => {
    const { rerender } = renderHook(({ job }) => useJobStatusToast(job), {
      initialProps: { job: { id: 'j1', status: 'pending', contentType: 'ugc' } },
    });
    rerender({ job: { id: 'j1', status: 'failed', contentType: 'ugc' } });
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ isError: true }));
  });

  it('handles an initially-undefined job that later appears and transitions', () => {
    const { rerender } = renderHook(({ job }) => useJobStatusToast(job), {
      initialProps: { job: undefined },
    });
    expect(showMock).not.toHaveBeenCalled();

    rerender({ job: { id: 'j1', status: 'pending', contentType: 'scene' } });
    expect(showMock).not.toHaveBeenCalled();

    rerender({ job: { id: 'j1', status: 'succeeded', contentType: 'scene' } });
    expect(showMock).toHaveBeenCalledTimes(1);
  });
});

describe('useJobListStatusToasts (list variant, independent per job)', () => {
  it('fires independently for each job in the list', () => {
    const { rerender } = renderHook(({ jobs }) => useJobListStatusToasts(jobs), {
      initialProps: {
        jobs: [
          { id: 'a', status: 'pending', contentType: 'scene' },
          { id: 'b', status: 'succeeded', contentType: 'ugc' }, // already terminal on mount -> no toast
        ],
      },
    });
    expect(showMock).not.toHaveBeenCalled();

    rerender({
      jobs: [
        { id: 'a', status: 'succeeded', contentType: 'scene' }, // transitions -> toast
        { id: 'b', status: 'succeeded', contentType: 'ugc' }, // unchanged terminal -> no toast
      ],
    });
    expect(showMock).toHaveBeenCalledTimes(1);

    rerender({
      jobs: [
        { id: 'a', status: 'succeeded', contentType: 'scene' },
        { id: 'b', status: 'succeeded', contentType: 'ugc' },
      ],
    });
    expect(showMock).toHaveBeenCalledTimes(1);
  });

  it('handles a second job added mid-flight without re-firing for the first', () => {
    const { rerender } = renderHook(({ jobs }) => useJobListStatusToasts(jobs), {
      initialProps: { jobs: [{ id: 'a', status: 'pending', contentType: 'scene' }] },
    });

    rerender({
      jobs: [
        { id: 'a', status: 'succeeded', contentType: 'scene' },
        { id: 'c', status: 'pending', contentType: 'video' },
      ],
    });
    expect(showMock).toHaveBeenCalledTimes(1);

    rerender({
      jobs: [
        { id: 'a', status: 'succeeded', contentType: 'scene' },
        { id: 'c', status: 'failed', contentType: 'video' },
      ],
    });
    expect(showMock).toHaveBeenCalledTimes(2);
  });
});
