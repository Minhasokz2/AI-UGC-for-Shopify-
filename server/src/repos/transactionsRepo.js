const TRANSACTIONS_COLLECTION = 'transactions';

/**
 * Read-side query methods over the `transactions` (credit ledger) collection.
 * jobsRepo.js already writes to this collection directly inside
 * settleJobSuccess's transaction — this repo intentionally does not duplicate
 * that write logic, it only adds query access for the credits/history UI.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createTransactionsRepo({ db, FieldValue }) {
  const transactionsCol = db.collection(TRANSACTIONS_COLLECTION);

  async function queryByShop({ shopDomain, limit = 50 }) {
    const snap = await transactionsCol
      .where('shopDomain', '==', shopDomain)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  return {
    queryByShop,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getTransactionsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createTransactionsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createTransactionsRepo, getTransactionsRepo };
