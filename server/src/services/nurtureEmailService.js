// Lifecycle nurture emails. Render's free tier has no Cron Job service, so —
// like billingReconciliation.js — this is a plain function, `runNurtureSweep()`,
// invocable three ways that all run this same code: a local CLI script, an
// ADMIN_API_KEY-gated HTTP endpoint a free external pinger can hit, or a future
// paid Render Cron Job.
//
// Each campaign fires at most once per shop, ever — tracked via
// `shop.nurtureEmailsSent.<campaignKey>` (a Firestore Timestamp), written with
// a dot-path field update so unrelated campaign flags are never clobbered.
// There is no "resend after N days" cooldown model here; every campaign below
// is a one-time nudge, not a recurring digest.

const { FREE_TRIAL_CREDITS } = require('../config/constants');

const ONBOARDING_NUDGE_DELAY_HOURS = 24;
// Mirrors the frontend's LOW_CREDITS_THRESHOLD concept (web/src/hooks/useLowCreditsToast.js)
// without needing to import it — the two are allowed to diverge slightly since
// one is an in-app toast and the other is an email, not a single shared contract.
const LOW_CREDITS_EMAIL_THRESHOLD = Math.floor(FREE_TRIAL_CREDITS / 2);

/** @param {import('firebase-admin/firestore').Timestamp|undefined} timestamp */
function hoursSince(timestamp, now) {
  if (!timestamp?.toMillis) return Infinity;
  return (now.getTime() - timestamp.toMillis()) / (60 * 60 * 1000);
}

const NURTURE_CAMPAIGNS = [
  {
    key: 'onboarding_nudge',
    shouldSend: (shop, now) => !shop.firstJobCreatedAt && hoursSince(shop.installedAt, now) >= ONBOARDING_NUDGE_DELAY_HOURS,
    subject: "Let's generate your first AI product photo",
    buildHtml: () =>
      '<p>Your MotionArt trial credits are ready. Pick a product from your catalog and generate your first scene in under a minute.</p>',
  },
  {
    key: 'low_credits_reminder',
    shouldSend: (shop) => shop.plan === 'metered' && !!shop.firstJobCreatedAt && (shop.creditBalance ?? 0) <= LOW_CREDITS_EMAIL_THRESHOLD,
    subject: 'Your MotionArt credits are running low',
    buildHtml: (shop) =>
      `<p>You have ${shop.creditBalance ?? 0} credit(s) left. Top up or upgrade your plan to keep generating.</p>`,
  },
];

/**
 * @param {{ shopsRepo: object, emailService: object, campaigns?: Array, log?: Function }} deps
 */
function createNurtureEmailService({ shopsRepo, emailService, campaigns = NURTURE_CAMPAIGNS, log = () => {} }) {
  /**
   * Evaluates every campaign against one shop, sending and recording any that
   * newly qualify. A shop with no verified email is skipped (there's nowhere to
   * send to) but the sweep still moves on rather than erroring.
   * @returns {Promise<{ shopDomain: string, sent: string[] }>}
   */
  async function processShop(shop, now) {
    const shopDomain = shop.id ?? shop.shopDomain;
    const alreadySent = shop.nurtureEmailsSent ?? {};
    const sent = [];

    for (const campaign of campaigns) {
      if (alreadySent[campaign.key]) continue;
      if (!campaign.shouldSend(shop, now)) continue;
      if (!shop.verifiedEmail) continue;

      // eslint-disable-next-line no-await-in-loop
      await emailService.sendEmail({
        to: shop.verifiedEmail,
        subject: campaign.subject,
        html: campaign.buildHtml(shop),
      });
      // eslint-disable-next-line no-await-in-loop
      await shopsRepo.updateShop(shopDomain, { [`nurtureEmailsSent.${campaign.key}`]: now });
      sent.push(campaign.key);
    }

    return { shopDomain, sent };
  }

  /**
   * Walks every installed shop, paginated, running every campaign against each.
   * A per-shop failure never aborts the sweep.
   * @returns {Promise<{ results: Array }>}
   */
  async function runNurtureSweep({ pageSize = 100, now = new Date() } = {}) {
    const results = [];
    let cursor;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await shopsRepo.listInstalledShops({ cursor, limit: pageSize });
      if (page.length === 0) break;

      for (const shop of page) {
        // eslint-disable-next-line no-await-in-loop
        const result = await processShop(shop, now).catch((err) => {
          log({ level: 'error', shopDomain: shop.id, err }, 'nurtureEmailService: failed to process shop');
          return { shopDomain: shop.id, sent: [], error: err };
        });
        results.push(result);
      }

      if (page.length < pageSize) break;
      cursor = page[page.length - 1].shopDomain;
    }
    return { results };
  }

  return { processShop, runNurtureSweep };
}

let singleton;
/** Lazily builds the production singleton wired to real Firestore/Resend. */
function getNurtureEmailService() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const emailService = require('./emailService');
    const { logger } = require('../config/logger');
    singleton = createNurtureEmailService({
      shopsRepo: getShopsRepo(),
      emailService,
      log: (fields, message) => logger.error(fields, message),
    });
  }
  return singleton;
}

module.exports = { createNurtureEmailService, getNurtureEmailService, NURTURE_CAMPAIGNS };
