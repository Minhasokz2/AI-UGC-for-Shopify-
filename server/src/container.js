// Assembles the full dependency graph app.js/routes need, via the `createX`
// factories every repo/service already exports — never their lazy getX()
// singletons, which each hard-wire the REAL Firestore/Shopify client. That
// means this file is the single place a `db`/`shopify` swap (real in
// server.js's boot, fake in test/helpers/buildTestApp.js) fans out to every
// route, instead of each route file needing to know how to construct its own
// dependencies.

const { env } = require('./config/env');

const { createJobsRepo } = require('./repos/jobsRepo');
const { createBatchesRepo } = require('./repos/batchesRepo');
const { createTemplatesRepo } = require('./repos/templatesRepo');
const { createAllowedModelsRepo } = require('./repos/allowedModelsRepo');
const { createProductsRepo } = require('./repos/productsRepo');
const { createShopsRepo } = require('./repos/shopsRepo');
const { createTransactionsRepo } = require('./repos/transactionsRepo');
const { createConversionJobsRepo } = require('./repos/conversionJobsRepo');
const { createConversionBatchesRepo } = require('./repos/conversionBatchesRepo');
const { createGoogleAuthStatesRepo } = require('./repos/googleAuthStatesRepo');
const { createUsedTrialEmailsRepo } = require('./repos/usedTrialEmailsRepo');
const { createBillingChargesRepo } = require('./repos/billingChargesRepo');
const { createReferralsRepo } = require('./repos/referralsRepo');
const { createImageOptimizerUsageRepo } = require('./repos/imageOptimizerUsageRepo');

const { createCreditsService } = require('./services/credits');
const { createPublishService } = require('./services/publishService');
const { createBillingService } = require('./services/billingService');
const { createBillingReconciliation } = require('./services/billingReconciliation');
const { createPartnerApiClient } = require('./services/partnerApiClient');
const { createReferralsService } = require('./services/referralsService');
const { createTrialCreditsService } = require('./services/trialCreditsService');
const { createImageOptimizerQuota } = require('./services/imageOptimizerQuota');
const { createImageOptimizerService } = require('./services/imageOptimizerService');
const { createNurtureEmailService } = require('./services/nurtureEmailService');
const { createWebhookHandlers } = require('./services/webhookHandlers');
const { seedAllowedModels } = require('./services/allowedModelsSeedData');
const { createJobWorker } = require('./workers/jobWorker');
const { createImageOptimizerWorker } = require('./workers/imageOptimizerWorker');

/**
 * @param {{ db: object, FieldValue: object, shopify: object, workerId?: string, cloudinaryService?: object, googleAuth?: object, brandStyle?: object, emailService?: object, logger?: object }} opts
 *   `shopify` is a getShopify()-shaped object: `.api.clients.Graphql` and
 *   `.config.sessionStorage` are both read from it. The four service
 *   overrides let tests swap in a mock without touching real SDKs; each
 *   defaults to the real module's exported functions. `workerId` identifies
 *   THIS process to the lease-claim mechanism — defaults to a value that's
 *   stable within the process but unique across a redeploy, so a route that
 *   fires enqueue() and this same process's worker agree on who's claiming.
 */
