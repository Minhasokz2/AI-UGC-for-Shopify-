const { createFakeFirestore, FieldValue } = require('../../helpers/fakeFirestore');
const { createTemplatesRepo } = require('../../../src/repos/templatesRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createTemplatesRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/templatesRepo', () => {
  describe('listTemplates', () => {
    it('returns all templates when no category is given', async () => {
      const { repo } = makeRepo();
      await repo.upsertTemplate('scene-a', { category: 'scene', label: 'Scene A' });
      await repo.upsertTemplate('ugc-a', { category: 'ugc', label: 'UGC A' });

      const results = await repo.listTemplates();

      expect(results.map((r) => r.id).sort()).toEqual(['scene-a', 'ugc-a']);
    });

    it('filters by category', async () => {
      const { repo } = makeRepo();
      await repo.upsertTemplate('scene-a', { category: 'scene', label: 'Scene A' });
      await repo.upsertTemplate('ugc-a', { category: 'ugc', label: 'UGC A' });
      await repo.upsertTemplate('scene-b', { category: 'scene', label: 'Scene B' });

      const results = await repo.listTemplates({ category: 'scene' });

      expect(results.map((r) => r.id).sort()).toEqual(['scene-a', 'scene-b']);
    });
  });

  describe('getTemplate', () => {
    it('returns undefined for a missing template', async () => {
      const { repo } = makeRepo();
      expect(await repo.getTemplate('missing')).toBeUndefined();
    });

    it('returns the stored template merged with its slug as id', async () => {
      const { repo } = makeRepo();
      await repo.upsertTemplate('scene-a', { category: 'scene', label: 'Scene A' });
      expect(await repo.getTemplate('scene-a')).toEqual({ id: 'scene-a', category: 'scene', label: 'Scene A' });
    });
  });

  describe('upsertTemplate', () => {
    it('creates a new template', async () => {
      const { repo } = makeRepo();
      await repo.upsertTemplate('scene-a', { category: 'scene', label: 'Scene A' });
      expect(await repo.getTemplate('scene-a')).toEqual({ id: 'scene-a', category: 'scene', label: 'Scene A' });
    });

    it('updates an existing template (merge), the admin CRUD overwrite path', async () => {
      const { repo } = makeRepo();
      await repo.upsertTemplate('scene-a', { category: 'scene', label: 'Scene A', extra: 'keep-me' });
      await repo.upsertTemplate('scene-a', { label: 'Scene A renamed' });

      const stored = await repo.getTemplate('scene-a');
      expect(stored.label).toBe('Scene A renamed');
      expect(stored.category).toBe('scene');
      expect(stored.extra).toBe('keep-me');
    });
  });

  describe('deleteTemplate', () => {
    it('removes the template', async () => {
      const { repo } = makeRepo();
      await repo.upsertTemplate('scene-a', { category: 'scene' });
      await repo.deleteTemplate('scene-a');
      expect(await repo.getTemplate('scene-a')).toBeUndefined();
    });
  });
});
