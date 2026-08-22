const { createFakeFirestore, FieldValue } = require('../../helpers/fakeFirestore');
const { createAllowedModelsRepo } = require('../../../src/repos/allowedModelsRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createAllowedModelsRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/allowedModelsRepo', () => {
  describe('listModels', () => {
    async function seedModels(repo) {
      await repo.upsertModel('m1', { role: 'r1', category: 'image', eligibleFlows: ['scene', 'ugc'] });
      await repo.upsertModel('m2', { role: 'r2', category: 'image', eligibleFlows: ['scene'] });
      await repo.upsertModel('m3', { role: 'r3', category: 'video', eligibleFlows: ['ugc'] });
    }

    it('returns all models when no filter is given', async () => {
      const { repo } = makeRepo();
      await seedModels(repo);
      const results = await repo.listModels();
      expect(results.map((r) => r.id).sort()).toEqual(['m1', 'm2', 'm3']);
    });

    it('filters by eligibleFlow via array-contains', async () => {
      const { repo } = makeRepo();
      await seedModels(repo);
      const results = await repo.listModels({ eligibleFlow: 'ugc' });
      expect(results.map((r) => r.id).sort()).toEqual(['m1', 'm3']);
    });

    it('filters by category via equality', async () => {
      const { repo } = makeRepo();
      await seedModels(repo);
      const results = await repo.listModels({ category: 'video' });
      expect(results.map((r) => r.id)).toEqual(['m3']);
    });

    it('combines eligibleFlow (pushed to Firestore) and category (applied in memory)', async () => {
      const { repo } = makeRepo();
      await seedModels(repo);
      const results = await repo.listModels({ eligibleFlow: 'ugc', category: 'video' });
      expect(results.map((r) => r.id)).toEqual(['m3']);
    });

    it('returns nothing when the combined filters match no model', async () => {
      const { repo } = makeRepo();
      await seedModels(repo);
      const results = await repo.listModels({ eligibleFlow: 'scene', category: 'video' });
      expect(results).toEqual([]);
    });

    it('excludes a document with no role — this collection is shared with a different app', async () => {
      const { repo } = makeRepo();
      await seedModels(repo);
      await repo.upsertModel('foreign-doc', { category: 'image', preferredModel: 'not-ours' });

      const results = await repo.listModels();

      expect(results.map((r) => r.id).sort()).toEqual(['m1', 'm2', 'm3']);
    });
  });

  describe('getModel', () => {
    it('returns undefined for a missing model', async () => {
      const { repo } = makeRepo();
      expect(await repo.getModel('missing')).toBeUndefined();
    });

    it('returns undefined for a document with no role — this collection is shared with a different app', async () => {
      const { repo } = makeRepo();
      await repo.upsertModel('foreign-doc', { category: 'image', preferredModel: 'not-ours' });
      expect(await repo.getModel('foreign-doc')).toBeUndefined();
    });
  });

  describe('upsertModel / deleteModel', () => {
    it('upsert creates then updates (merge)', async () => {
      const { repo } = makeRepo();
      await repo.upsertModel('m1', { role: 'r1', category: 'image', eligibleFlows: ['scene'] });
      await repo.upsertModel('m1', { category: 'video' });

      const stored = await repo.getModel('m1');
      expect(stored.category).toBe('video');
      expect(stored.eligibleFlows).toEqual(['scene']);
    });

    it('delete removes the model', async () => {
      const { repo } = makeRepo();
      await repo.upsertModel('m1', { role: 'r1', category: 'image' });
      await repo.deleteModel('m1');
      expect(await repo.getModel('m1')).toBeUndefined();
    });
  });
});
