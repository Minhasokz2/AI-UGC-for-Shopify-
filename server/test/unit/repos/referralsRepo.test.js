const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createReferralsRepo } = require('../../../src/repos/referralsRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createReferralsRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/referralsRepo', () => {
  describe('createReferral / findByReferredShop', () => {
    it('round-trips a referral', async () => {
      const { repo } = makeRepo();
      const created = await repo.createReferral({
        referrerShopDomain: 'referrer.myshopify.com',
        referredShopDomain: 'referred.myshopify.com',
        code: 'CODE123',
      });

      expect(created.status).toBe('pending');
      expect(created.commissionOwedCents).toBe(0);

      const found = await repo.findByReferredShop('referred.myshopify.com');
      expect(found).toMatchObject({
        id: created.id,
        referrerShopDomain: 'referrer.myshopify.com',
        referredShopDomain: 'referred.myshopify.com',
        code: 'CODE123',
        status: 'pending',
        commissionOwedCents: 0,
      });
      expect(found.createdAt).toBeInstanceOf(FakeTimestamp);
    });

    it('returns undefined when no referral exists for the referred shop', async () => {
      const { repo } = makeRepo();
      expect(await repo.findByReferredShop('nobody.myshopify.com')).toBeUndefined();
    });
  });

  describe('markConverted', () => {
    it('changes status to converted and sets convertedAt', async () => {
      const { repo } = makeRepo();
      const created = await repo.createReferral({
        referrerShopDomain: 'referrer.myshopify.com',
        referredShopDomain: 'referred.myshopify.com',
        code: 'CODE123',
      });

      await repo.markConverted(created.id);

      const found = await repo.findByReferredShop('referred.myshopify.com');
      expect(found.status).toBe('converted');
      expect(found.convertedAt).toBeInstanceOf(FakeTimestamp);
    });
  });

  describe('accrueCommission', () => {
    it('accumulates commissionOwedCents across multiple calls', async () => {
      const { repo } = makeRepo();
      const created = await repo.createReferral({
        referrerShopDomain: 'referrer.myshopify.com',
        referredShopDomain: 'referred.myshopify.com',
        code: 'CODE123',
      });

      await repo.accrueCommission(created.id, 500);
      await repo.accrueCommission(created.id, 250);

      const found = await repo.findByReferredShop('referred.myshopify.com');
      expect(found.commissionOwedCents).toBe(750);
    });
  });

  describe('listByReferrer', () => {
    it('scopes to referrals where the given shop is the referrer', async () => {
      const { repo } = makeRepo();
      await repo.createReferral({ referrerShopDomain: 'referrer-a', referredShopDomain: 'shop-1', code: 'A' });
      await repo.createReferral({ referrerShopDomain: 'referrer-a', referredShopDomain: 'shop-2', code: 'B' });
      await repo.createReferral({ referrerShopDomain: 'referrer-b', referredShopDomain: 'shop-3', code: 'C' });

      const results = await repo.listByReferrer('referrer-a');

      expect(results.length).toBe(2);
      expect(results.map((r) => r.referredShopDomain).sort()).toEqual(['shop-1', 'shop-2']);
    });
  });
});
