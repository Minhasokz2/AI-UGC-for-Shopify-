const {
  createBillingService,
  buildSubscriptionInput,
  buildUnlimitedSubscriptionInput,
  buildOneTimePurchaseInput,
} = require('../../../src/services/billingService');
const { CREDIT_PACKS, UNLIMITED_PLAN } = require('../../../src/services/billingPacks');
const { ValidationError, PublishError } = require('../../../src/errors/AppError');
const { FieldValue } = require('../../helpers/fakeFirestore');

function makeDeps(overrides = {}) {
  return {
    shopsRepo: { updateShop: vi.fn().mockResolvedValue(undefined) },
    billingChargesRepo: { claimCharge: vi.fn().mockResolvedValue({ claimed: true }) },
    getGraphqlClient: vi.fn(),
    isTestCharge: true,
    FieldValue,
    ...overrides,
  };
}

describe('services/billingService', () => {
  describe('pure input builders', () => {
    it('buildSubscriptionInput uses the monthly price/interval by default', () => {
      const pack = CREDIT_PACKS.find((p) => p.id === 'growth');
      const input = buildSubscriptionInput(pack, 'monthly', { returnUrl: 'https://x/return', test: true });
      expect(input.lineItems[0].plan.appRecurringPricingDetails.interval).toBe('EVERY_30_DAYS');
      expect(input.lineItems[0].plan.appRecurringPricingDetails.price).toEqual({ amount: '49.00', currencyCode: 'USD' });
      expect(input.test).toBe(true);
    });

    it('buildSubscriptionInput switches to the annual price/interval', () => {
      const pack = CREDIT_PACKS.find((p) => p.id === 'growth');
      const input = buildSubscriptionInput(pack, 'annual', { returnUrl: 'https://x/return', test: false });
      expect(input.lineItems[0].plan.appRecurringPricingDetails.interval).toBe('ANNUAL');
      expect(input.lineItems[0].plan.appRecurringPricingDetails.price.amount).toBe('490.00');
    });

    it('buildUnlimitedSubscriptionInput prices the flat Unlimited plan', () => {
      const input = buildUnlimitedSubscriptionInput({ returnUrl: 'https://x/return', test: true });
      expect(input.lineItems[0].plan.appRecurringPricingDetails.price.amount).toBe(
        (UNLIMITED_PLAN.monthlyPriceCents / 100).toFixed(2),
      );
    });

    it('buildOneTimePurchaseInput prices a custom top-up amount', () => {
      const input = buildOneTimePurchaseInput({ amountCents: 1234, returnUrl: 'https://x/return', test: true });
      expect(input.price).toEqual({ amount: '12.34', currencyCode: 'USD' });
    });
  });

  describe('createPackSubscription', () => {
    it('throws ValidationError for an unknown pack id', async () => {
      const service = createBillingService(makeDeps());
      await expect(
        service.createPackSubscription({ shop: 's' }, { packId: 'not-a-pack', returnUrl: 'https://x' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('calls appSubscriptionCreate and returns the confirmationUrl/subscriptionId on success', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: {
            appSubscriptionCreate: {
              appSubscription: { id: 'gid://shopify/AppSubscription/1' },
              confirmationUrl: 'https://admin.shopify.com/confirm/1',
              userErrors: [],
            },
          },
        }),
      };
      const service = createBillingService(makeDeps({ getGraphqlClient: () => client }));

      const result = await service.createPackSubscription({ shop: 's' }, { packId: 'starter', returnUrl: 'https://x/return' });

      expect(client.request).toHaveBeenCalledWith(
        expect.stringContaining('appSubscriptionCreate'),
        expect.objectContaining({ variables: expect.objectContaining({ returnUrl: 'https://x/return' }) }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          subscriptionId: 'gid://shopify/AppSubscription/1',
          confirmationUrl: 'https://admin.shopify.com/confirm/1',
        }),
      );
    });

    it('throws PublishError when the mutation returns userErrors', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: { appSubscriptionCreate: { appSubscription: null, confirmationUrl: null, userErrors: [{ field: [], message: 'Invalid plan' }] } },
        }),
      };
      const service = createBillingService(makeDeps({ getGraphqlClient: () => client }));

      await expect(
        service.createPackSubscription({ shop: 's' }, { packId: 'starter', returnUrl: 'https://x/return' }),
      ).rejects.toBeInstanceOf(PublishError);
    });
  });

  describe('createUnlimitedSubscription', () => {
    it('calls appSubscriptionCreate for the flat-rate plan', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: {
            appSubscriptionCreate: {
              appSubscription: { id: 'gid://shopify/AppSubscription/2' },
              confirmationUrl: 'https://admin.shopify.com/confirm/2',
              userErrors: [],
            },
          },
        }),
      };
      const service = createBillingService(makeDeps({ getGraphqlClient: () => client }));

      const result = await service.createUnlimitedSubscription({ shop: 's' }, { returnUrl: 'https://x/return' });

      expect(result.subscriptionId).toBe('gid://shopify/AppSubscription/2');
    });
  });

  describe('createCustomPurchase', () => {
    it('calls appPurchaseOneTimeCreate and returns the confirmationUrl/purchaseId', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: {
            appPurchaseOneTimeCreate: {
              appPurchaseOneTime: { id: 'gid://shopify/AppPurchaseOneTime/1' },
              confirmationUrl: 'https://admin.shopify.com/confirm/3',
              userErrors: [],
            },
          },
        }),
      };
      const service = createBillingService(makeDeps({ getGraphqlClient: () => client }));

      const result = await service.createCustomPurchase({ shop: 's' }, { amountCents: 1000, returnUrl: 'https://x/return' });

      expect(result).toEqual(
        expect.objectContaining({ purchaseId: 'gid://shopify/AppPurchaseOneTime/1', confirmationUrl: 'https://admin.shopify.com/confirm/3' }),
      );
    });

    it('throws PublishError on userErrors', async () => {
      const client = {
        request: vi.fn().mockResolvedValue({
          data: { appPurchaseOneTimeCreate: { appPurchaseOneTime: null, confirmationUrl: null, userErrors: [{ field: [], message: 'Amount too low' }] } },
        }),
      };
      const service = createBillingService(makeDeps({ getGraphqlClient: () => client }));

      await expect(
        service.createCustomPurchase({ shop: 's' }, { amountCents: 1, returnUrl: 'https://x/return' }),
      ).rejects.toBeInstanceOf(PublishError);
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
    it('activateUnlimitedPlan sets plan to unlimited and records the subscription id', async () => {
      const shopsRepo = { updateShop: vi.fn().mockResolvedValue(undefined) };
      const service = createBillingService(makeDeps({ shopsRepo }));

      await service.activateUnlimitedPlan('shop-a', 'gid://shopify/AppSubscription/2');

      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a', { plan: 'unlimited', unlimitedSubscriptionId: 'gid://shopify/AppSubscription/2' });
    });

    it('deactivateUnlimitedPlan reverts plan to metered and clears the subscription id', async () => {
      const shopsRepo = { updateShop: vi.fn().mockResolvedValue(undefined) };
      const service = createBillingService(makeDeps({ shopsRepo }));

      await service.deactivateUnlimitedPlan('shop-a');

      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a', { plan: 'metered', unlimitedSubscriptionId: null });
    });
  });
});
