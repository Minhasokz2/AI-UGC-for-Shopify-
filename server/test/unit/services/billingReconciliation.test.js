const { createBillingReconciliation } = require('../../../src/services/billingReconciliation');
const { CREDIT_PACKS } = require('../../../src/services/billingPacks');
const { PLAN_HANDLES } = require('../../../src/config/appPricingPlans');

const APP_GID = 'gid://shopify/App/1';
const SHOP_GID = 'gid://shopify/Shop/1';

function makeGraphqlClient() {
  return { request: vi.fn().mockResolvedValue({ data: { currentAppInstallation: { app: { id: APP_GID } }, shop: { id: SHOP_GID } } }) };
}

function makeDeps(overrides = {}) {
  return {
    shopsRepo: { listInstalledShops: vi.fn().mockResolvedValue([]) },
    billingService: {
      grantCreditsForCharge: vi.fn().mockResolvedValue({ granted: true }),
      activateUnlimitedPlan: vi.fn().mockResolvedValue(undefined),
      deactivateUnlimitedPlan: vi.fn().mockResolvedValue(undefined),
    },
    getGraphqlClient: () => makeGraphqlClient(),
    partnerApiClient: { getActiveSubscription: vi.fn().mockResolvedValue(null) },
    getSessionForShop: vi.fn().mockResolvedValue({ id: 'session-1' }),
    ...overrides,
  };
}

