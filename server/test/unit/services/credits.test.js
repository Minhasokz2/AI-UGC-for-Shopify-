const { createFakeFirestore, FieldValue } = require('../../helpers/fakeFirestore');
const { createCreditsService } = require('../../../src/services/credits');
const { createTemplatesRepo } = require('../../../src/repos/templatesRepo');
const { createAllowedModelsRepo } = require('../../../src/repos/allowedModelsRepo');
const { NotFoundError, InsufficientCreditsError, ValidationError } = require('../../../src/errors/AppError');

function makeService() {
  const db = createFakeFirestore();
  const templatesRepo = createTemplatesRepo({ db, FieldValue });
  const allowedModelsRepo = createAllowedModelsRepo({ db, FieldValue });
  const credits = createCreditsService({ db, templatesRepo, allowedModelsRepo });
  return { db, credits, templatesRepo, allowedModelsRepo };
}

describe('services/credits', () => {
  describe('recomputeCost (settlement-time, transactional)', () => {
    it('reads the current creditCost from the template record and multiplies by numImages', async () => {
      const { db, credits } = makeService();
      await db.collection('templates').doc('tpl-1').set({ creditCost: 3 });
      const job = { templateId: 'tpl-1', numImages: 2 };

      const cost = await db.runTransaction((tx) => credits.recomputeCost(tx, job));

      expect(cost).toBe(6);
    });

    it('reads the current creditCost from the allowed-model record when the job used a custom model', async () => {
      const { db, credits } = makeService();
      await db.collection('allowed_models').doc('model-1').set({ creditCost: 5 });
      const job = { modelId: 'model-1', numImages: 1 };

      const cost = await db.runTransaction((tx) => credits.recomputeCost(tx, job));

      expect(cost).toBe(5);
    });

    it('defaults numImages to 1 when absent', async () => {
      const { db, credits } = makeService();
      await db.collection('templates').doc('tpl-1').set({ creditCost: 4 });
      const cost = await db.runTransaction((tx) => credits.recomputeCost(tx, { templateId: 'tpl-1' }));
      expect(cost).toBe(4);
    });

    it('re-reads a PRICE CHANGE made after job creation — never trusts a cached estimate', async () => {
      const { db, credits } = makeService();
      await db.collection('templates').doc('tpl-1').set({ creditCost: 2 });
      // Admin changes the price between job creation and settlement.
      await db.collection('templates').doc('tpl-1').update({ creditCost: 10 });

      const cost = await db.runTransaction((tx) => credits.recomputeCost(tx, { templateId: 'tpl-1', numImages: 1 }));

      expect(cost).toBe(10);
    });

    it('throws NotFoundError for a missing template', async () => {
      const { db, credits } = makeService();
      await expect(
        db.runTransaction((tx) => credits.recomputeCost(tx, { templateId: 'missing' })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError for a missing model', async () => {
      const { db, credits } = makeService();
      await expect(db.runTransaction((tx) => credits.recomputeCost(tx, { modelId: 'missing' }))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('throws ValidationError when the job has neither templateId nor modelId', async () => {
      const { db, credits } = makeService();
      await expect(db.runTransaction((tx) => credits.recomputeCost(tx, {}))).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('estimateJobCost (non-transactional, pre-flight)', () => {
    it('estimates from a template', async () => {
      const { db, credits } = makeService();
      await db.collection('templates').doc('tpl-1').set({ creditCost: 3, modelRole: 'test_role' });
      expect(await credits.estimateJobCost({ templateId: 'tpl-1', numImages: 2 })).toBe(6);
    });

    it('estimates from a model', async () => {
      const { db, credits } = makeService();
      await db.collection('allowed_models').doc('model-1').set({ creditCost: 2, role: 'test_role' });
      expect(await credits.estimateJobCost({ modelId: 'model-1', numImages: 4 })).toBe(8);
    });

    it('throws NotFoundError for a missing template/model', async () => {
      const { credits } = makeService();
      await expect(credits.estimateJobCost({ templateId: 'missing' })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ValidationError when neither templateId nor modelId is given', async () => {
      const { credits } = makeService();
      await expect(credits.estimateJobCost({})).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('assertSufficientCredits', () => {
    it('passes when the balance covers the required credits', () => {
      const { credits } = makeService();
      expect(() => credits.assertSufficientCredits({ plan: 'metered', creditBalance: 10 }, 5)).not.toThrow();
    });

    it('throws InsufficientCreditsError when the balance is short', () => {
      const { credits } = makeService();
      expect(() => credits.assertSufficientCredits({ plan: 'metered', creditBalance: 2 }, 5)).toThrow(
        InsufficientCreditsError,
      );
    });

    it('unlimited-plan shops always pass regardless of balance', () => {
      const { credits } = makeService();
      expect(() => credits.assertSufficientCredits({ plan: 'unlimited', creditBalance: 0 }, 999)).not.toThrow();
    });

    it('treats a missing creditBalance as 0', () => {
      const { credits } = makeService();
      expect(() => credits.assertSufficientCredits({ plan: 'metered' }, 1)).toThrow(InsufficientCreditsError);
    });
  });
});
