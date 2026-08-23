const { createBillingService } = require('../../../src/services/billingService');
const { CREDIT_PACKS } = require('../../../src/services/billingPacks');
const { PLAN_HANDLES } = require('../../../src/config/appPricingPlans');
const { FieldValue } = require('../../helpers/fakeFirestore');

const APP_GID = 'gid://shopify/App/1';
const SHOP_GID = 'gid://shopify/Shop/1';

function makeGraphqlClient() {
  return { request: vi.fn().mockResolvedValue({ data: { currentAppInstallation: { app: { id: APP_GID } }, shop: { id: SHOP_GID } } }) };
}

function makeDeps(overrides = {}) {
  return {
    shopsRepo: { updateShop: vi.fn().mockResolvedValue(undefined) },
    billingChargesRepo: { claimCharge: vi.fn().mockResolvedValue({ claimed: true }) },
    getGraphqlClient: () => makeGraphqlClient(),
    partnerApiClient: { getActiveSubscription: vi.fn().mockResolvedValue(null) },
    FieldValue,
    ...overrides,
  };
}

describe('services/billingService', () => {
  describe('getPricingPlansUrl', () => {
    it('builds the Shopify-hosted pricing plan page URL from the shop domain and the app\'s handle', () => {
      const service = createBillingService(makeDeps());
      expect(service.getPricingPlansUrl('my-store.myshopify.com')).toBe(
        'https://admin.shopify.com/store/my-store/charges/ai-ugc-gen-96a0b97f/pricing_plans',
      );
    });
  });

  describe('confirmAppPricingPlan', () => {
    it('returns confirmed:false without granting anything for an unrecognized plan handle', async () => {
      const service = createBillingService(makeDeps());

      const result = await service.confirmAppPricingPlan({}, { shopDomain: 'shop-a.myshopify.com', planHandle: 'not-a-real-handle' });

      expect(result).toEqual({ confirmed: false, reason: 'unknown_plan_handle' });
    });

    it('returns confirmed:false when the Partner API reports no active subscription — never trusts the client-supplied plan_handle alone', async () => {
      const growthHandle = 'growth-monthly-handle';
      PLAN_HANDLES.growth.monthly = growthHandle;
      try {
        const partnerApiClient = { getActiveSubscription: vi.fn().mockResolvedValue(null) };
        const service = createBillingService(makeDeps({ partnerApiClient }));

        const result = await service.confirmAppPricingPlan({}, { shopDomain: 'shop-a.myshopify.com', planHandle: growthHandle });

        expect(result).toEqual({ confirmed: false, reason: 'no_matching_active_subscription' });
      } finally {
        PLAN_HANDLES.growth.monthly = null;
      }
    });

    it('returns confirmed:false when the active subscription\'s items don\'t include the claimed handle', async () => {
      const growthHandle = 'growth-monthly-handle';
      PLAN_HANDLES.growth.monthly = growthHandle;
      try {
        const partnerApiClient = {
          getActiveSubscription: vi.fn().mockResolvedValue({
            currentBillingCycle: { startTime: '2026-01-01T00:00:00Z' },
            items: [{ handle: 'some-other-handle' }],
          }),
        };
        const service = createBillingService(makeDeps({ partnerApiClient }));

        const result = await service.confirmAppPricingPlan({}, { shopDomain: 'shop-a.myshopify.com', planHandle: growthHandle });

        expect(result).toEqual({ confirmed: false, reason: 'no_matching_active_subscription' });
      } finally {
        PLAN_HANDLES.growth.monthly = null;
      }
    });

    it('grants the pack\'s credits once the Partner API confirms a matching active subscription', async () => {
      const growth = CREDIT_PACKS.find((p) => p.id === 'growth');
      const growthHandle = 'growth-monthly-handle';
      PLAN_HANDLES.growth.monthly = growthHandle;
      try {
        const partnerApiClient = {
          getActiveSubscription: vi.fn().mockResolvedValue({
            currentBillingCycle: { startTime: '2026-01-01T00:00:00Z' },
            items: [{ handle: growthHandle }],
          }),
        };
        const billingChargesRepo = { claimCharge: vi.fn().mockResolvedValue({ claimed: true }) };
        const shopsRepo = { updateShop: vi.fn().mockResolvedValue(undefined) };
        const service = createBillingService(makeDeps({ partnerApiClient, billingChargesRepo, shopsRepo }));

        const result = await service.confirmAppPricingPlan({}, { shopDomain: 'shop-a.myshopify.com', planHandle: growthHandle });

        expect(result).toEqual({ confirmed: true, granted: true });
        expect(billingChargesRepo.claimCharge).toHaveBeenCalledWith(
          `app-pricing:${growthHandle}:2026-01-01T00:00:00Z`,
          { shopDomain: 'shop-a.myshopify.com', credits: growth.monthlyCredits, type: 'subscription' },
        );
        expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a.myshopify.com', { creditBalance: expect.anything() });
      } finally {
        PLAN_HANDLES.growth.monthly = null;
      }
    });

    it('is idempotent — confirming the same billing cycle twice grants credits only once', async () => {
      const growthHandle = 'growth-monthly-handle';
      PLAN_HANDLES.growth.monthly = growthHandle;
      try {
        const partnerApiClient = {
          getActiveSubscription: vi.fn().mockResolvedValue({
            currentBillingCycle: { startTime: '2026-01-01T00:00:00Z' },
            items: [{ handle: growthHandle }],
          }),
        };
        let claimed = false;
        const billingChargesRepo = {
          claimCharge: vi.fn().mockImplementation(() => {
            const result = { claimed: !claimed };
            claimed = true;
            return Promise.resolve(result);
          }),
        };
        const service = createBillingService(makeDeps({ partnerApiClient, billingChargesRepo }));

        const first = await service.confirmAppPricingPlan({}, { shopDomain: 'shop-a.myshopify.com', planHandle: growthHandle });
        const second = await service.confirmAppPricingPlan({}, { shopDomain: 'shop-a.myshopify.com', planHandle: growthHandle });

        expect(first).toEqual({ confirmed: true, granted: true });
        expect(second).toEqual({ confirmed: true, granted: false });
      } finally {
        PLAN_HANDLES.growth.monthly = null;
      }
    });

    it('activates the Unlimited plan (no credit grant) once confirmed', async () => {
      const unlimitedHandle = 'unlimited-handle';
      PLAN_HANDLES.unlimited.monthly = unlimitedHandle;
      try {
        const partnerApiClient = {
          getActiveSubscription: vi.fn().mockResolvedValue({
            currentBillingCycle: { startTime: '2026-01-01T00:00:00Z' },
            items: [{ handle: unlimitedHandle }],
          }),
        };
        const shopsRepo = { updateShop: vi.fn().mockResolvedValue(undefined) };
        const service = createBillingService(makeDeps({ partnerApiClient, shopsRepo }));

        const result = await service.confirmAppPricingPlan({}, { shopDomain: 'shop-a.myshopify.com', planHandle: unlimitedHandle });

        expect(result).toEqual({ confirmed: true, plan: 'unlimited' });
        expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a.myshopify.com', { plan: 'unlimited', unlimitedPlanHandle: unlimitedHandle });
      } finally {
        PLAN_HANDLES.unlimited.monthly = null;
      }
    });
  });

  describe('grantCreditsForCharge', () => {
    it('grants credits and increments the shop balance when the charge claim succeeds', async () => {
      const shopsRepo = { updateShop: vi.fn().mockResolvedValue(undefined) };
      const billingChargesRepo = { claimCharge: vi.fn().mockResolvedValue({ claimed: true }) };
      const service = createBillingService(makeDeps({ shopsRepo, billingChargesRepo }));

      const result = await service.grantCreditsForCharge('shop-a', { chargeKey: 'charge-1', credits: 200, type: 'one_time' });

      expect(result).toEqual({ granted: true });
      expect(billingChargesRepo.claimCharge).toHaveBeenCalledWith('charge-1', { shopDomain: 'shop-a', credits: 200, type: 'one_time' });
      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a', { creditBalance: expect.anything() });
    });

    it('is a no-op when the charge was already claimed (double-fire protection)', async () => {
      const shopsRepo = { updateShop: vi.fn() };
      const billingChargesRepo = { claimCharge: vi.fn().mockResolvedValue({ claimed: false }) };
      const service = createBillingService(makeDeps({ shopsRepo, billingChargesRepo }));

      const result = await service.grantCreditsForCharge('shop-a', { chargeKey: 'charge-1', credits: 200, type: 'renewal' });

      expect(result).toEqual({ granted: false });
      expect(shopsRepo.updateShop).not.toHaveBeenCalled();
    });
  });

  describe('activateUnlimitedPlan / deactivateUnlimitedPlan', () => {
    it('activateUnlimitedPlan sets plan to unlimited and records the plan handle', async () => {
      const shopsRepo = { updateShop: vi.fn().mockResolvedValue(undefined) };
      const service = createBillingService(makeDeps({ shopsRepo }));

      await service.activateUnlimitedPlan('shop-a', 'unlimited-handle');

      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a', { plan: 'unlimited', unlimitedPlanHandle: 'unlimited-handle' });
    });

    it('deactivateUnlimitedPlan reverts plan to metered and clears the plan handle', async () => {
      const shopsRepo = { updateShop: vi.fn().mockResolvedValue(undefined) };
      const service = createBillingService(makeDeps({ shopsRepo }));

      await service.deactivateUnlimitedPlan('shop-a');

      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a', { plan: 'metered', unlimitedPlanHandle: null });
    });
  });
});
