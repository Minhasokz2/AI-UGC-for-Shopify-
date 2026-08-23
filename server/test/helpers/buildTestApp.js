// Builds the real Express app (via src/app.js + src/container.js) wired to a
// fake Firestore and fake Shopify/external clients, so integration tests
// exercise the actual route/middleware wiring without touching any real
// network or credential. No supertest call in a test using this helper ever
// leaves the process.

const express = require('express');
const { createApp } = require('../../src/app');
const { buildDependencies } = require('../../src/container');
const { createFakeFirestore, FieldValue } = require('./fakeFirestore');

/**
 * A minimal stand-in for the object `shopifyApp()` returns — only the surface
 * app.js/container.js actually touch: `.validateAuthenticatedSession()`,
 * `.ensureInstalledOnShop()`, `.processWebhooks()`, `.api.clients.Graphql`,
 * `.config.sessionStorage`.
 *
 * @param {{ session?: object|null, graphqlHandler?: Function, sessionStorage?: object }} opts
 *   `session` is what validateAuthenticatedSession's fake sets on
 *   res.locals.shopify.session — pass `null` to simulate no authenticated
 *   session (a 401 from the real SDK middleware isn't reproduced here; tests
 *   needing that should call attachShopContext directly instead — see its
 *   own unit tests). `graphqlHandler(operation, options, session)` backs
 *   every `.clients.Graphql` instance's `.request()` call.
 */
function createFakeShopify({ session = { shop: 'test-shop.myshopify.com', accessToken: 'fake-token', isOnline: false }, graphqlHandler, sessionStorage } = {}) {
  class FakeGraphqlClient {
    constructor({ session: clientSession }) {
      this.session = clientSession;
    }

    async request(operation, options) {
      if (!graphqlHandler) return { data: {} };
      return graphqlHandler(operation, options, this.session);
    }
  }

  return {
    validateAuthenticatedSession: () => (req, res, next) => {
      if (!session) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No session' } });
        return;
      }
      res.locals.shopify = { ...res.locals.shopify, session };
      next();
    },
    ensureInstalledOnShop: () => (req, res, next) => next(),
    processWebhooks: ({ webhookHandlers }) => [
      express.json(),
      async (req, res) => {
        const topic = req.headers['x-shopify-topic'];
        const shop = req.headers['x-shopify-shop-domain'];
        const handler = webhookHandlers[topic];
        if (!handler) {
          res.status(404).end();
          return;
        }
        await handler.callback(topic, shop, JSON.stringify(req.body), 'test-webhook-id', '2026-07');
        res.status(200).end();
      },
    ],
    api: { clients: { Graphql: FakeGraphqlClient } },
    config: { sessionStorage: sessionStorage || { findSessionsByShop: async () => [] } },
  };
}

/**
 * @param {{ shopify?: object, cloudinaryService?: object, googleAuth?: object, brandStyle?: object, emailService?: object, partnerApiClient?: object, jobWorker?: object, imageOptimizerWorker?: object }} [overrides]
 * @returns {{ app: object, db: object, deps: object }}
 */
function buildTestApp(overrides = {}) {
  const db = createFakeFirestore();
  const shopify = overrides.shopify || createFakeShopify();

  const deps = buildDependencies({
    db,
    FieldValue,
    shopify,
    cloudinaryService: overrides.cloudinaryService,
    googleAuth: overrides.googleAuth,
    brandStyle: overrides.brandStyle,
    emailService: overrides.emailService,
    // Defaults to a stub reporting no active subscription — never a real
    // Partner API call from a test. Pass a fake to exercise the confirm/
    // reconciliation paths that actually check subscription status.
    partnerApiClient: overrides.partnerApiClient || { getActiveSubscription: async () => null },
  });

  // Real workers make real outbound calls to fal.ai/WaveSpeed/etc as soon as
  // a job-creation route fires jobWorker.enqueue() — never appropriate for a
  // test, which has no live credentials and must never touch the network.
  // Defaulted to inert no-ops here; a test asserting on worker behavior
  // passes its own `jobWorker`/`imageOptimizerWorker` override (see
  // test/unit/workers/*.test.js for that lower-level, non-HTTP coverage).
  deps.jobWorker = overrides.jobWorker || { enqueue: async () => {}, processJob: async () => {}, resumeFromFirestore: async () => 0 };
  deps.imageOptimizerWorker = overrides.imageOptimizerWorker || { enqueue: async () => {}, processJob: async () => {}, resumeFromFirestore: async () => 0 };

  const app = createApp(deps);
  return { app, db, deps };
}

module.exports = { buildTestApp, createFakeShopify };
