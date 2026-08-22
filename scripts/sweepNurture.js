#!/usr/bin/env node
// Runs nurtureEmailService.runNurtureSweep() once and exits. One of three
// ways to trigger the same sweep — see server/src/routes/admin/sweeps.js for
// the ADMIN_API_KEY-gated HTTP endpoint. Usage: `npm run sweep:nurture`.

const { FieldValue } = require('firebase-admin/firestore');
const { getFirestore } = require('../server/src/config/firebase');
const { getShopify } = require('../server/src/config/shopify');
const { buildDependencies } = require('../server/src/container');

async function main() {
  const db = getFirestore();
  const shopify = getShopify({ db });
  const { nurtureEmailService } = buildDependencies({ db, FieldValue, shopify });

  const { results } = await nurtureEmailService.runNurtureSweep();
  const sent = results.reduce((sum, r) => sum + (r.sent?.length || 0), 0);
  const errors = results.filter((r) => r.error).length;
  // eslint-disable-next-line no-console
  console.log(`Nurture sweep processed ${results.length} shop(s): ${sent} email(s) sent, ${errors} error(s).`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Nurture sweep failed:', err);
  process.exit(1);
});
