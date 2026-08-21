const TEMPLATES_COLLECTION = 'templates';

/**
 * Admin-curated template catalog, shared across every shop (not shop-scoped),
 * keyed by slug.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createTemplatesRepo({ db, FieldValue }) {
  const templatesCol = db.collection(TEMPLATES_COLLECTION);

  async function listTemplates({ category } = {}) {
    let query = templatesCol;
    if (category) query = query.where('category', '==', category);
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async function getTemplate(slug) {
    const snap = await templatesCol.doc(slug).get();
    return snap.exists ? { id: slug, ...snap.data() } : undefined;
  }

  /** Full upsert semantics — this is the admin CRUD path, so overwriting is intended. */
  async function upsertTemplate(slug, fields) {
    await templatesCol.doc(slug).set(fields, { merge: true });
  }

  async function deleteTemplate(slug) {
    await templatesCol.doc(slug).delete();
  }

  return {
    listTemplates,
    getTemplate,
    upsertTemplate,
    deleteTemplate,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getTemplatesRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createTemplatesRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createTemplatesRepo, getTemplatesRepo };
