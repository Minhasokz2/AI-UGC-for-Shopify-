#!/usr/bin/env node
// Runs billingReconciliation.runReconciliationSweep() once and exits. Catches
// silent subscription renewals (Shopify does not fire APP_SUBSCRIPTIONS_UPDATE
// on routine successful renewal — see server/src/services/billingReconciliation.js).
// This is one of three ways to trigger the same sweep — see
// server/src/routes/admin/sweeps.js for the ADMIN_API_KEY-gated HTTP endpoint
// a free external pinger can hit instead. Usage: `npm run sweep:billing`.

const { FieldValue } = require('firebase-admin/firestore');
const { getFirestore } = require('../server/src/config/firebase');
const { getShopify } = require('../server/src/config/shopify');
const { buildDependencies } = require('../server/src/container');

async function main() {
  const db = getFirestore();
  const shopify = getShopify({ db });
  const { billingReconciliation } = buildDependencies({ db, FieldValue, shopify });

  const { results } = await billingReconciliation.runReconciliationSweep();
  const granted = results.reduce((sum, r) => sum + (r.granted || 0), 0);
  const errors = results.filter((r) => r.error).length;
  // eslint-disable-next-line no-console
  console.log(`Billing reconciliation swept ${results.length} shop(s): ${granted} credit grant(s), ${errors} error(s).`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Billing reconciliation sweep failed:', err);
  process.exit(1);
});
