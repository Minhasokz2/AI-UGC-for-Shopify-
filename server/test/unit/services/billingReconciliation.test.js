const { createBillingReconciliation } = require('../../../src/services/billingReconciliation');

function makeDeps(overrides = {}) {
  return {
    shopsRepo: { listInstalledShops: vi.fn() },
    billingService: { grantCreditsForCharge: vi.fn().mockResolvedValue({ granted: true }) },
    getGraphqlClient: vi.fn(),
    getSessionForShop: vi.fn().mockResolvedValue({ shop: 'shop-a.myshopify.com', accessToken: 'tok' }),
    creditsForPack: vi.fn().mockReturnValue(600),
    log: vi.fn(),
    ...overrides,
  };
}

describe('services/billingReconciliation', () => {
  describe('reconcileShop', () => {
    it('skips a shop with no offline session', async () => {
      const deps = makeDeps({ getSessionForShop: vi.fn().mockResolvedValue(undefined) });
      const reconciliation = createBillingReconciliation(deps);

      const result = await reconciliation.reconcileShop({ id: 'shop-a.myshopify.com' });

      expect(result).toEqual(expect.objectContaining({ shopDomain: 'shop-a.myshopify.com', granted: 0, skipped: true }));
    });

    it('grants credits for each ACTIVE subscription using the subscription+period as the charge key', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [
                { id: 'gid://shopify/AppSubscription/1', name: 'MotionArt Growth (Monthly)', status: 'ACTIVE', currentPeriodEnd: '2026-09-01' },
              ],
            },
          },
        }),
      };
      const deps = makeDeps({ getGraphqlClient: () => client });
      const reconciliation = createBillingReconciliation(deps);

      const result = await reconciliation.reconcileShop({ id: 'shop-a.myshopify.com' });

      expect(deps.billingService.grantCreditsForCharge).toHaveBeenCalledWith('shop-a.myshopify.com', {
        chargeKey: 'gid://shopify/AppSubscription/1:2026-09-01',
        credits: 600,
        type: 'renewal',
      });
      expect(result).toEqual({ shopDomain: 'shop-a.myshopify.com', granted: 1, skipped: false });
    });

    it('ignores non-ACTIVE subscriptions and subscriptions with no known credit mapping', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [
                { id: 'sub-1', name: 'MotionArt Growth (Monthly)', status: 'CANCELLED', currentPeriodEnd: '2026-09-01' },
                { id: 'sub-2', name: 'Unknown Plan', status: 'ACTIVE', currentPeriodEnd: '2026-09-01' },
              ],
            },
          },
        }),
      };
      const deps = makeDeps({
        getGraphqlClient: () => client,
        creditsForPack: vi.fn().mockReturnValue(null),
      });
      const reconciliation = createBillingReconciliation(deps);

      const result = await reconciliation.reconcileShop({ id: 'shop-a.myshopify.com' });

      expect(deps.billingService.grantCreditsForCharge).not.toHaveBeenCalled();
      expect(result.granted).toBe(0);
    });

    it('does not increment granted when grantCreditsForCharge reports the charge was already claimed', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [{ id: 'sub-1', name: 'MotionArt Growth (Monthly)', status: 'ACTIVE', currentPeriodEnd: '2026-09-01' }],
            },
          },
        }),
      };
      const deps = makeDeps({
        getGraphqlClient: () => client,
        billingService: { grantCreditsForCharge: vi.fn().mockResolvedValue({ granted: false }) },
      });
      const reconciliation = createBillingReconciliation(deps);

      const result = await reconciliation.reconcileShop({ id: 'shop-a.myshopify.com' });

      expect(result.granted).toBe(0);
    });

    it('records an error and skips the shop when the GraphQL query itself rejects', async () => {
      const client = { request: vi.fn().mockRejectedValue(new Error('network down')) };
      const deps = makeDeps({ getGraphqlClient: () => client });
      const reconciliation = createBillingReconciliation(deps);

      const result = await reconciliation.reconcileShop({ id: 'shop-a.myshopify.com' });

      expect(result).toEqual(expect.objectContaining({ shopDomain: 'shop-a.myshopify.com', granted: 0, skipped: true, error: expect.any(Error) }));
      expect(deps.log).toHaveBeenCalled();
    });
  });

  describe('runReconciliationSweep', () => {
    it('walks every page of installed shops and reconciles each one', async () => {
      const shopsRepo = {
        listInstalledShops: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'a.myshopify.com', shopDomain: 'a.myshopify.com' }, { id: 'b.myshopify.com', shopDomain: 'b.myshopify.com' }])
          .mockResolvedValueOnce([]),
      };
      const client = { request: vi.fn().mockResolvedValue({ data: { currentAppInstallation: { activeSubscriptions: [] } } }) };
      const deps = makeDeps({ shopsRepo, getGraphqlClient: () => client });
      const reconciliation = createBillingReconciliation(deps);

      const { results } = await reconciliation.runReconciliationSweep({ pageSize: 2 });

      expect(results.map((r) => r.shopDomain)).toEqual(['a.myshopify.com', 'b.myshopify.com']);
      // A full page (length === pageSize) can't be known to be the last page, so
      // the loop always fetches one more page to confirm — here that's the empty
      // second page, hence 2 calls rather than 1.
      expect(shopsRepo.listInstalledShops).toHaveBeenCalledTimes(2);
    });

    it('a per-shop failure is captured in the results without aborting the sweep', async () => {
      const shopsRepo = {
        listInstalledShops: vi.fn().mockResolvedValueOnce([{ id: 'a.myshopify.com', shopDomain: 'a.myshopify.com' }]).mockResolvedValueOnce([]),
      };
      const deps = makeDeps({
        shopsRepo,
        getSessionForShop: vi.fn().mockRejectedValue(new Error('session lookup failed')),
      });
      const reconciliation = createBillingReconciliation(deps);

      const { results } = await reconciliation.runReconciliationSweep();

      expect(results).toHaveLength(1);
      expect(results[0].error).toBeInstanceOf(Error);
    });
  });
});
