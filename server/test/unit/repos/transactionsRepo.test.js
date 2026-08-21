const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createTransactionsRepo } = require('../../../src/repos/transactionsRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createTransactionsRepo({ db, FieldValue });
  return { db, repo };
}

async function seedTransaction(db, id, data) {
  await db.collection('transactions').doc(id).set(data);
}

describe('repos/transactionsRepo', () => {
  describe('queryByShop', () => {
    it('returns only the requesting shop\'s transactions, most recent first', async () => {
      const { db, repo } = makeRepo();
      await seedTransaction(db, 't1', { shopDomain: 'shop-a', amount: 1, createdAt: FakeTimestamp.fromMillis(1) });
      await seedTransaction(db, 't2', { shopDomain: 'shop-a', amount: 2, createdAt: FakeTimestamp.fromMillis(3) });
      await seedTransaction(db, 't3', { shopDomain: 'shop-a', amount: 3, createdAt: FakeTimestamp.fromMillis(2) });
      await seedTransaction(db, 't4', { shopDomain: 'shop-b', amount: 99, createdAt: FakeTimestamp.fromMillis(4) });

      const results = await repo.queryByShop({ shopDomain: 'shop-a' });

      expect(results.map((r) => r.id)).toEqual(['t2', 't3', 't1']);
    });

    it('respects the limit', async () => {
      const { db, repo } = makeRepo();
      await seedTransaction(db, 't1', { shopDomain: 'shop-a', createdAt: FakeTimestamp.fromMillis(1) });
      await seedTransaction(db, 't2', { shopDomain: 'shop-a', createdAt: FakeTimestamp.fromMillis(2) });
      await seedTransaction(db, 't3', { shopDomain: 'shop-a', createdAt: FakeTimestamp.fromMillis(3) });

      const results = await repo.queryByShop({ shopDomain: 'shop-a', limit: 2 });

      expect(results.map((r) => r.id)).toEqual(['t3', 't2']);
    });

    it('defaults the limit to 50', async () => {
      const { db, repo } = makeRepo();
      for (let i = 0; i < 60; i++) {
        // eslint-disable-next-line no-await-in-loop
        await seedTransaction(db, `t${i}`, { shopDomain: 'shop-a', createdAt: FakeTimestamp.fromMillis(i) });
      }

      const results = await repo.queryByShop({ shopDomain: 'shop-a' });

      expect(results.length).toBe(50);
    });
  });
});
