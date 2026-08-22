const TEMPLATES_COLLECTION = 'templates';

/**
 * This `templates` collection is deliberately shared with a different,
 * separately-running app in the same Firebase project (kept intentionally —
 * see the operator's explicit instruction to reuse this exact Firestore
 * project rather than provisioning a new one). That other app's documents
 * use an incompatible shape (`preferredModel`/`promptTemplate`/`name` instead
 * of `modelRole`/`prompt`/`label`) and must never surface here — every
 * AI UGC Generator template has `modelRole` (generationPipeline.resolveModelForJob
 * requires it to route a job to an actual model), so its absence reliably
 * marks a document as belonging to the other app.
 */
function isOwnTemplate(template) {
  return template.modelRole !== undefined;
}

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
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(isOwnTemplate);
  }

  async function getTemplate(slug) {
    const snap = await templatesCol.doc(slug).get();
    if (!snap.exists) return undefined;
    const template = { id: slug, ...snap.data() };
    return isOwnTemplate(template) ? template : undefined;
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
