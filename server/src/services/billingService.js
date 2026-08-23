// Shopify Billing API orchestration. Two purchase paths exist:
//  - Credit packs (Starter/Growth/Scale, monthly or annual) and the Unlimited
//    plan are recurring app subscriptions -> `appSubscriptionCreate`.
//  - A custom any-dollar-amount credit top-up is a one-time purchase ->
//    `appPurchaseOneTimeCreate`.
// Both mutations are public-app-only and return a `confirmationUrl` the
// merchant must be redirected to approve the charge on Shopify's own page —
// this module only builds the mutation input and calls it; the route layer
// handles the redirect.
//
// Crediting a shop only happens once a charge is ACTIVE (subscription) or
// confirmed (one-time). Because Shopify does NOT fire APP_SUBSCRIPTIONS_UPDATE
// on routine successful monthly auto-renewal (confirmed via shopify.dev), the
// same `grantCreditsForCharge` entry point below is used both by the
// initial-activation callback route AND by billingReconciliation.js's periodic
// poll — billingChargesRepo.claimCharge makes a double-fire from those two call
// sites a no-op instead of a double-grant.

const { CREDIT_PACKS, UNLIMITED_PLAN, computeCreditsForAmount } = require('./billingPacks');
const { ValidationError, PublishError } = require('../errors/AppError');

const APP_SUBSCRIPTION_CREATE_MUTATION = `#graphql
  mutation createAppSubscription($name: String!, $returnUrl: URL!, $test: Boolean, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: $lineItems) {
      appSubscription { id }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

const APP_PURCHASE_ONE_TIME_CREATE_MUTATION = `#graphql
  mutation createOneTimePurchase($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
      appPurchaseOneTime { id }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

// Shopify rejects a REAL (non-test) charge outright against a Partner
// development store — "test" here must reflect the CONNECTED SHOP, never the
// server's own NODE_ENV. A live, production-hosted server is routinely used
// to test against dev stores (this is exactly that case), so tying it to
// server environment produces a hard 403 on every dev-store subscribe
// attempt while never actually testing the real-charge path either.
const SHOP_PLAN_QUERY = `#graphql
  query shopPlan {
    shop {
      plan { partnerDevelopment }
    }
  }
`;

/**
 * @param {{ id: string, label: string }} pack
 * @param {'monthly'|'annual'} period
 * @param {{ returnUrl: string, test: boolean }} opts
 */
function buildSubscriptionInput(pack, period, { returnUrl, test }) {
  const priceCents = period === 'annual' ? pack.annualPriceCents : pack.monthlyPriceCents;
  return {
    name: `AI UGC Generator ${pack.label} (${period === 'annual' ? 'Annual' : 'Monthly'})`,
    returnUrl,
    test,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: (priceCents / 100).toFixed(2), currencyCode: 'USD' },
            interval: period === 'annual' ? 'ANNUAL' : 'EVERY_30_DAYS',
          },
        },
      },
    ],
  };
}

/** @param {{ returnUrl: string, test: boolean }} opts */
function buildUnlimitedSubscriptionInput({ returnUrl, test }) {
  return {
    name: `AI UGC Generator ${UNLIMITED_PLAN.label}`,
    returnUrl,
    test,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: (UNLIMITED_PLAN.monthlyPriceCents / 100).toFixed(2), currencyCode: 'USD' },
            interval: 'EVERY_30_DAYS',
          },
        },
      },
    ],
  };
}

/** @param {{ amountCents: number, returnUrl: string, test: boolean }} opts */
function buildOneTimePurchaseInput({ amountCents, returnUrl, test }) {
  return {
    name: `AI UGC Generator custom credit top-up ($${(amountCents / 100).toFixed(2)})`,
    price: { amount: (amountCents / 100).toFixed(2), currencyCode: 'USD' },
    returnUrl,
    test,
  };
}

function extractUserErrors(payload) {
  return payload?.userErrors ?? [];
}

/**
 * @param {{ shopsRepo: object, billingChargesRepo: object, getGraphqlClient: Function, FieldValue: object }} deps
 */
