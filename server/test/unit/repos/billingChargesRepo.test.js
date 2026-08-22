const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createBillingChargesRepo } = require('../../../src/repos/billingChargesRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createBillingChargesRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/billingChargesRepo', () => {
  describe('claimCharge', () => {
    it('the first claim for a charge key succeeds and persists the grant details', async () => {
      const { db, repo } = makeRepo();

      const result = await repo.claimCharge('gid://shopify/AppPurchaseOneTime/1', {
        shopDomain: 'shop-a',
        credits: 200,
        type: 'one_time',
      });

      expect(result).toEqual({ claimed: true });
      const snap = await db.collection('billing_charges').get();
      expect(snap.size).toBe(1);
      const stored = snap.docs[0].data();
      expect(stored).toEqual(
        expect.objectContaining({ chargeKey: 'gid://shopify/AppPurchaseOneTime/1', shopDomain: 'shop-a', credits: 200, type: 'one_time' }),
      );
      expect(stored.processedAt).toBeInstanceOf(FakeTimestamp);
    });

    it('sanitizes the "/" in a GID-shaped chargeKey out of the doc id — Firestore rejects a doc id containing "/" as an invalid resource path', async () => {
      const { db, repo } = makeRepo();

      await repo.claimCharge('gid://shopify/AppSubscription/2', { shopDomain: 'shop-a', credits: 1500, type: 'subscription' });

      const snap = await db.collection('billing_charges').get();
      expect(snap.docs[0].id).not.toMatch(/\//);
    });

    it('a second claim for the same charge key returns claimed:false and does not overwrite', async () => {
      const { db, repo } = makeRepo();
      await repo.claimCharge('charge-1', { shopDomain: 'shop-a', credits: 200, type: 'one_time' });

      const second = await repo.claimCharge('charge-1', { shopDomain: 'shop-a', credits: 999, type: 'one_time' });

      expect(second).toEqual({ claimed: false });
      const stored = (await db.collection('billing_charges').doc('charge-1').get()).data();
      expect(stored.credits).toBe(200);
    });

    it('different charge keys do not collide (e.g. distinct renewal cycles for the same GID subscription)', async () => {
      const { repo } = makeRepo();
      const cycle1 = await repo.claimCharge('gid://shopify/AppSubscription/9:2026-01-01', { shopDomain: 'shop-a', credits: 600, type: 'renewal' });
      const cycle2 = await repo.claimCharge('gid://shopify/AppSubscription/9:2026-02-01', { shopDomain: 'shop-a', credits: 600, type: 'renewal' });
      expect(cycle1.claimed).toBe(true);
      expect(cycle2.claimed).toBe(true);
    });
  });
});
