// Thin client for Shopify's Partner API — the only way to read a merchant's
// Shopify App Pricing subscription status (the classic Admin API's
// currentAppInstallation.activeSubscriptions doesn't see App Pricing
// subscriptions at all; confirmed against shopify.dev's App Pricing docs).

const ACTIVE_SUBSCRIPTION_QUERY = `#graphql
  query ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      billingPeriod
      currentBillingCycle { startTime endTime }
      items { handle description }
    }
  }
`;

/**
 * @param {{ organizationId: string, accessToken: string, apiVersion?: string, fetchImpl?: Function }} opts
 */
function createPartnerApiClient({ organizationId, accessToken, apiVersion = '2026-07', fetchImpl = fetch }) {
  async function request(query, variables) {
    const response = await fetchImpl(`https://partners.shopify.com/${organizationId}/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query, variables }),
    });
    const body = await response.json();
    if (body.errors?.length) {
      throw new Error(`Partner API error: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    return body.data;
  }

  /**
   * @param {{ appId: string, shopId: string }} ids both full GIDs (gid://shopify/App/... , gid://shopify/Shop/...)
   * @returns {Promise<object|null>} null when the shop has no active Shopify App Pricing subscription
   */
  async function getActiveSubscription({ appId, shopId }) {
    const data = await request(ACTIVE_SUBSCRIPTION_QUERY, { appId, shopId });
    return data.activeSubscription;
  }

  return { getActiveSubscription };
}

let singleton;
/** Lazily builds the production singleton. Throws at first use (not at boot) if unconfigured. */
function getPartnerApiClient() {
  if (!singleton) {
    const { env } = require('../config/env');
    if (!env.SHOPIFY_PARTNER_API_TOKEN || !env.SHOPIFY_PARTNER_ORGANIZATION_ID) {
      throw new Error('SHOPIFY_PARTNER_API_TOKEN and SHOPIFY_PARTNER_ORGANIZATION_ID must be set to check Shopify App Pricing subscription status');
    }
    singleton = createPartnerApiClient({
      organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID,
      accessToken: env.SHOPIFY_PARTNER_API_TOKEN,
    });
  }
  return singleton;
}

module.exports = { createPartnerApiClient, getPartnerApiClient, ACTIVE_SUBSCRIPTION_QUERY };
