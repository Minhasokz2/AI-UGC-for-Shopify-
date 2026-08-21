const { Session } = require('@shopify/shopify-api');
const { createFakeFirestore, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { FirestoreSessionStorage } = require('../../../src/repos/FirestoreSessionStorage');

function makeStorage() {
  const db = createFakeFirestore();
  const storage = new FirestoreSessionStorage(db, { Timestamp: FakeTimestamp });
  return { db, storage };
}

function makeOfflineSession(overrides = {}) {
  return new Session({
    id: 'offline_shop-a.myshopify.com',
    shop: 'shop-a.myshopify.com',
    state: 'state123',
    isOnline: false,
    scope: 'read_products,write_products',
    accessToken: 'shpat_abc123',
    ...overrides,
  });
}

describe('repos/FirestoreSessionStorage', () => {
  it('storeSession then loadSession round-trips a real Session instance', async () => {
    const { storage } = makeStorage();
    const session = makeOfflineSession();

    expect(await storage.storeSession(session)).toBe(true);
    const loaded = await storage.loadSession(session.id);

    expect(loaded).toBeInstanceOf(Session);
    expect(loaded.id).toBe(session.id);
    expect(loaded.shop).toBe(session.shop);
    expect(loaded.accessToken).toBe(session.accessToken);
    expect(loaded.isOnline).toBe(false);
  });

  it('loadSession returns undefined for a missing id', async () => {
    const { storage } = makeStorage();
    expect(await storage.loadSession('does-not-exist')).toBeUndefined();
  });

  it('round-trips the `expires` Date through a Timestamp without losing precision', async () => {
    const { storage } = makeStorage();
    const expires = new Date('2027-01-01T00:00:00.000Z');
    const session = makeOfflineSession({ expires });

    await storage.storeSession(session);
    const loaded = await storage.loadSession(session.id);

    expect(loaded.expires).toBeInstanceOf(Date);
    expect(loaded.expires.getTime()).toBe(expires.getTime());
  });

  it('deleteSession removes the document', async () => {
    const { storage } = makeStorage();
    const session = makeOfflineSession();
    await storage.storeSession(session);

    expect(await storage.deleteSession(session.id)).toBe(true);
    expect(await storage.loadSession(session.id)).toBeUndefined();
  });

  it('findSessionsByShop returns every session for that shop and none for another', async () => {
    const { storage } = makeStorage();
    await storage.storeSession(makeOfflineSession({ id: 's1', shop: 'shop-a.myshopify.com' }));
    await storage.storeSession(makeOfflineSession({ id: 's2', shop: 'shop-a.myshopify.com', isOnline: true }));
    await storage.storeSession(makeOfflineSession({ id: 's3', shop: 'shop-b.myshopify.com' }));

    const sessions = await storage.findSessionsByShop('shop-a.myshopify.com');
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.shop === 'shop-a.myshopify.com')).toBe(true);
  });

  it('deleteSessions removes every id, chunking beyond the batch-write limit', async () => {
    const { storage, db } = makeStorage();
    const ids = Array.from({ length: 1200 }, (_, i) => `bulk_${i}`);
    for (const id of ids) {
      await storage.storeSession(makeOfflineSession({ id, shop: 'shop-a.myshopify.com' }));
    }

    expect(await storage.deleteSessions(ids)).toBe(true);
    const remaining = await db.collection('shopify_sessions').get();
    expect(remaining.empty).toBe(true);
  });
});
