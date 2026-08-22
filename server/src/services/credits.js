// Credit cost resolution + the pre-flight balance check. This is the
// `recomputeCost` dependency jobsRepo.settleJobSuccess calls INSIDE its own
// settlement transaction (see repos/jobsRepo.js's factory doc comment) — never
// trusting a job-creation-time cached cost estimate, only ever the template/
// model record's CURRENT creditCost, re-read at the moment of settlement.

const { NotFoundError, InsufficientCreditsError, ValidationError } = require('../errors/AppError');

const TEMPLATES_COLLECTION = 'templates';
const ALLOWED_MODELS_COLLECTION = 'allowed_models';

/**
 * @param {{ db: object, templatesRepo: object, allowedModelsRepo: object }} opts
 */
function createCreditsService({ db, templatesRepo, allowedModelsRepo }) {
  const templatesCol = db.collection(TEMPLATES_COLLECTION);
  const allowedModelsCol = db.collection(ALLOWED_MODELS_COLLECTION);

  /**
   * Reuses the CALLER's transaction (jobsRepo.settleJobSuccess's own `tx`) —
   * never starts a new one, since Firestore transactions can't be nested.
   * Cost is per-image, multiplied by the job's numImages.
   * @param {object} tx an in-flight Firestore transaction
   * @param {object} job
   * @returns {Promise<number>}
   */
  async function recomputeCost(tx, job) {
    const numImages = job.numImages ?? 1;
    if (job.templateId) {
      const snap = await tx.get(templatesCol.doc(job.templateId));
      if (!snap.exists) throw new NotFoundError(`Template ${job.templateId} not found`);
      return snap.data().creditCost * numImages;
    }
    if (job.modelId) {
      const snap = await tx.get(allowedModelsCol.doc(job.modelId));
      if (!snap.exists) throw new NotFoundError(`Model ${job.modelId} not found`);
      return snap.data().creditCost * numImages;
    }
    throw new ValidationError('Job has neither templateId nor modelId — cannot determine its cost');
  }

  /**
   * Non-transactional estimate for the job-creation route's pre-flight balance
   * check and the merchant-facing cost display — NEVER the value trusted at
   * settlement (recomputeCost re-reads independently, inside the settlement
   * transaction, specifically so a price change between creation and
   * completion can't be exploited or misapplied).
   * @param {{ templateId?: string, modelId?: string, numImages?: number }} params
   * @returns {Promise<number>}
   */
  async function estimateJobCost({ templateId, modelId, numImages = 1 }) {
    if (templateId) {
      const template = await templatesRepo.getTemplate(templateId);
      if (!template) throw new NotFoundError(`Template ${templateId} not found`);
      return template.creditCost * numImages;
    }
    if (modelId) {
      const model = await allowedModelsRepo.getModel(modelId);
      if (!model) throw new NotFoundError(`Model ${modelId} not found`);
      return model.creditCost * numImages;
    }
    throw new ValidationError('Must provide either templateId or modelId to estimate cost');
  }

  /**
   * Pre-flight check at job creation. Unlimited-plan shops always pass. Throws
   * InsufficientCreditsError (402) rather than returning a boolean, since every
   * call site wants to short-circuit the request identically.
   * @param {{ plan?: string, creditBalance?: number }} shop
   * @param {number} requiredCredits
   */
  function assertSufficientCredits(shop, requiredCredits) {
    if (shop.plan === 'unlimited') return;
    const balance = shop.creditBalance ?? 0;
    if (balance < requiredCredits) {
      throw new InsufficientCreditsError(requiredCredits, balance);
    }
  }

  return { recomputeCost, estimateJobCost, assertSufficientCredits };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore + repos. */
function getCreditsService() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { getTemplatesRepo } = require('../repos/templatesRepo');
    const { getAllowedModelsRepo } = require('../repos/allowedModelsRepo');
    singleton = createCreditsService({
      db: getFirestore(),
      templatesRepo: getTemplatesRepo(),
      allowedModelsRepo: getAllowedModelsRepo(),
    });
  }
  return singleton;
}

module.exports = { createCreditsService, getCreditsService };
