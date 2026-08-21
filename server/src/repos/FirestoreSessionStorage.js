const { Session } = require('@shopify/shopify-api');
const { Timestamp: RealTimestamp } = require('firebase-admin/firestore');

const SESSIONS_COLLECTION = 'shopify_sessions';
const DELETE_BATCH_CHUNK_SIZE = 500;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

/** Converts a Session's Date fields to Timestamps for storage. */
function serializeSession(session, Timestamp) {
  const obj = session.toObject();
  const serialized = { ...obj };
  if (obj.expires) serialized.expires = Timestamp.fromDate(obj.expires);
  if (obj.refreshTokenExpires) serialized.refreshTokenExpires = Timestamp.fromDate(obj.refreshTokenExpires);
  return serialized;
}

/** Converts stored Timestamp fields back to Dates and reconstructs a real Session. */
function deserializeSession(data) {
  const plain = { ...data };
  if (plain.expires) plain.expires = plain.expires.toDate();
  if (plain.refreshTokenExpires) plain.refreshTokenExpires = plain.refreshTokenExpires.toDate();
  return new Session(plain);
}

/**
 * Implements the 5-method `SessionStorage` interface from
 * `@shopify/shopify-app-session-storage` (a plain TS interface, not an abstract
 * class — nothing to `extends` at runtime) against Firestore's `shopify_sessions`
 * collection, keyed by session id with `shop` as a queryable field.
 *
 * `Timestamp` is injectable so unit tests can pass the fake Firestore's
 * `FakeTimestamp` instead of the real `firebase-admin/firestore` Timestamp.
 */
class FirestoreSessionStorage {
  constructor(db, { Timestamp = RealTimestamp } = {}) {
    this.col = db.collection(SESSIONS_COLLECTION);
    this.Timestamp = Timestamp;
  }

  async storeSession(session) {
    await this.col.doc(session.id).set(serializeSession(session, this.Timestamp));
    return true;
  }

  async loadSession(id) {
    const snap = await this.col.doc(id).get();
    // `.data()` never includes the document id (matches real Firestore), so it's
    // merged back in from `snap.id` before reconstructing the Session.
    return snap.exists ? deserializeSession({ id: snap.id, ...snap.data() }) : undefined;
  }

  async deleteSession(id) {
    await this.col.doc(id).delete();
    return true;
  }

  async deleteSessions(ids) {
    for (const idsChunk of chunk(ids, DELETE_BATCH_CHUNK_SIZE)) {
      const batch = this.col.firestore.batch();
      idsChunk.forEach((id) => batch.delete(this.col.doc(id)));
      await batch.commit();
    }
    return true;
  }

  async findSessionsByShop(shop) {
    const snap = await this.col.where('shop', '==', shop).get();
    return snap.docs.map((doc) => deserializeSession({ id: doc.id, ...doc.data() }));
  }
}

module.exports = { FirestoreSessionStorage, serializeSession, deserializeSession };
