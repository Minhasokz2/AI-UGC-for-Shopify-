#!/usr/bin/env node
// Seeds server/src/services/templatesSeedData.js's starter template catalog
// into Firestore's `templates` collection. Insert-if-missing — safe to
// re-run; never overwrites an existing admin-edited template. Usage:
// `npm run seed:templates`.

const { getFirestore } = require('../server/src/config/firebase');
const { seedTemplates } = require('../server/src/services/templatesSeedData');

async function main() {
  const db = getFirestore();
  const result = await seedTemplates({ db });
  // eslint-disable-next-line no-console
  console.log(`Seeded templates: ${result.created} created, ${result.skipped} already existed (${result.total} total).`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed templates:', err);
  process.exit(1);
});
