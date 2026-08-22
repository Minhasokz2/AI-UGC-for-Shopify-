// Catalog sync: pulls the shop's products from Shopify's Admin GraphQL API
// into the local `products` cache (repos/productsRepo.js), which the
// ProductPicker component reads from instead of hitting Shopify on every
// keystroke. NOTE: the exact field availability of `images` vs `media` on
// Product can shift between API versions — re-verify this query against the
// live Admin API GraphQL schema for CURRENT_API_VERSION before relying on it
// against a real store; `images` is used here as the long-established,
// still-supported field as of this build.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

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

      for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await client.request(SYNC_PRODUCTS_QUERY, { variables: { cursor } });
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
