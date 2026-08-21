const { createFakeFirestore, FieldValue } = require('../../helpers/fakeFirestore');
const { createGoogleAuthStatesRepo } = require('../../../src/repos/googleAuthStatesRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createGoogleAuthStatesRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/googleAuthStatesRepo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createState / consumeState', () => {
    it('create then consume returns the shopDomain and the doc is gone afterward', async () => {
      const { db, repo } = makeRepo();
      await repo.createState('state-1', { shopDomain: 'shop-a' });

      const result = await repo.consumeState('state-1');

      expect(result).toEqual({ shopDomain: 'shop-a' });
      const stored = await db.collection('google_auth_states').doc('state-1').get();
      expect(stored.exists).toBe(false);
    });

    it('consuming the same state twice returns undefined the second time', async () => {
      const { repo } = makeRepo();
      await repo.createState('state-1', { shopDomain: 'shop-a' });

      await repo.consumeState('state-1');
      const second = await repo.consumeState('state-1');

      expect(second).toBeUndefined();
    });

    it('consuming a nonexistent state returns undefined', async () => {
      const { repo } = makeRepo();
      expect(await repo.consumeState('never-existed')).toBeUndefined();
    });

    it('consuming an expired state returns undefined (and still deletes it)', async () => {
      vi.useFakeTimers();
      const { db, repo } = makeRepo();
      await repo.createState('state-1', { shopDomain: 'shop-a' });

      vi.advanceTimersByTime(10 * 60 * 1000 + 1); // just past the default 10-minute TTL

      const result = await repo.consumeState('state-1');

      expect(result).toBeUndefined();
      const stored = await db.collection('google_auth_states').doc('state-1').get();
      expect(stored.exists).toBe(false);
    });

    it('respects a custom maxAgeMs', async () => {
      vi.useFakeTimers();
      const { repo } = makeRepo();
      await repo.createState('state-1', { shopDomain: 'shop-a' });

      vi.advanceTimersByTime(5_000);

      const result = await repo.consumeState('state-1', { maxAgeMs: 1_000 });

      expect(result).toBeUndefined();
    });

    it('a state consumed within maxAgeMs is still valid', async () => {
      vi.useFakeTimers();
      const { repo } = makeRepo();
      await repo.createState('state-1', { shopDomain: 'shop-a' });

      vi.advanceTimersByTime(9 * 60 * 1000); // 9 minutes — still within the default 10-minute TTL

      const result = await repo.consumeState('state-1');

      expect(result).toEqual({ shopDomain: 'shop-a' });
    });
  });
});
