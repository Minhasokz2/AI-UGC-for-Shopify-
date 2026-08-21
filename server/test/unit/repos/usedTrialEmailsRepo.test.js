const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createUsedTrialEmailsRepo } = require('../../../src/repos/usedTrialEmailsRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createUsedTrialEmailsRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/usedTrialEmailsRepo', () => {
  describe('claimTrialForEmail', () => {
    it('the first claim for an email succeeds', async () => {
      const { db, repo } = makeRepo();

      const result = await repo.claimTrialForEmail('merchant@example.com', { shopDomain: 'shop-a' });

      expect(result).toEqual({ claimed: true });
      const stored = (await db.collection('used_trial_emails').doc('merchant@example.com').get()).data();
      expect(stored.shopDomain).toBe('shop-a');
      expect(stored.claimedAt).toBeInstanceOf(FakeTimestamp);
    });

    it('a second claim for the same email returns claimed:false with the original shopDomain and does not overwrite', async () => {
      const { db, repo } = makeRepo();
      await repo.claimTrialForEmail('merchant@example.com', { shopDomain: 'shop-a' });

      const second = await repo.claimTrialForEmail('merchant@example.com', { shopDomain: 'shop-b' });

      expect(second).toEqual({ claimed: false, existingShopDomain: 'shop-a' });
      const stored = (await db.collection('used_trial_emails').doc('merchant@example.com').get()).data();
      expect(stored.shopDomain).toBe('shop-a');
    });

    it('different emails do not collide', async () => {
      const { repo } = makeRepo();
      const a = await repo.claimTrialForEmail('a@example.com', { shopDomain: 'shop-a' });
      const b = await repo.claimTrialForEmail('b@example.com', { shopDomain: 'shop-b' });
      expect(a.claimed).toBe(true);
      expect(b.claimed).toBe(true);
    });
  });
});
