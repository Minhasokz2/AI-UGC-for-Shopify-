const { createFakeFirestore } = require('../../helpers/fakeFirestore');
const { TEMPLATES, seedTemplates } = require('../../../src/services/templatesSeedData');
const { CUSTOM_SCENE_MODELS } = require('../../../src/services/fal');
const { ALLOWED_MODELS } = require('../../../src/services/allowedModelsSeedData');

const VIDEO_ROLES = new Set(ALLOWED_MODELS.filter((m) => m.category === 'video').map((m) => m.role));

describe('services/templatesSeedData', () => {
  it('every template references a real modelRole that actually exists in the catalog', () => {
    for (const template of TEMPLATES) {
      const exists = template.category === 'video' ? VIDEO_ROLES.has(template.modelRole) : !!CUSTOM_SCENE_MODELS[template.modelRole];
      expect(exists).toBe(true);
    }
  });

  it('every template has a unique slug', () => {
    const slugs = TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every template\'s creditCost matches its modelRole\'s underlying model cost — a template must never charge less than what the generation actually costs', () => {
    for (const template of TEMPLATES) {
      const model = template.category === 'video'
        ? ALLOWED_MODELS.find((m) => m.category === 'video' && m.role === template.modelRole)
        : CUSTOM_SCENE_MODELS[template.modelRole];
      expect(template.creditCost).toBe(model.creditCost);
    }
  });

  describe('seedTemplates', () => {
    it('creates every template on a fresh database', async () => {
      const db = createFakeFirestore();
      const result = await seedTemplates({ db });

      expect(result).toEqual({ created: TEMPLATES.length, skipped: 0, total: TEMPLATES.length });
      const snap = await db.collection('templates').get();
      expect(snap.size).toBe(TEMPLATES.length);
    });

    it('never overwrites an existing (possibly admin-edited) template on a second call', async () => {
      const db = createFakeFirestore();
      await seedTemplates({ db });
      await db.collection('templates').doc(TEMPLATES[0].slug).update({ creditCost: 999 });

      const second = await seedTemplates({ db });

      expect(second).toEqual({ created: 0, skipped: TEMPLATES.length, total: TEMPLATES.length });
      const doc = await db.collection('templates').doc(TEMPLATES[0].slug).get();
      expect(doc.data().creditCost).toBe(999);
    });
  });
});
