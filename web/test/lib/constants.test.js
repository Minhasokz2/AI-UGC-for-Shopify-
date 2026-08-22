import { describe, it, expect } from 'vitest';
import { isJobTerminal, isBatchTerminal } from '../../src/lib/constants.js';

describe('isJobTerminal', () => {
  it('treats succeeded/failed/cancelled as terminal', () => {
    expect(isJobTerminal('succeeded')).toBe(true);
    expect(isJobTerminal('failed')).toBe(true);
    expect(isJobTerminal('cancelled')).toBe(true);
  });

  it('treats pending/processing as non-terminal', () => {
    expect(isJobTerminal('pending')).toBe(false);
    expect(isJobTerminal('processing')).toBe(false);
  });
});

describe('isBatchTerminal', () => {
  it('only "complete" is terminal for a batch — a different vocabulary than jobs', () => {
    expect(isBatchTerminal('complete')).toBe(true);
    expect(isBatchTerminal('succeeded')).toBe(false);
    expect(isBatchTerminal('pending')).toBe(false);
    expect(isBatchTerminal('processing')).toBe(false);
  });
});
