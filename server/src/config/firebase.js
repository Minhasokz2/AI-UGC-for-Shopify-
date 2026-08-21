const admin = require('firebase-admin');
const { env } = require('./env');

let app;

/**
 * Lazily initializes the firebase-admin app exactly once and returns a Firestore
 * handle. Lazy so importing this module in a unit test (which uses fakeFirestore
 * instead) never triggers a real network-touching SDK init.
 * @returns {admin.firestore.Firestore}
 */
function getFirestore() {
  if (!app) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY,
      }),
    });
  }
  return admin.firestore();
}

module.exports = { getFirestore, admin };