describe('services/billingReconciliation', () => {
  describe('reconcileShop', () => {
    it('skips a shop with no stored session', async () => {
      const deps = makeDeps({ getSessionForShop: vi.fn().mockResolvedValue(undefined) });
      const reconciliation = createBillingReconciliation(deps);

      const result = await reconciliation.reconcileShop({ shopDomain: 'shop-a.myshopify.com' });

      expect(result).toEqual({ shopDomain: 'shop-a.myshopify.com', granted: 0, skipped: true, reason: 'no_session' });
    });

    it('grants a pack\'s MONTHLY renewal for an item whose handle matches a configured plan and billingPeriod is EVERY_30_DAYS', async () => {
      const growth = CREDIT_PACKS.find((p) => p.id === 'growth');
      const growthHandle = 'growth-handle';
      const original = PLAN_HANDLES.growth;
      PLAN_HANDLES.growth = growthHandle;
      try {
        const partnerApiClient = {
          getActiveSubscription: vi.fn().mockResolvedValue({
            billingPeriod: 'EVERY_30_DAYS',
            currentBillingCycle: { startTime: '2026-02-01T00:00:00Z' },
            items: [{ handle: growthHandle }],
          }),
        };
        const billingService = {
          grantCreditsForCharge: vi.fn().mockResolvedValue({ granted: true }),
          activateUnlimitedPlan: vi.fn(),
          deactivateUnlimitedPlan: vi.fn(),
        };
        const reconciliation = createBillingReconciliation(makeDeps({ partnerApiClient, billingService }));

        const result = await reconciliation.reconcileShop({ shopDomain: 'shop-a.myshopify.com', plan: 'metered' });

        expect(billingService.grantCreditsForCharge).toHaveBeenCalledWith('shop-a.myshopify.com', {
          chargeKey: `app-pricing:${growthHandle}:2026-02-01T00:00:00Z`,
          credits: growth.monthlyCredits,
          type: 'renewal',
        });
        expect(result).toEqual({ shopDomain: 'shop-a.myshopify.com', granted: 1, skipped: false });
      } finally {
        PLAN_HANDLES.growth = original;
      }
    });

    it('grants a pack\'s ANNUAL renewal when billingPeriod is ANNUAL — same handle as monthly', async () => {
      const growth = CREDIT_PACKS.find((p) => p.id === 'growth');
      const growthHandle = 'growth-handle';
      const original = PLAN_HANDLES.growth;
      PLAN_HANDLES.growth = growthHandle;
      try {
        const partnerApiClient = {
          getActiveSubscription: vi.fn().mockResolvedValue({
            billingPeriod: 'ANNUAL',
            currentBillingCycle: { startTime: '2026-02-01T00:00:00Z' },
            items: [{ handle: growthHandle }],
          }),
        };
        const billingService = {
          grantCreditsForCharge: vi.fn().mockResolvedValue({ granted: true }),
          activateUnlimitedPlan: vi.fn(),
          deactivateUnlimitedPlan: vi.fn(),
        };
        const reconciliation = createBillingReconciliation(makeDeps({ partnerApiClient, billingService }));

        await reconciliation.reconcileShop({ shopDomain: 'shop-a.myshopify.com', plan: 'metered' });

        expect(billingService.grantCreditsForCharge).toHaveBeenCalledWith('shop-a.myshopify.com', {
          chargeKey: `app-pricing:${growthHandle}:2026-02-01T00:00:00Z`,
          credits: growth.annualCredits,
          type: 'renewal',
        });
      } finally {
        PLAN_HANDLES.growth = original;
      }
    });

    it('activates the Unlimited plan for a matching item, without granting credits', async () => {
      const unlimitedHandle = 'unlimited-handle';
      const original = PLAN_HANDLES.unlimited;
      PLAN_HANDLES.unlimited = unlimitedHandle;
      try {
        const partnerApiClient = {
          getActiveSubscription: vi.fn().mockResolvedValue({
            billingPeriod: 'EVERY_30_DAYS',
            currentBillingCycle: { startTime: '2026-02-01T00:00:00Z' },
            items: [{ handle: unlimitedHandle }],
          }),
        };
        const billingService = {
          grantCreditsForCharge: vi.fn(),
          activateUnlimitedPlan: vi.fn().mockResolvedValue(undefined),
          deactivateUnlimitedPlan: vi.fn(),
        };
        const reconciliation = createBillingReconciliation(makeDeps({ partnerApiClient, billingService }));

        const result = await reconciliation.reconcileShop({ shopDomain: 'shop-a.myshopify.com', plan: 'metered' });

        expect(billingService.activateUnlimitedPlan).toHaveBeenCalledWith('shop-a.myshopify.com', unlimitedHandle, 'EVERY_30_DAYS');
        expect(billingService.grantCreditsForCharge).not.toHaveBeenCalled();
        expect(result.granted).toBe(0);
      } finally {
        PLAN_HANDLES.unlimited = original;
      }
    });

    it('reverts a churned Unlimited-plan shop to metered when there is no active subscription anymore', async () => {
      const billingService = {
        grantCreditsForCharge: vi.fn(),
        activateUnlimitedPlan: vi.fn(),
        deactivateUnlimitedPlan: vi.fn().mockResolvedValue(undefined),
      };
      const partnerApiClient = { getActiveSubscription: vi.fn().mockResolvedValue(null) };
      const reconciliation = createBillingReconciliation(makeDeps({ partnerApiClient, billingService }));

      await reconciliation.reconcileShop({ shopDomain: 'shop-a.myshopify.com', plan: 'unlimited' });

      expect(billingService.deactivateUnlimitedPlan).toHaveBeenCalledWith('shop-a.myshopify.com');
    });

    it('does nothing when there is no active subscription and the shop is already metered', async () => {
      const billingService = {
        grantCreditsForCharge: vi.fn(),
        activateUnlimitedPlan: vi.fn(),
        deactivateUnlimitedPlan: vi.fn(),
      };
      const partnerApiClient = { getActiveSubscription: vi.fn().mockResolvedValue(null) };
      const reconciliation = createBillingReconciliation(makeDeps({ partnerApiClient, billingService }));

      await reconciliation.reconcileShop({ shopDomain: 'shop-a.myshopify.com', plan: 'metered' });

      expect(billingService.deactivateUnlimitedPlan).not.toHaveBeenCalled();
    });

    it('records the error and does not throw when the Partner API call fails', async () => {
      const partnerApiClient = { getActiveSubscription: vi.fn().mockRejectedValue(new Error('boom')) };
      const reconciliation = createBillingReconciliation(makeDeps({ partnerApiClient }));

      const result = await reconciliation.reconcileShop({ shopDomain: 'shop-a.myshopify.com' });

      expect(result.skipped).toBe(true);
      expect(result.error).toBeInstanceOf(Error);
    });
  });

  describe('runReconciliationSweep', () => {
    it('walks every installed shop and continues past a per-shop failure', async () => {
      const shopsRepo = {
        listInstalledShops: vi
          .fn()
          .mockResolvedValueOnce([{ shopDomain: 'shop-a.myshopify.com' }, { shopDomain: 'shop-b.myshopify.com' }])
          .mockResolvedValueOnce([]),
      };
      const getSessionForShop = vi
        .fn()
        .mockResolvedValueOnce(undefined) // shop-a: no session, skipped
        .mockResolvedValueOnce({ id: 'session-b' }); // shop-b: proceeds
      const partnerApiClient = { getActiveSubscription: vi.fn().mockResolvedValue(null) };
      const reconciliation = createBillingReconciliation(makeDeps({ shopsRepo, getSessionForShop, partnerApiClient }));

      const { results } = await reconciliation.runReconciliationSweep();

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ shopDomain: 'shop-a.myshopify.com', granted: 0, skipped: true, reason: 'no_session' });
      expect(results[1].shopDomain).toBe('shop-b.myshopify.com');
    });
  });
});
