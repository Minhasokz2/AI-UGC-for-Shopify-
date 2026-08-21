const PRODUCTS_COLLECTION = 'products';
const DELETE_BATCH_CHUNK_SIZE = 500;
const SEARCH_CANDIDATE_WINDOW_MULTIPLIER = 4;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function productDocId(shopDomain, shopifyProductId) {
  return `${shopDomain}:${shopifyProductId}`;
}

/**
 * Cached, shop-scoped copy of the Shopify product catalog, keyed by a
 * deterministic doc id (`${shopDomain}:${shopifyProductId}`) rather than a
 * random auto-id, so re-syncing the same product updates it in place instead
 * of duplicating it.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createProductsRepo({ db, FieldValue }) {
  const productsCol = db.collection(PRODUCTS_COLLECTION);

  async function upsertProduct({ shopDomain, shopifyProductId, title, imageUrls, category }) {
    const id = productDocId(shopDomain, shopifyProductId);
    const fields = { shopDomain, shopifyProductId, title, imageUrls, category };
    await productsCol.doc(id).set(fields, { merge: true });
    return { id, ...fields };
  }

  /**
   * Firestore has no native substring search, so `search` is always applied in
   * memory over a fetched candidate window (like queryHelpers' candidate-window
   * approach): fetch `limit * 4` candidates ordered by title, filter by search
   * in memory, then slice down to `limit`.
   */
  async function queryByShop({ shopDomain, search, limit = 50, cursor }) {
    let query = productsCol.where('shopDomain', '==', shopDomain).orderBy('title', 'asc');
    if (cursor !== undefined) query = query.startAfter(cursor);
    const candidateLimit = search ? limit * SEARCH_CANDIDATE_WINDOW_MULTIPLIER : limit;
    query = query.limit(candidateLimit);

    const snap = await query.get();
    let docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (search) {
      const needle = search.toLowerCase();
      docs = docs.filter((doc) => (doc.title || '').toLowerCase().includes(needle));
    }

    return docs.slice(0, limit);
  }

  /** Batch-deletes every product doc for a shop, chunked like FirestoreSessionStorage.deleteSessions. */
  async function deleteAllForShop(shopDomain) {
    const snap = await productsCol.where('shopDomain', '==', shopDomain).get();
    const ids = snap.docs.map((doc) => doc.id);
    for (const idsChunk of chunk(ids, DELETE_BATCH_CHUNK_SIZE)) {
      const batch = productsCol.firestore.batch();
      idsChunk.forEach((id) => batch.delete(productsCol.doc(id)));
      await batch.commit();
    }
  }

  return {
    upsertProduct,
    queryByShop,
    deleteAllForShop,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getProductsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createProductsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createProductsRepo, getProductsRepo };