function buildDependencies({
  db,
  FieldValue,
  shopify,
  workerId = `pid-${process.pid}-${Date.now()}`,
  cloudinaryService = require('./services/cloudinaryService'),
  googleAuth = require('./services/googleAuth'),
  brandStyle = require('./services/brandStyle'),
  emailService = require('./services/emailService'),
  partnerApiClient = createPartnerApiClient({
    organizationId: env.SHOPIFY_PARTNER_ORGANIZATION_ID,
    accessToken: env.SHOPIFY_PARTNER_API_TOKEN,
  }),
  logger = require('./config/logger').logger,
}) {
  const jobsRepo = createJobsRepo({ db, FieldValue });
  const batchesRepo = createBatchesRepo({ db, FieldValue });
  const templatesRepo = createTemplatesRepo({ db, FieldValue });
  const allowedModelsRepo = createAllowedModelsRepo({ db, FieldValue });
  const productsRepo = createProductsRepo({ db, FieldValue });
  const shopsRepo = createShopsRepo({ db, FieldValue });
  const transactionsRepo = createTransactionsRepo({ db, FieldValue });
  const conversionJobsRepo = createConversionJobsRepo({ db, FieldValue });
  const conversionBatchesRepo = createConversionBatchesRepo({ db, FieldValue });
  const googleAuthStatesRepo = createGoogleAuthStatesRepo({ db, FieldValue });
  const usedTrialEmailsRepo = createUsedTrialEmailsRepo({ db, FieldValue });
  const billingChargesRepo = createBillingChargesRepo({ db, FieldValue });
  const referralsRepo = createReferralsRepo({ db, FieldValue });
  const imageOptimizerUsageRepo = createImageOptimizerUsageRepo({ db, FieldValue });

  const getGraphqlClient = (session) => new shopify.api.clients.Graphql({ session });
  const getSessionForShop = async (shopDomain) => {
    const sessions = await shopify.config.sessionStorage.findSessionsByShop(shopDomain);
    return sessions.find((s) => !s.isOnline) ?? sessions[0];
  };

  const credits = createCreditsService({ db, templatesRepo, allowedModelsRepo });
  const publishService = createPublishService({ jobsRepo, getGraphqlClient });
  const referralsService = createReferralsService({ shopsRepo, referralsRepo });
  const billingService = createBillingService({
    shopsRepo,
    billingChargesRepo,
    getGraphqlClient,
    partnerApiClient,
    referralsService,
    FieldValue,
  });
  const billingReconciliation = createBillingReconciliation({
    shopsRepo,
    billingService,
    getGraphqlClient,
    partnerApiClient,
    getSessionForShop,
    log: (fields, message) => logger.error(fields, message),
  });
  const trialCreditsService = createTrialCreditsService({ shopsRepo, usedTrialEmailsRepo, FieldValue });
  const imageOptimizerQuota = createImageOptimizerQuota({ imageOptimizerUsageRepo });
  const imageOptimizerService = createImageOptimizerService({ shopsRepo, conversionJobsRepo, imageOptimizerQuota });
  const nurtureEmailService = createNurtureEmailService({
    shopsRepo,
    emailService,
    log: (fields, message) => logger.error(fields, message),
  });
  const webhookHandlers = createWebhookHandlers({ shopsRepo, productsRepo, sessionStorage: shopify.config.sessionStorage });

  const jobWorker = createJobWorker({ jobsRepo, templatesRepo, allowedModelsRepo, credits, batchesRepo, workerId, logger });
  const imageOptimizerWorker = createImageOptimizerWorker({ conversionJobsRepo, imageOptimizerService, workerId, logger });

  return {
    db,
    FieldValue,
    jobsRepo,
    batchesRepo,
    templatesRepo,
    allowedModelsRepo,
    productsRepo,
    shopsRepo,
    transactionsRepo,
    conversionJobsRepo,
    conversionBatchesRepo,
    googleAuthStatesRepo,
    usedTrialEmailsRepo,
    billingChargesRepo,
    referralsRepo,
    imageOptimizerUsageRepo,
    credits,
    publishService,
    billingService,
    billingReconciliation,
    referralsService,
    trialCreditsService,
    imageOptimizerQuota,
    imageOptimizerService,
    nurtureEmailService,
    webhookHandlers,
    jobWorker,
    imageOptimizerWorker,
    cloudinaryService,
    googleAuth,
    brandStyle,
    seedAllowedModels,
    getGraphqlClient,
    getSessionForShop,
    returnUrlBase: env.SHOPIFY_APP_URL,
    shopify,
  };
}

module.exports = { buildDependencies };
