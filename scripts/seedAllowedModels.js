#!/usr/bin/env node
// Seeds server/src/services/allowedModelsSeedData.js's ALLOWED_MODELS catalog
// into Firestore's `allowed_models` collection. Insert-if-missing — safe to
// re-run after adding new models to the catalog; never overwrites an
// existing admin-edited model doc. Usage: `npm run seed:models`.

const { getFirestore } = require('../server/src/config/firebase');
const { seedAllowedModels } = require('../server/src/services/allowedModelsSeedData');

async function main() {
  const db = getFirestore();
  const result = await seedAllowedModels({ db });
  // eslint-disable-next-line no-console
  console.log(`Seeded allowed_models: ${result.created} created, ${result.skipped} already existed (${result.total} total).`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed allowed models:', err);
  process.exit(1);
});
