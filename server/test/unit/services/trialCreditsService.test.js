const { createTrialCreditsService, normalizeEmail } = require('../../../src/services/trialCreditsService');
const { FREE_TRIAL_CREDITS } = require('../../../src/config/constants');
const { FieldValue } = require('../../helpers/fakeFirestore');

function makeShopsRepo(overrides = {}) {
  return {
    getShop: vi.fn().mockResolvedValue(undefined),
    updateShop: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeUsedTrialEmailsRepo(overrides = {}) {
  return {
    claimTrialForEmail: vi.fn().mockResolvedValue({ claimed: true }),
    ...overrides,
  };
}

describe('services/trialCreditsService', () => {
  describe('normalizeEmail', () => {
    it('lowercases and trims', () => {
      expect(normalizeEmail('  Merchant@Example.com  ')).toBe('merchant@example.com');
    });

    it('strips dots and +tags for gmail.com', () => {
      expect(normalizeEmail('First.Last+trial@gmail.com')).toBe('firstlast@gmail.com');
    });

    it('strips dots and +tags for googlemail.com the same way as gmail.com', () => {
      expect(normalizeEmail('a.b+x@googlemail.com')).toBe('ab@gmail.com');
    });

    it('leaves non-Gmail domains untouched aside from case/whitespace', () => {
      expect(normalizeEmail('First.Last+tag@example.com')).toBe('first.last+tag@example.com');
    });
  });

  describe('grantTrialIfEligible', () => {
    it('grants the trial and marks the shop verified on a fresh eligible email', async () => {
      const shopsRepo = makeShopsRepo();
      const usedTrialEmailsRepo = makeUsedTrialEmailsRepo();
      const service = createTrialCreditsService({ shopsRepo, usedTrialEmailsRepo, FieldValue });

      const result = await service.grantTrialIfEligible({ shopDomain: 'shop-a.myshopify.com', email: 'merchant@example.com' });

      expect(usedTrialEmailsRepo.claimTrialForEmail).toHaveBeenCalledWith('merchant@example.com', { shopDomain: 'shop-a.myshopify.com' });
      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a.myshopify.com', {
        googleVerified: true,
        verifiedEmail: 'merchant@example.com',
        trialEligibilityLocked: true,
        creditBalance: expect.anything(),
      });
      expect(result).toEqual({ granted: true, credits: FREE_TRIAL_CREDITS });
    });

    it('is a no-op when the shop has already locked trial eligibility (never re-grants, even if googleVerified was reset by a sign-out)', async () => {
      const shopsRepo = makeShopsRepo({ getShop: vi.fn().mockResolvedValue({ googleVerified: false, trialEligibilityLocked: true }) });
      const usedTrialEmailsRepo = makeUsedTrialEmailsRepo();
      const service = createTrialCreditsService({ shopsRepo, usedTrialEmailsRepo, FieldValue });

      const result = await service.grantTrialIfEligible({ shopDomain: 'shop-a.myshopify.com', email: 'merchant@example.com' });

      expect(result).toEqual({ granted: false, reason: 'shop_already_verified' });
      expect(usedTrialEmailsRepo.claimTrialForEmail).not.toHaveBeenCalled();
      expect(shopsRepo.updateShop).not.toHaveBeenCalled();
    });

    it('marks the shop verified but grants no credits when the email was already used for a trial elsewhere', async () => {
      const shopsRepo = makeShopsRepo();
      const usedTrialEmailsRepo = makeUsedTrialEmailsRepo({
        claimTrialForEmail: vi.fn().mockResolvedValue({ claimed: false, existingShopDomain: 'other-shop.myshopify.com' }),
      });
      const service = createTrialCreditsService({ shopsRepo, usedTrialEmailsRepo, FieldValue });

      const result = await service.grantTrialIfEligible({ shopDomain: 'shop-a.myshopify.com', email: 'merchant@example.com' });

      expect(result).toEqual({ granted: false, reason: 'email_already_used', existingShopDomain: 'other-shop.myshopify.com' });
      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a.myshopify.com', {
        googleVerified: true,
        verifiedEmail: 'merchant@example.com',
        trialEligibilityLocked: true,
      });
    });

    it('resumes and grants credits when the shop\'s OWN prior claim is found (crash between claiming the email and locking the shop) — never permanently forfeits the trial', async () => {
      const shopsRepo = makeShopsRepo();
      const usedTrialEmailsRepo = makeUsedTrialEmailsRepo({
        // Same shop shows up as the "existing" claimant of its own earlier attempt.
        claimTrialForEmail: vi.fn().mockResolvedValue({ claimed: false, existingShopDomain: 'shop-a.myshopify.com' }),
      });
      const service = createTrialCreditsService({ shopsRepo, usedTrialEmailsRepo, FieldValue });

      const result = await service.grantTrialIfEligible({ shopDomain: 'shop-a.myshopify.com', email: 'merchant@example.com' });

      expect(result).toEqual({ granted: true, credits: FREE_TRIAL_CREDITS });
      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a.myshopify.com', {
        googleVerified: true,
        verifiedEmail: 'merchant@example.com',
        trialEligibilityLocked: true,
        creditBalance: expect.anything(),
      });
    });

    it('normalizes the email before claiming, so gmail dot/tag variants collide correctly', async () => {
      const shopsRepo = makeShopsRepo();
      const usedTrialEmailsRepo = makeUsedTrialEmailsRepo();
      const service = createTrialCreditsService({ shopsRepo, usedTrialEmailsRepo, FieldValue });

      await service.grantTrialIfEligible({ shopDomain: 'shop-a.myshopify.com', email: 'First.Last+promo@gmail.com' });

      expect(usedTrialEmailsRepo.claimTrialForEmail).toHaveBeenCalledWith('firstlast@gmail.com', { shopDomain: 'shop-a.myshopify.com' });
    });
  });
});
