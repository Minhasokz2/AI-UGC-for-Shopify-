// Billing surface: pack listing/preview (read-only, safe to call anytime),
// subscribe/purchase (kick off a Shopify-hosted charge, return the
// confirmationUrl the frontend redirects to), and confirm (called by the
// frontend once the merchant returns from Shopify's own confirmation page,
// per the returnUrl passed at subscribe/purchase time — re-queries the
// charge's actual status/amount from Shopify rather than trusting anything
// client-supplied, then grants credits/activates the plan exactly once via
// billingService.grantCreditsForCharge's idempotent claim).
//
// NOTE: this round-trip (subscribe -> Shopify's hosted confirmation page ->
// confirm) cannot be exercised end-to-end without a real dev store and a
// live Partner-approved app — flagged in the README as a required manual
// verification step.

const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { CREDIT_PACKS, UNLIMITED_PLAN, computeCreditsForAmount } = require('../../services/billingPacks');
const { ValidationError, NotFoundError } = require('../../errors/AppError');

const CONFIRM_CHARGE_QUERY = `#graphql
  query confirmCharge($id: ID!) {
    node(id: $id) {
      ... on AppSubscription { id name status }
      ... on AppPurchaseOneTime { id name status price { amount currencyCode } }
    }
  }
`;

const subscribeSchema = z.object({ packId: z.string(), period: z.enum(['monthly', 'annual']).default('monthly') });
const customPurchaseSchema = z.object({ amountCents: z.number().int() });
const confirmSchema = z.object({ chargeId: z.string() });

/**
 * @param {{ billingService: object, shopsRepo: object, getGraphqlClient: Function, returnUrlBase: string }} deps
 */
function createBillingRouter({ billingService, shopsRepo, getGraphqlClient, returnUrlBase }) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({
      plan: req.shop.plan,
      creditBalance: req.shop.creditBalance,
      lifetimeCreditsSpent: req.shop.lifetimeCreditsSpent,
      lifetimeImagesGenerated: req.shop.lifetimeImagesGenerated,
    });
  });

  router.get('/packs', (req, res) => {
    res.json({ packs: CREDIT_PACKS, unlimitedPlan: UNLIMITED_PLAN });
  });

  router.get('/custom-purchase/preview', (req, res) => {
    const amountCents = Number(req.query.amountCents);
    if (!Number.isInteger(amountCents)) throw new ValidationError('amountCents must be an integer number of cents');
    res.json({ credits: computeCreditsForAmount(amountCents) });
  });

  router.post(
    '/subscribe',
    wrapAsync(async (req, res) => {
      const { packId, period } = subscribeSchema.parse(req.body);
      const result = await billingService.createPackSubscription(res.locals.shopify.session, {
        packId,
        period,
        returnUrl: `${returnUrlBase}/billing`,
      });
      res.json(result);
    }),
  );

  router.post(
    '/subscribe-unlimited',
    wrapAsync(async (req, res) => {
      const result = await billingService.createUnlimitedSubscription(res.locals.shopify.session, {
        returnUrl: `${returnUrlBase}/billing`,
      });
      res.json(result);
    }),
  );

  router.post(
    '/custom-purchase',
    wrapAsync(async (req, res) => {
      const { amountCents } = customPurchaseSchema.parse(req.body);
      const result = await billingService.createCustomPurchase(res.locals.shopify.session, {
        amountCents,
        returnUrl: `${returnUrlBase}/billing`,
      });
      res.json(result);
    }),
  );

  router.post(
    '/confirm',
    wrapAsync(async (req, res) => {
      const { chargeId } = confirmSchema.parse(req.body);
      const client = getGraphqlClient(res.locals.shopify.session);
      const response = await client.request(CONFIRM_CHARGE_QUERY, { variables: { id: chargeId } });
      const node = response.data?.node;
      if (!node) throw new NotFoundError('Charge not found');

      if (node.status !== 'ACTIVE') {
        res.json({ confirmed: false, status: node.status });
        return;
      }

      if (node.name.includes(UNLIMITED_PLAN.label)) {
        await billingService.activateUnlimitedPlan(req.shopDomain, node.id);
        res.json({ confirmed: true, plan: 'unlimited' });
        return;
      }

      const pack = CREDIT_PACKS.find((p) => node.name.includes(p.label));
      if (pack) {
        const period = node.name.includes('Annual') ? 'annual' : 'monthly';
        const credits = period === 'annual' ? pack.annualCredits : pack.monthlyCredits;
        const result = await billingService.grantCreditsForCharge(req.shopDomain, { chargeKey: node.id, credits, type: 'subscription' });
        res.json({ confirmed: true, ...result });
        return;
      }

      if (node.price) {
        const credits = computeCreditsForAmount(Math.round(Number(node.price.amount) * 100));
        const result = await billingService.grantCreditsForCharge(req.shopDomain, { chargeKey: node.id, credits, type: 'one_time' });
        res.json({ confirmed: true, ...result });
        return;
      }

      throw new ValidationError(`Could not resolve charge "${node.name}" to a known pack or amount`);
    }),
  );

  return router;
}

module.exports = { createBillingRouter, CONFIRM_CHARGE_QUERY };
