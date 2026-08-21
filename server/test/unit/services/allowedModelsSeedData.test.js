const { createFakeFirestore } = require('../../helpers/fakeFirestore');
const { ALLOWED_MODELS, computeImageCountConstraint, seedAllowedModels } = require('../../../src/services/allowedModelsSeedData');

describe('services/allowedModelsSeedData', () => {
  describe('computeImageCountConstraint', () => {
    it('returns {min:0,max:0} for prompt_only (text-to-image)', () => {
      expect(computeImageCountConstraint('prompt_only')).toEqual({ min: 0, max: 0 });
    });

    it('returns {min:1,max:1} for image_only and image_and_prompt', () => {
      expect(computeImageCountConstraint('image_only')).toEqual({ min: 1, max: 1 });
      expect(computeImageCountConstraint('image_and_prompt')).toEqual({ min: 1, max: 1 });
    });

    it('returns {min:2,max:2} for dual_image (virtual try-on)', () => {
      expect(computeImageCountConstraint('dual_image')).toEqual({ min: 2, max: 2 });
    });

    it('returns {min:1,max:maxImages} for image_urls_prompt and image_urls_angles', () => {
      expect(computeImageCountConstraint('image_urls_prompt', 6)).toEqual({ min: 1, max: 6 });
      expect(computeImageCountConstraint('image_urls_angles', 4)).toEqual({ min: 1, max: 4 });
    });

    it('defaults to maxImages=1 when omitted for a multi-image shape', () => {
      expect(computeImageCountConstraint('image_urls_prompt')).toEqual({ min: 1, max: 1 });
    });

    it('returns {min:0,max:0} for an unrecognized inputShape', () => {
      expect(computeImageCountConstraint('something_unknown')).toEqual({ min: 0, max: 0 });
    });
  });

  describe('ALLOWED_MODELS catalog', () => {
    it('every entry has a unique id', () => {
      const ids = ALLOWED_MODELS.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every entry carries a precomputed imageCountConstraint consistent with its inputShape', () => {
      for (const model of ALLOWED_MODELS) {
        expect(model.imageCountConstraint).toEqual(computeImageCountConstraint(model.inputShape, model.maxImages));
      }
    });

    it('every entry has a positive creditCost and a category/role/eligibleFlows', () => {
      for (const model of ALLOWED_MODELS) {
        expect(model.creditCost).toBeGreaterThan(0);
        expect(model.category).toBeTruthy();
        expect(model.role).toBeTruthy();
        expect(Array.isArray(model.eligibleFlows)).toBe(true);
        expect(model.eligibleFlows.length).toBeGreaterThan(0);
      }
    });

    it('text-to-image models hide the image-attach control (max === 0)', () => {
      const textToImageModels = ALLOWED_MODELS.filter((m) => m.category === 'text_to_image');
      expect(textToImageModels.length).toBeGreaterThan(0);
      for (const model of textToImageModels) {
        expect(model.imageCountConstraint).toEqual({ min: 0, max: 0 });
      }
    });

    it('the try-on model requires exactly 2 images and is custom-flow-only', () => {
      const tryOn = ALLOWED_MODELS.find((m) => m.role === 'try_on');
      expect(tryOn.imageCountConstraint).toEqual({ min: 2, max: 2 });
      expect(tryOn.eligibleFlows).toEqual(['custom']);
    });
  });

  describe('seedAllowedModels', () => {
    it('creates every catalog entry on an empty database', async () => {
      const db = createFakeFirestore();
      const result = await seedAllowedModels({ db });

      expect(result.created).toBe(ALLOWED_MODELS.length);
      expect(result.skipped).toBe(0);

      const snap = await db.collection('allowed_models').get();
      expect(snap.size).toBe(ALLOWED_MODELS.length);
    });

    it('is safe to re-run: skips everything already present', async () => {
      const db = createFakeFirestore();
      await seedAllowedModels({ db });
      const second = await seedAllowedModels({ db });

      expect(second.created).toBe(0);
      expect(second.skipped).toBe(ALLOWED_MODELS.length);
    });

    it('never overwrites an admin-edited field on an existing model', async () => {
      const db = createFakeFirestore();
      await seedAllowedModels({ db });

      const someModelId = ALLOWED_MODELS[0].id;
      await db.collection('allowed_models').doc(someModelId).update({ creditCost: 999 });

      await seedAllowedModels({ db });

      const data = (await db.collection('allowed_models').doc(someModelId).get()).data();
      expect(data.creditCost).toBe(999);
    });

    it('creates newly-added catalog entries without touching existing ones', async () => {
      const db = createFakeFirestore();
      await db.collection('allowed_models').doc(ALLOWED_MODELS[0].id).set(ALLOWED_MODELS[0]);

      const result = await seedAllowedModels({ db });

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(ALLOWED_MODELS.length - 1);
    });
  });
});
