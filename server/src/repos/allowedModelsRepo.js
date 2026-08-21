const ALLOWED_MODELS_COLLECTION = 'allowed_models';

/**
 * Admin-curated allow-list of generation models, shared across every shop,
 * keyed by model id.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createAllowedModelsRepo({ db, FieldValue }) {
  const modelsCol = db.collection(ALLOWED_MODELS_COLLECTION);

  /**
   * At most one of eligibleFlow/category is ever sent to Firestore as a filter —
   * array-contains and an equality filter together aren't guaranteed to have a
   * composite index. When only one is requested it's pushed straight to
   * Firestore; when both are requested, eligibleFlow (array-contains) is pushed
   * and category is applied in memory afterward.
   */
  async function listModels({ eligibleFlow, category } = {}) {
    let query = modelsCol;
    if (eligibleFlow !== undefined) {
      query = query.where('eligibleFlows', 'array-contains', eligibleFlow);
    } else if (category !== undefined) {
      query = query.where('category', '==', category);
    }

    const snap = await query.get();
    let docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (eligibleFlow !== undefined && category !== undefined) {
      docs = docs.filter((doc) => doc.category === category);
    }

    return docs;
  }

  async function getModel(id) {
    const snap = await modelsCol.doc(id).get();
    return snap.exists ? { id, ...snap.data() } : undefined;
  }

  /** Full upsert semantics — this is the admin CRUD path, so overwriting is intended. */
  async function upsertModel(id, fields) {
    await modelsCol.doc(id).set(fields, { merge: true });
  }

  async function deleteModel(id) {
    await modelsCol.doc(id).delete();
  }

  return {
    listModels,
    getModel,
    upsertModel,
    deleteModel,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getAllowedModelsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createAllowedModelsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createAllowedModelsRepo, getAllowedModelsRepo };
