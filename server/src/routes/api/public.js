// Unauthenticated carve-out, mounted BEFORE the authenticated /api router in
// app.js. Backs the public marketing/ site's pricing page, which has no
// Shopify session to authenticate with.

const express = require('express');
const { CREDIT_PACKS, UNLIMITED_PLAN, computeCreditsForAmount } = require('../../services/billingPacks');
const { ValidationError } = require('../../errors/AppError');

function createPublicApiRouter() {
  const router = express.Router();

  router.get('/pricing', (req, res) => {
    res.json({ packs: CREDIT_PACKS, unlimitedPlan: UNLIMITED_PLAN });
  });

  router.get('/pricing/preview', (req, res) => {
    const amountCents = Number(req.query.amountCents);
    if (!Number.isInteger(amountCents)) throw new ValidationError('amountCents must be an integer number of cents');
    res.json({ credits: computeCreditsForAmount(amountCents) });
  });

  router.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  return router;
}

module.exports = { createPublicApiRouter };
