const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');

describe('test helper: fakeFirestore', () => {
  it('set/get/update/delete a document by explicit id', async () => {
    const db = createFakeFirestore();
    const ref = db.collection('shops').doc('shop-a.myshopify.com');
    await ref.set({ creditBalance: 10 });

    let snap = await ref.get();
    expect(snap.exists).toBe(true);
    expect(snap.data()).toEqual({ creditBalance: 10 });

    await ref.update({ creditBalance: 5 });
    snap = await ref.get();
    expect(snap.data().creditBalance).toBe(5);

    await ref.delete();
    snap = await ref.get();
    expect(snap.exists).toBe(false);
  });

  it('doc() with no id generates a unique auto-id', async () => {
    const db = createFakeFirestore();
    const a = db.collection('jobs').doc();
    const b = db.collection('jobs').doc();
    expect(a.id).not.toBe(b.id);
  });

  it('update() throws on a non-existent document (matches real Firestore)', async () => {
    const db = createFakeFirestore();
    const ref = db.collection('jobs').doc('missing');
    await expect(ref.update({ status: 'processing' })).rejects.toThrow();
  });

  it('FieldValue.increment() accumulates against the existing value, defaulting missing fields to 0', async () => {
    const db = createFakeFirestore();
    const ref = db.collection('shops').doc('s1');
    await ref.set({ lifetimeCreditsSpent: 5 });
    await ref.update({ lifetimeCreditsSpent: FieldValue.increment(3), lifetimeImagesGenerated: FieldValue.increment(2) });
    const data = (await ref.get()).data();
    expect(data.lifetimeCreditsSpent).toBe(8);
    expect(data.lifetimeImagesGenerated).toBe(2);
  });

  it('FieldValue.serverTimestamp() resolves to a FakeTimestamp with toMillis()', async () => {
    const db = createFakeFirestore();
    const ref = db.collection('jobs').doc('j1');
    await ref.set({ claimedAt: FieldValue.serverTimestamp() });
    const data = (await ref.get()).data();
    expect(data.claimedAt).toBeInstanceOf(FakeTimestamp);
    expect(typeof data.claimedAt.toMillis()).toBe('number');
  });

  it('where("field","==",value) filters correctly', async () => {
    const db = createFakeFirestore();
    await db.collection('jobs').doc('a').set({ shopDomain: 'x', status: 'pending' });
    await db.collection('jobs').doc('b').set({ shopDomain: 'x', status: 'succeeded' });
    await db.collection('jobs').doc('c').set({ shopDomain: 'y', status: 'pending' });

    const snap = await db.collection('jobs').where('shopDomain', '==', 'x').get();
    expect(snap.size).toBe(2);
  });

  it('where("field","in",[...]) filters correctly', async () => {
    const db = createFakeFirestore();
    await db.collection('jobs').doc('a').set({ status: 'pending' });
    await db.collection('jobs').doc('b').set({ status: 'processing' });
    await db.collection('jobs').doc('c').set({ status: 'succeeded' });

    const snap = await db.collection('jobs').where('status', 'in', ['pending', 'processing']).get();
    expect(snap.size).toBe(2);
  });

  it('orderBy + limit + startAfter paginate consistently', async () => {
    const db = createFakeFirestore();
    for (let i = 0; i < 5; i += 1) {
      await db.collection('jobs').doc(`j${i}`).set({ createdAtMs: i });
    }
    const firstPage = await db.collection('jobs').orderBy('createdAtMs', 'asc').limit(2).get();
    expect(firstPage.docs.map((d) => d.data().createdAtMs)).toEqual([0, 1]);

    const cursor = firstPage.docs[firstPage.docs.length - 1].data().createdAtMs;
    const secondPage = await db.collection('jobs').orderBy('createdAtMs', 'asc').startAfter(cursor).limit(2).get();
    expect(secondPage.docs.map((d) => d.data().createdAtMs)).toEqual([2, 3]);
  });

  it('runTransaction buffers writes until the update function resolves, then commits atomically', async () => {
    const db = createFakeFirestore();
    const ref = db.collection('shops').doc('s1');
    await ref.set({ creditBalance: 100 });

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      expect(snap.data().creditBalance).toBe(100);
      tx.update(ref, { creditBalance: snap.data().creditBalance - 40 });
    });

    expect((await ref.get()).data().creditBalance).toBe(60);
  });

  it('runTransaction can create a new document via tx.set on an auto-id doc', async () => {
    const db = createFakeFirestore();
    let newId;
    await db.runTransaction(async (tx) => {
      const ref = db.collection('jobs').doc();
      newId = ref.id;
      tx.set(ref, { status: 'pending' });
    });
    const snap = await db.collection('jobs').doc(newId).get();
    expect(snap.exists).toBe(true);
    expect(snap.data().status).toBe('pending');
  });

  it('batch() applies multiple deletes atomically', async () => {
    const db = createFakeFirestore();
    await db.collection('shopify_sessions').doc('a').set({ shop: 'x' });
    await db.collection('shopify_sessions').doc('b').set({ shop: 'x' });

    const batch = db.batch();
    batch.delete(db.collection('shopify_sessions').doc('a'));
    batch.delete(db.collection('shopify_sessions').doc('b'));
    await batch.commit();

    const snap = await db.collection('shopify_sessions').where('shop', '==', 'x').get();
    expect(snap.empty).toBe(true);
  });

  it('two independent createFakeFirestore() instances do not share state', async () => {
    const dbA = createFakeFirestore();
    const dbB = createFakeFirestore();
    await dbA.collection('shops').doc('s').set({ creditBalance: 1 });
    const snapB = await dbB.collection('shops').doc('s').get();
    expect(snapB.exists).toBe(false);
  });
});