function createBillingService({ shopsRepo, billingChargesRepo, getGraphqlClient, FieldValue }) {
  async function request(session, mutation, variables) {
    const client = getGraphqlClient(session);
    const response = await client.request(mutation, { variables });
    return response.data;
  }

  /**
   * Whether the CONNECTED SHOP is a Shopify Partner development store —
   * Shopify's Billing API hard-rejects a real (test:false) charge against
   * one, so this is checked fresh per request rather than assumed from
   * server config.
   */
  async function isTestShop(session) {
    const data = await request(session, SHOP_PLAN_QUERY, {});
    return Boolean(data?.shop?.plan?.partnerDevelopment);
  }

  /**
   * Starts a recurring subscription for a credit pack. Returns the
   * confirmationUrl the merchant must be redirected to.
   */
  async function createPackSubscription(session, { packId, period = 'monthly', returnUrl }) {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) throw new ValidationError(`Unknown credit pack "${packId}"`);

    const test = await isTestShop(session);
    const input = buildSubscriptionInput(pack, period, { returnUrl, test });
    const data = await request(session, APP_SUBSCRIPTION_CREATE_MUTATION, input);
    const userErrors = extractUserErrors(data?.appSubscriptionCreate);
    if (userErrors.length > 0) {
      throw new PublishError(userErrors.map((e) => e.message).join('; '), userErrors);
    }
    return {
      subscriptionId: data.appSubscriptionCreate.appSubscription.id,
      confirmationUrl: data.appSubscriptionCreate.confirmationUrl,
      pack,
      period,
    };
  }

  /** Starts the flat-rate Unlimited plan subscription. */
  async function createUnlimitedSubscription(session, { returnUrl }) {
    const test = await isTestShop(session);
    const input = buildUnlimitedSubscriptionInput({ returnUrl, test });
    const data = await request(session, APP_SUBSCRIPTION_CREATE_MUTATION, input);
    const userErrors = extractUserErrors(data?.appSubscriptionCreate);
    if (userErrors.length > 0) {
      throw new PublishError(userErrors.map((e) => e.message).join('; '), userErrors);
    }
    return {
      subscriptionId: data.appSubscriptionCreate.appSubscription.id,
      confirmationUrl: data.appSubscriptionCreate.confirmationUrl,
    };
  }

  /** Starts a one-time purchase for a custom credit top-up amount. */
  async function createCustomPurchase(session, { amountCents, returnUrl }) {
    computeCreditsForAmount(amountCents); // throws ValidationError below MIN_CUSTOM_PURCHASE_CENTS BEFORE any real charge is created
    const test = await isTestShop(session);
    const input = buildOneTimePurchaseInput({ amountCents, returnUrl, test });
    const data = await request(session, APP_PURCHASE_ONE_TIME_CREATE_MUTATION, input);
    const userErrors = extractUserErrors(data?.appPurchaseOneTimeCreate);
    if (userErrors.length > 0) {
      throw new PublishError(userErrors.map((e) => e.message).join('; '), userErrors);
    }
    return {
      purchaseId: data.appPurchaseOneTimeCreate.appPurchaseOneTime.id,
      confirmationUrl: data.appPurchaseOneTimeCreate.confirmationUrl,
    };
  }

  /**
   * Grants credits for a claimed charge, exactly once per `chargeKey` — the
   * shared entry point for both the post-approval callback route and
   * billingReconciliation.js's renewal poll (see file header). A no-op if this
   * chargeKey was already processed.
   * @returns {Promise<{ granted: boolean }>}
   */
  async function grantCreditsForCharge(shopDomain, { chargeKey, credits, type }) {
    const claim = await billingChargesRepo.claimCharge(chargeKey, { shopDomain, credits, type });
    if (!claim.claimed) return { granted: false };
    await shopsRepo.updateShop(shopDomain, { creditBalance: FieldValue.increment(credits) });
    return { granted: true };
  }

  /** Marks a shop as being on the Unlimited plan once its subscription is active. */
  async function activateUnlimitedPlan(shopDomain, subscriptionId) {
    await shopsRepo.updateShop(shopDomain, { plan: 'unlimited', unlimitedSubscriptionId: subscriptionId });
  }

  /** Reverts a shop to the metered plan on subscription cancellation/decline. */
  async function deactivateUnlimitedPlan(shopDomain) {
    await shopsRepo.updateShop(shopDomain, { plan: 'metered', unlimitedSubscriptionId: null });
  }

  return {
    createPackSubscription,
    createUnlimitedSubscription,
    createCustomPurchase,
    grantCreditsForCharge,
    activateUnlimitedPlan,
    deactivateUnlimitedPlan,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Shopify GraphQL client. */
function getBillingService() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getBillingChargesRepo } = require('../repos/billingChargesRepo');
    const { getShopify } = require('../config/shopify');
    const { env } = require('../config/env');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createBillingService({
      shopsRepo: getShopsRepo(),
      billingChargesRepo: getBillingChargesRepo(),
      getGraphqlClient: (session) => new (getShopify().api.clients.Graphql)({ session }),
      isTestCharge: env.NODE_ENV !== 'production',
      FieldValue,
    });
  }
  return singleton;
}

module.exports = {
  createBillingService,
  getBillingService,
  buildSubscriptionInput,
  buildUnlimitedSubscriptionInput,
  buildOneTimePurchaseInput,
};
