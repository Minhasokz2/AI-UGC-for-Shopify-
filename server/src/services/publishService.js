// Publishes a job's approved result variations to a Shopify product via the
// `productSet` mutation (the modern replacement for the deprecated
// `productCreateMedia`). The idempotency/approval-recording work already
// happened in jobsRepo.claimPublish (same transaction as recording which
// variations were approved) — this module only owns the actual Shopify API
// call and translating its outcome back into a settle/release call.
//
// GraphQL shape verified directly against shopify.dev + the installed SDK
// rather than assumed:
//   productSet(input: ProductSetInput!, synchronous: Boolean = true): ProductSetPayload
//   ProductSetInput.files: [FileSetInput!]
//   FileSetInput { alt, contentType: FileContentType, duplicateResolutionMode, filename, id, originalSource }
// `synchronous: true` is passed so the mutation resolves media processing
// inline instead of returning a `productSetOperation` that must be polled.

const { PublishError } = require('../errors/AppError');

const PRODUCT_SET_MUTATION = `#graphql
  mutation publishGeneratedMedia($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product {
        id
        media(first: 25) {
          nodes {
            id
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEFAULT_MIN_THROTTLE_BUFFER = 50;

/**
 * @param {Array<{ url: string }>} resultVariations
 * @param {number[]} approvedVariationIndices
 * @param {{ isVideo?: boolean }} [opts]
 * @returns {Array<{ originalSource: string, contentType: 'IMAGE'|'VIDEO' }>}
 */
function buildFilesInput(resultVariations, approvedVariationIndices, { isVideo = false } = {}) {
  return approvedVariationIndices.map((index) => {
    const variation = resultVariations[index];
    if (!variation) {
      throw new Error(`publishService.js: approved index ${index} has no matching result variation`);
    }
    return {
      originalSource: variation.url,
      contentType: isVideo ? 'VIDEO' : 'IMAGE',
    };
  });
}

/**
 * @param {{ jobsRepo: object, getGraphqlClient: (session: object) => { request: Function } }} deps
 */
function createPublishService({ jobsRepo, getGraphqlClient }) {
  /**
   * @param {{ job: object, session: object, approvedVariationIndices: number[], shopifyProductId: string }} params
   */
  async function publishJob({ job, session, approvedVariationIndices, shopifyProductId }) {
    const claim = await jobsRepo.claimPublish(job.id, { approvedVariationIndices });
    if (!claim.claimed) {
      return {
        alreadyPublished: true,
        productId: claim.job.publishedProductId,
        mediaIds: claim.job.publishedMediaIds,
      };
    }

    const client = getGraphqlClient(session);
    const files = buildFilesInput(job.resultVariations, approvedVariationIndices, {
      isVideo: job.contentType === 'video',
    });

    let response;
    try {
      response = await client.request(PRODUCT_SET_MUTATION, {
        variables: { input: { id: shopifyProductId, files } },
      });
    } catch (err) {
      await jobsRepo.releasePublishClaim(job.id, { error: err });
      throw new PublishError(`Failed to publish to Shopify: ${err.message}`);
    }

    const userErrors = response.data?.productSet?.userErrors ?? [];
    if (response.errors || userErrors.length > 0) {
      const message =
        response.errors?.message || userErrors.map((e) => e.message).join('; ') || 'Unknown Shopify error';
      await jobsRepo.releasePublishClaim(job.id, { error: new Error(message) });
      throw new PublishError(message, userErrors);
    }

    const productId = response.data.productSet.product.id;
    const mediaIds = (response.data.productSet.product.media?.nodes ?? []).map((node) => node.id);
    await jobsRepo.finalizePublishSuccess(job.id, { productId, mediaIds });

    return { productId, mediaIds, throttleStatus: response.extensions?.cost?.throttleStatus };
  }

  return { publishJob };
}

/**
 * Pure helper for the bulk-publish loop: how long to wait before firing the
 * next mutation so the leaky-bucket rate limit isn't exceeded. Returns 0 when
 * there's already enough headroom (or no throttle status is available).
 * @param {{ currentlyAvailable?: number, restoreRate?: number }} [throttleStatus]
 * @param {{ minimumBuffer?: number }} [opts]
 * @returns {number} milliseconds to wait
 */
function computeThrottleWaitMs(throttleStatus, { minimumBuffer = DEFAULT_MIN_THROTTLE_BUFFER } = {}) {
  if (!throttleStatus) return 0;
  const { currentlyAvailable, restoreRate } = throttleStatus;
  if (currentlyAvailable == null || restoreRate == null || currentlyAvailable >= minimumBuffer) return 0;
  return Math.ceil(((minimumBuffer - currentlyAvailable) / restoreRate) * 1000);
}

let singleton;
/** Lazily builds the production singleton wired to the real Shopify GraphQL client. */
function getPublishService() {
  if (!singleton) {
    const { getJobsRepo } = require('../repos/jobsRepo');
    const { getShopify } = require('../config/shopify');
    singleton = createPublishService({
      jobsRepo: getJobsRepo(),
      getGraphqlClient: (session) => new (getShopify().api.clients.Graphql)({ session }),
    });
  }
  return singleton;
}

module.exports = { createPublishService, buildFilesInput, computeThrottleWaitMs, getPublishService };
