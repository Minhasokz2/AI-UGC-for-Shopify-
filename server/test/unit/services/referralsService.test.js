const {
  createReferralsService,
  generateReferralCode,
  DEFAULT_COMMISSION_RATE,
} = require('../../../src/services/referralsService');

function makeShopsRepo(overrides = {}) {
  return {
    getShop: vi.fn(),
    updateShop: vi.fn().mockResolvedValue(undefined),
    findByReferralCode: vi.fn(),
    ...overrides,
  };
}

function makeReferralsRepo(overrides = {}) {
  return {
    createReferral: vi.fn(),
    findByReferredShop: vi.fn(),
    markConverted: vi.fn().mockResolvedValue(undefined),
    accrueCommission: vi.fn().mockResolvedValue(undefined),
    listByReferrer: vi.fn(),
    ...overrides,
  };
}

describe('services/referralsService', () => {
  describe('generateReferralCode', () => {
    it('generates an 8-character code using only the allowed alphabet', () => {
      const code = generateReferralCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    });

    it('is deterministic given an injected random function', () => {
      const alwaysZero = () => 0;
      expect(generateReferralCode(alwaysZero)).toBe('AAAAAAAA');
    });
  });

  describe('ensureReferralCode', () => {
    it('returns the existing code without minting a new one', async () => {
      const shopsRepo = makeShopsRepo({ getShop: vi.fn().mockResolvedValue({ referralCode: 'EXIST123' }) });
      const service = createReferralsService({ shopsRepo, referralsRepo: makeReferralsRepo() });

      const code = await service.ensureReferralCode('shop-a.myshopify.com');

      expect(code).toBe('EXIST123');
      expect(shopsRepo.updateShop).not.toHaveBeenCalled();
    });

    it('mints and persists a new code when none exists', async () => {
      const shopsRepo = makeShopsRepo({
        getShop: vi.fn().mockResolvedValue({ referralCode: null }),
        findByReferralCode: vi.fn().mockResolvedValue(undefined),
      });
      const service = createReferralsService({ shopsRepo, referralsRepo: makeReferralsRepo(), random: () => 0 });

      const code = await service.ensureReferralCode('shop-a.myshopify.com');

      expect(code).toBe('AAAAAAAA');
      expect(shopsRepo.updateShop).toHaveBeenCalledWith('shop-a.myshopify.com', { referralCode: 'AAAAAAAA' });
    });

    it('retries on a collision until a free code is found', async () => {
      let calls = 0;
      const shopsRepo = makeShopsRepo({
        getShop: vi.fn().mockResolvedValue({ referralCode: null }),
        findByReferralCode: vi.fn().mockImplementation(async () => {
          calls += 1;
          return calls === 1 ? { id: 'someone-else' } : undefined;
        }),
      });
      const service = createReferralsService({ shopsRepo, referralsRepo: makeReferralsRepo(), random: () => 0 });

      const code = await service.ensureReferralCode('shop-a.myshopify.com');

      expect(code).toBe('AAAAAAAA');
      expect(shopsRepo.findByReferralCode).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all generation attempts', async () => {
      const shopsRepo = makeShopsRepo({
        getShop: vi.fn().mockResolvedValue({ referralCode: null }),
        findByReferralCode: vi.fn().mockResolvedValue({ id: 'always-taken' }),
      });
      const service = createReferralsService({ shopsRepo, referralsRepo: makeReferralsRepo(), random: () => 0 });

      await expect(service.ensureReferralCode('shop-a.myshopify.com')).rejects.toThrow(/exhausted/);
    });
  });

  describe('applyReferralCode', () => {
    it('creates a referral when the code is valid and the referred shop is new', async () => {
      const shopsRepo = makeShopsRepo({ findByReferralCode: vi.fn().mockResolvedValue({ id: 'referrer.myshopify.com' }) });
      const referralsRepo = makeReferralsRepo({
        findByReferredShop: vi.fn().mockResolvedValue(undefined),
        createReferral: vi.fn().mockResolvedValue({ id: 'ref-1' }),
      });
      const service = createReferralsService({ shopsRepo, referralsRepo });

      const result = await service.applyReferralCode({ referredShopDomain: 'referred.myshopify.com', code: 'ABC123' });

      expect(referralsRepo.createReferral).toHaveBeenCalledWith({
        referrerShopDomain: 'referrer.myshopify.com',
        referredShopDomain: 'referred.myshopify.com',
        code: 'ABC123',
      });
      expect(result).toEqual({ applied: true, referral: { id: 'ref-1' } });
    });

    it('is a no-op for an unknown code', async () => {
      const shopsRepo = makeShopsRepo({ findByReferralCode: vi.fn().mockResolvedValue(undefined) });
      const referralsRepo = makeReferralsRepo();
      const service = createReferralsService({ shopsRepo, referralsRepo });

      const result = await service.applyReferralCode({ referredShopDomain: 'referred.myshopify.com', code: 'NOPE' });

      expect(result).toEqual({ applied: false, reason: 'unknown_code' });
      expect(referralsRepo.createReferral).not.toHaveBeenCalled();
    });

    it('is a no-op for a self-referral', async () => {
      const shopsRepo = makeShopsRepo({ findByReferralCode: vi.fn().mockResolvedValue({ id: 'shop-a.myshopify.com' }) });
      const referralsRepo = makeReferralsRepo();
      const service = createReferralsService({ shopsRepo, referralsRepo });

      const result = await service.applyReferralCode({ referredShopDomain: 'shop-a.myshopify.com', code: 'ABC123' });

      expect(result).toEqual({ applied: false, reason: 'self_referral' });
      expect(referralsRepo.createReferral).not.toHaveBeenCalled();
    });

    it('is a no-op when the shop was already referred by someone', async () => {
      const shopsRepo = makeShopsRepo({ findByReferralCode: vi.fn().mockResolvedValue({ id: 'referrer.myshopify.com' }) });
      const referralsRepo = makeReferralsRepo({ findByReferredShop: vi.fn().mockResolvedValue({ id: 'existing-referral' }) });
      const service = createReferralsService({ shopsRepo, referralsRepo });

      const result = await service.applyReferralCode({ referredShopDomain: 'referred.myshopify.com', code: 'ABC123' });

      expect(result).toEqual({ applied: false, reason: 'already_referred' });
      expect(referralsRepo.createReferral).not.toHaveBeenCalled();
    });
  });

  describe('recordReferredPayment', () => {
    it('is a no-op when the shop was never referred', async () => {
      const referralsRepo = makeReferralsRepo({ findByReferredShop: vi.fn().mockResolvedValue(undefined) });
      const service = createReferralsService({ shopsRepo: makeShopsRepo(), referralsRepo });

      const result = await service.recordReferredPayment({ referredShopDomain: 'shop-a.myshopify.com', amountCents: 4900 });

      expect(result).toEqual({ credited: false });
      expect(referralsRepo.accrueCommission).not.toHaveBeenCalled();
    });

    it('accrues commission at the default rate and marks a pending referral converted', async () => {
      const referralsRepo = makeReferralsRepo({
        findByReferredShop: vi.fn().mockResolvedValue({ id: 'ref-1', status: 'pending' }),
      });
      const service = createReferralsService({ shopsRepo: makeShopsRepo(), referralsRepo });

      const result = await service.recordReferredPayment({ referredShopDomain: 'shop-a.myshopify.com', amountCents: 4900 });

      const expectedCommission = Math.round(4900 * DEFAULT_COMMISSION_RATE);
      expect(referralsRepo.accrueCommission).toHaveBeenCalledWith('ref-1', expectedCommission);
      expect(referralsRepo.markConverted).toHaveBeenCalledWith('ref-1');
      expect(result).toEqual({ credited: true, commissionCents: expectedCommission });
    });

    it('accrues commission on a subsequent payment without re-marking an already-converted referral', async () => {
      const referralsRepo = makeReferralsRepo({
        findByReferredShop: vi.fn().mockResolvedValue({ id: 'ref-1', status: 'converted' }),
      });
      const service = createReferralsService({ shopsRepo: makeShopsRepo(), referralsRepo });

      await service.recordReferredPayment({ referredShopDomain: 'shop-a.myshopify.com', amountCents: 9900 });

      expect(referralsRepo.accrueCommission).toHaveBeenCalledWith('ref-1', Math.round(9900 * DEFAULT_COMMISSION_RATE));
      expect(referralsRepo.markConverted).not.toHaveBeenCalled();
    });
  });

  describe('listReferralsMade', () => {
    it('delegates to referralsRepo.listByReferrer', async () => {
      const referralsRepo = makeReferralsRepo({ listByReferrer: vi.fn().mockResolvedValue([{ id: 'ref-1' }]) });
      const service = createReferralsService({ shopsRepo: makeShopsRepo(), referralsRepo });

      const result = await service.listReferralsMade('shop-a.myshopify.com');

      expect(referralsRepo.listByReferrer).toHaveBeenCalledWith('shop-a.myshopify.com');
      expect(result).toEqual([{ id: 'ref-1' }]);
    });
  });
});
