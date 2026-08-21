const { pickPushedFilter, computeCandidateWindow } = require('../../../src/repos/queryHelpers');

const PRIORITY = ['status', 'batchId', 'contentType'];

describe('repos/queryHelpers', () => {
  describe('pickPushedFilter', () => {
    it('returns no pushed field and no in-memory fields when nothing is requested', () => {
      expect(pickPushedFilter({}, PRIORITY)).toEqual({ pushedField: null, inMemoryFields: [] });
    });

    it('pushes the single requested field to Firestore', () => {
      expect(pickPushedFilter({ status: 'pending' }, PRIORITY)).toEqual({ pushedField: 'status', inMemoryFields: [] });
    });

    it('picks the highest-priority field when two are requested, filtering the other in memory', () => {
      expect(pickPushedFilter({ status: 'pending', contentType: 'scene' }, PRIORITY)).toEqual({
        pushedField: 'status',
        inMemoryFields: ['contentType'],
      });
    });

    it('never pushes more than one field even when all three are requested', () => {
      const result = pickPushedFilter({ status: 'pending', batchId: 'b1', contentType: 'scene' }, PRIORITY);
      expect(result.pushedField).toBe('status');
      expect(result.inMemoryFields.sort()).toEqual(['batchId', 'contentType']);
    });

    it('respects priority order regardless of key order in the input', () => {
      expect(pickPushedFilter({ contentType: 'scene', batchId: 'b1' }, PRIORITY)).toEqual({
        pushedField: 'batchId',
        inMemoryFields: ['contentType'],
      });
    });

    it('treats null the same as undefined (not requested)', () => {
      expect(pickPushedFilter({ status: null, contentType: 'scene' }, PRIORITY)).toEqual({
        pushedField: 'contentType',
        inMemoryFields: [],
      });
    });
  });

  describe('computeCandidateWindow', () => {
    it('uses the multiplier when it exceeds the minimum', () => {
      expect(computeCandidateWindow(100, 200, 4)).toBe(400);
    });

    it('falls back to the minimum for small limits', () => {
      expect(computeCandidateWindow(5, 200, 4)).toBe(200);
    });
  });
});
