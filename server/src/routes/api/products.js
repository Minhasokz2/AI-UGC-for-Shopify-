// Catalog sync: pulls the shop's products from Shopify's Admin GraphQL API
// into the local `products` cache (repos/productsRepo.js), which the
// ProductPicker component reads from instead of hitting Shopify on every
// keystroke. NOTE: the exact field availability of `images` vs `media` on
// Product can shift between API versions — re-verify this query against the
// live Admin API GraphQL schema for CURRENT_API_VERSION before relying on it
// against a real store; `images` is used here as the long-established,
// still-supported field as of this build.
//
// Confirmed directly against the installed @shopify/shopify-api source
// (lib/clients/admin/graphql/client.ts): Shopify's cost-based throttling
// returns HTTP 200 with a `THROTTLED` GraphQL error, and the SDK's own
// GraphqlClient.request() THROWS a GraphqlQueryError for that instead of
// returning it as data — with NO automatic retry (its `retries` option only
// retries actual HTTP 429/503 responses, which this never is). So the only
// way to survive a THROTTLED page mid-sync is to catch it here ourselves.

const express = require('express');
const { GraphqlQueryError } = require('@shopify/shopify-api');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { ShopifyApiError } = require('../../errors/AppError');
const { computeThrottleWaitMs } = require('../../services/publishService');

const SYNC_PRODUCTS_QUERY = `#graphql
  query syncProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      nodes {
        id
        title
        productType
        images(first: 5) {
          nodes { url }
        }
      }
      pageInfo { hasNextPage, endCursor }
    }
  }
`;

const MAX_SYNC_PAGES = 20; // hard cap (~1000 products) so a single sync request can't run unbounded
const MAX_THROTTLE_RETRIES = 3;
const FALLBACK_THROTTLE_WAIT_MS = 2000; // used only if Shopify's error response doesn't carry a usable throttleStatus

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottledError(err) {
  if (!(err instanceof GraphqlQueryError)) return false;
  const code = err.body?.errors?.graphQLErrors?.[0]?.extensions?.code;
  return code === 'THROTTLED' || /throttled/i.test(err.message || '');
}

/**
 * Retries a single page fetch on a THROTTLED GraphQL error (see file header —
 * the SDK itself never retries this case). Any other error is rethrown
 * immediately for the route's own catch block to turn into a ShopifyApiError.
 */
async function requestWithThrottleRetry(client, query, options) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await client.request(query, options);
    } catch (err) {
      if (!isThrottledError(err) || attempt >= MAX_THROTTLE_RETRIES) throw err;
      const throttleStatus = err.body?.extensions?.cost?.throttleStatus;
      // computeThrottleWaitMs legitimately returns 0 when the bucket already
      // has headroom — that's a real "retry now", not "no data", so the
      // fallback only applies when Shopify gave us no throttleStatus at all.
      const waitMs = throttleStatus ? computeThrottleWaitMs(throttleStatus) : FALLBACK_THROTTLE_WAIT_MS;
      // eslint-disable-next-line no-await-in-loop
      await sleep(waitMs);
    }
  }
}

/**
 * @param {{ productsRepo: object, getGraphqlClient: Function }} deps
 */
function createProductsRouter({ productsRepo, getGraphqlClient }) {
  const router = express.Router();

  router.post(
    '/sync',
    wrapAsync(async (req, res) => {
      const client = getGraphqlClient(res.locals.shopify.session);
      let cursor;
      let syncedCount = 0;

      try {
        for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const response = await requestWithThrottleRetry(client, SYNC_PRODUCTS_QUERY, { variables: { cursor } });
          const { nodes, pageInfo } = response.data.products;

          // eslint-disable-next-line no-await-in-loop
          await Promise.all(
            nodes.map((node) =>
              productsRepo.upsertProduct({
                shopDomain: req.shopDomain,
                shopifyProductId: node.id,
                title: node.title,
                imageUrls: node.images.nodes.map((img) => img.url),
                category: node.productType || null,
              }),
            ),
          );
          syncedCount += nodes.length;

          if (!pageInfo.hasNextPage) break;
          cursor = pageInfo.endCursor;

          // A large catalog can burn through the GraphQL cost bucket across
          // several back-to-back pages faster than it restores even with the
          // retry above absorbing an occasional THROTTLED page — pacing
          // proactively avoids hitting it at all. Same helper the
          // bulk-publish path uses.
          // eslint-disable-next-line no-await-in-loop
          await sleep(computeThrottleWaitMs(response.extensions?.cost?.throttleStatus));
        }
      } catch (err) {
        throw new ShopifyApiError(`Failed to sync products: ${err.message}`);
      }

      res.json({ syncedCount });
    }),
  );

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const { search, limit, cursor } = req.query;
      const products = await productsRepo.queryByShop({
        shopDomain: req.shopDomain,
        search,
        limit: limit ? Number(limit) : undefined,
        cursor,
      });
      res.json({ products });
    }),
  );

  return router;
}

module.exports = { createProductsRouter, SYNC_PRODUCTS_QUERY };
