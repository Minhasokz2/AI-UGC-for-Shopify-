const {
  createPublishService,
  buildFilesInput,
  computeThrottleWaitMs,
} = require('../../../src/services/publishService');
const { PublishError } = require('../../../src/errors/AppError');

function makeJobsRepo(overrides = {}) {
  return {
    claimPublish: vi.fn().mockResolvedValue({ claimed: true }),
    finalizePublishSuccess: vi.fn().mockResolvedValue(undefined),
    releasePublishClaim: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('services/publishService', () => {
  describe('buildFilesInput', () => {
    const resultVariations = [{ url: 'https://cdn/0.png' }, { url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }];

    it('maps approved indices to FileSetInput shapes with contentType IMAGE by default', () => {
      expect(buildFilesInput(resultVariations, [0, 2])).toEqual([
        { originalSource: 'https://cdn/0.png', contentType: 'IMAGE' },
        { originalSource: 'https://cdn/2.png', contentType: 'IMAGE' },
      ]);
    });

    it('uses contentType VIDEO when isVideo is set', () => {
      expect(buildFilesInput(resultVariations, [1], { isVideo: true })).toEqual([
        { originalSource: 'https://cdn/1.png', contentType: 'VIDEO' },
      ]);
    });

    it('throws for an approved index with no matching variation', () => {
      expect(() => buildFilesInput(resultVariations, [99])).toThrow(/no matching result variation/);
    });
  });

  describe('computeThrottleWaitMs', () => {
    it('returns 0 when there is no throttle status', () => {
      expect(computeThrottleWaitMs(undefined)).toBe(0);
    });

    it('returns 0 when currentlyAvailable already covers the buffer', () => {
      expect(computeThrottleWaitMs({ currentlyAvailable: 100, restoreRate: 50 }, { minimumBuffer: 50 })).toBe(0);
    });

    it('computes a positive wait proportional to the shortfall and restore rate', () => {
      // Need 50, have 0, restore 25/s -> 50/25 = 2s -> 2000ms
      expect(computeThrottleWaitMs({ currentlyAvailable: 0, restoreRate: 25 }, { minimumBuffer: 50 })).toBe(2000);
    });
  });

  describe('createPublishService.publishJob', () => {
    const job = {
      id: 'job-1',
      contentType: 'scene',
      resultVariations: [{ url: 'https://cdn/0.png' }, { url: 'https://cdn/1.png' }],
    };
    const session = { shop: 'shop.myshopify.com' };

    it('returns alreadyPublished without calling the GraphQL client when the claim is not granted', async () => {
      const jobsRepo = makeJobsRepo({
        claimPublish: vi.fn().mockResolvedValue({
          claimed: false,
          alreadyPublished: true,
          job: { publishedProductId: 'gid://shopify/Product/1', publishedMediaIds: ['gid://shopify/MediaImage/1'] },
        }),
      });
      const client = { request: vi.fn() };
      const service = createPublishService({ jobsRepo, getGraphqlClient: () => client });

      const result = await service.publishJob({ job, session, approvedVariationIndices: [0], shopifyProductId: 'gid://shopify/Product/1' });

      expect(result).toEqual({
        alreadyPublished: true,
        productId: 'gid://shopify/Product/1',
        mediaIds: ['gid://shopify/MediaImage/1'],
      });
      expect(client.request).not.toHaveBeenCalled();
    });

    it('publishes successfully: calls productSet with the built files input, finalizes, and returns the productId/mediaIds/throttleStatus', async () => {
      const jobsRepo = makeJobsRepo();
      const throttleStatus = { maximumAvailable: 1000, currentlyAvailable: 900, restoreRate: 50 };
      const client = {
        request: vi.fn().mockResolvedValue({
          data: {
            productSet: {
              product: { id: 'gid://shopify/Product/1', media: { nodes: [{ id: 'gid://shopify/MediaImage/1' }] } },
              userErrors: [],
            },
          },
          extensions: { cost: { throttleStatus } },
        }),
      };
      const service = createPublishService({ jobsRepo, getGraphqlClient: () => client });

      const result = await service.publishJob({
        job,
        session,
        approvedVariationIndices: [0, 1],
        shopifyProductId: 'gid://shopify/Product/1',
      });

      expect(jobsRepo.claimPublish).toHaveBeenCalledWith('job-1', { approvedVariationIndices: [0, 1] });
      expect(client.request).toHaveBeenCalledWith(
        expect.stringContaining('productSet'),
        {
          variables: {
            input: {
              id: 'gid://shopify/Product/1',
              files: [
                { originalSource: 'https://cdn/0.png', contentType: 'IMAGE' },
                { originalSource: 'https://cdn/1.png', contentType: 'IMAGE' },
              ],
            },
          },
        },
      );
      expect(jobsRepo.finalizePublishSuccess).toHaveBeenCalledWith('job-1', {
        productId: 'gid://shopify/Product/1',
        mediaIds: ['gid://shopify/MediaImage/1'],
      });
      expect(jobsRepo.releasePublishClaim).not.toHaveBeenCalled();
      expect(result).toEqual({
        productId: 'gid://shopify/Product/1',
        mediaIds: ['gid://shopify/MediaImage/1'],
        throttleStatus,
      });
    });

    it('releases the claim and throws PublishError when the GraphQL request itself rejects', async () => {
      const jobsRepo = makeJobsRepo();
      const client = { request: vi.fn().mockRejectedValue(new Error('network down')) };
      const service = createPublishService({ jobsRepo, getGraphqlClient: () => client });

      await expect(
        service.publishJob({ job, session, approvedVariationIndices: [0], shopifyProductId: 'gid://shopify/Product/1' }),
      ).rejects.toBeInstanceOf(PublishError);

      expect(jobsRepo.releasePublishClaim).toHaveBeenCalledWith('job-1', { error: expect.any(Error) });
      expect(jobsRepo.finalizePublishSuccess).not.toHaveBeenCalled();
    });

    it('releases the claim and throws PublishError when the response carries userErrors', async () => {
      const jobsRepo = makeJobsRepo();
      const client = {
        request: vi.fn().mockResolvedValue({
          data: { productSet: { product: null, userErrors: [{ field: ['files', '0'], message: 'Invalid image URL' }] } },
        }),
      };
      const service = createPublishService({ jobsRepo, getGraphqlClient: () => client });

      await expect(
        service.publishJob({ job, session, approvedVariationIndices: [0], shopifyProductId: 'gid://shopify/Product/1' }),
      ).rejects.toThrow(/Invalid image URL/);

      expect(jobsRepo.releasePublishClaim).toHaveBeenCalled();
      expect(jobsRepo.finalizePublishSuccess).not.toHaveBeenCalled();
    });

    it('releases the claim and throws PublishError when the response carries top-level errors', async () => {
      const jobsRepo = makeJobsRepo();
      const client = {
        request: vi.fn().mockResolvedValue({
          errors: { message: 'Throttled' },
          data: undefined,
        }),
      };
      const service = createPublishService({ jobsRepo, getGraphqlClient: () => client });

      await expect(
        service.publishJob({ job, session, approvedVariationIndices: [0], shopifyProductId: 'gid://shopify/Product/1' }),
      ).rejects.toThrow(/Throttled/);

      expect(jobsRepo.releasePublishClaim).toHaveBeenCalled();
    });
  });
});
