const express = require('express');
const { CREDIT_PACKS, UNLIMITED_PLAN, revenuePerCreditCents } = require('../../services/billingPacks');

function createPricingConfigRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    const packs = CREDIT_PACKS.map((pack) => ({
      ...pack,
      monthlyRevenuePerCreditCents: revenuePerCreditCents(pack, 'monthly'),
      annualRevenuePerCreditCents: revenuePerCreditCents(pack, 'annual'),
    }));
    res.json({ packs, unlimitedPlan: UNLIMITED_PLAN });
  });

  return router;
}

module.exports = { createPricingConfigRouter };
