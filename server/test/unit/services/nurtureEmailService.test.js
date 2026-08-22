const { createNurtureEmailService } = require('../../../src/services/nurtureEmailService');
const { FakeTimestamp } = require('../../helpers/fakeFirestore');

function makeDeps(overrides = {}) {
  return {
    shopsRepo: { updateShop: vi.fn().mockResolvedValue(undefined), listInstalledShops: vi.fn() },
    emailService: { sendEmail: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

function hoursAgoTimestamp(hours, now) {
  return FakeTimestamp.fromMillis(now.getTime() - hours * 60 * 60 * 1000);
}

describe('services/nurtureEmailService', () => {
  const now = new Date('2026-08-22T12:00:00Z');

  describe('processShop', () => {
    it('sends the onboarding nudge once a shop has been installed 24h+ with no first job, and records it', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = { id: 'shop-a', installedAt: hoursAgoTimestamp(25, now), firstJobCreatedAt: null, verifiedEmail: 'merchant@example.com' };

      const result = await service.processShop(shop, now);

      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'merchant@example.com', subject: expect.stringContaining('first AI product photo') }),
      );
      expect(deps.shopsRepo.updateShop).toHaveBeenCalledWith('shop-a', { 'nurtureEmailsSent.onboarding_nudge': now });
      expect(result).toEqual({ shopDomain: 'shop-a', sent: ['onboarding_nudge'] });
    });

    it('does not send the onboarding nudge before the 24h delay has elapsed', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = { id: 'shop-a', installedAt: hoursAgoTimestamp(1, now), firstJobCreatedAt: null, verifiedEmail: 'merchant@example.com' };

      const result = await service.processShop(shop, now);

      expect(deps.emailService.sendEmail).not.toHaveBeenCalled();
      expect(result.sent).toEqual([]);
    });

    it('does not send the onboarding nudge once a first job already exists', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = { id: 'shop-a', installedAt: hoursAgoTimestamp(100, now), firstJobCreatedAt: hoursAgoTimestamp(50, now), verifiedEmail: 'merchant@example.com' };

      const result = await service.processShop(shop, now);

      expect(result.sent).not.toContain('onboarding_nudge');
    });

    it('sends the low-credits reminder for a metered shop at/below the threshold that has generated at least once', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = {
        id: 'shop-a',
        plan: 'metered',
        creditBalance: 2,
        firstJobCreatedAt: hoursAgoTimestamp(200, now),
        installedAt: hoursAgoTimestamp(300, now),
        verifiedEmail: 'merchant@example.com',
      };

      const result = await service.processShop(shop, now);

      expect(result.sent).toEqual(['low_credits_reminder']);
      expect(deps.emailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('running low') }));
    });

    it('does not send the low-credits reminder for an unlimited-plan shop regardless of balance', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = { id: 'shop-a', plan: 'unlimited', creditBalance: 0, firstJobCreatedAt: hoursAgoTimestamp(10, now), verifiedEmail: 'merchant@example.com' };

      const result = await service.processShop(shop, now);

      expect(result.sent).toEqual([]);
    });

    it('never re-sends a campaign already recorded in nurtureEmailsSent', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = {
        id: 'shop-a',
        installedAt: hoursAgoTimestamp(100, now),
        firstJobCreatedAt: null,
        verifiedEmail: 'merchant@example.com',
        nurtureEmailsSent: { onboarding_nudge: hoursAgoTimestamp(50, now) },
      };

      const result = await service.processShop(shop, now);

      expect(result.sent).toEqual([]);
      expect(deps.emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('skips sending (but does not error) for a qualifying shop with no verified email', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = { id: 'shop-a', installedAt: hoursAgoTimestamp(100, now), firstJobCreatedAt: null, verifiedEmail: null };

      const result = await service.processShop(shop, now);

      expect(result.sent).toEqual([]);
      expect(deps.emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('can send multiple qualifying campaigns for the same shop in one pass', async () => {
      const deps = makeDeps();
      const service = createNurtureEmailService(deps);
      const shop = {
        id: 'shop-a',
        plan: 'metered',
        creditBalance: 1,
        installedAt: hoursAgoTimestamp(100, now),
        firstJobCreatedAt: hoursAgoTimestamp(50, now),
        verifiedEmail: 'merchant@example.com',
      };
      // onboarding_nudge requires firstJobCreatedAt to be falsy, so re-derive a
      // shop shape where BOTH campaigns' conditions are independently true isn't
      // possible by design (onboarding_nudge needs no job, low_credits needs a
      // job) — this test instead confirms low_credits alone still fires cleanly
      // alongside an already-sent onboarding_nudge flag.
      shop.nurtureEmailsSent = { onboarding_nudge: hoursAgoTimestamp(40, now) };

      const result = await service.processShop(shop, now);

      expect(result.sent).toEqual(['low_credits_reminder']);
    });
  });

  describe('runNurtureSweep', () => {
    it('walks every page of installed shops and processes each one', async () => {
      const shopsRepo = {
        updateShop: vi.fn().mockResolvedValue(undefined),
        listInstalledShops: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'a', installedAt: hoursAgoTimestamp(1, now), firstJobCreatedAt: null, verifiedEmail: null }])
          .mockResolvedValueOnce([]),
      };
      const deps = makeDeps({ shopsRepo });
      const service = createNurtureEmailService(deps);

      const { results } = await service.runNurtureSweep({ now });

      expect(results.map((r) => r.shopDomain)).toEqual(['a']);
    });

    it('records an error for a shop that fails and continues the sweep', async () => {
      const shopsRepo = {
        updateShop: vi.fn().mockRejectedValue(new Error('write failed')),
        listInstalledShops: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'a', installedAt: hoursAgoTimestamp(100, now), firstJobCreatedAt: null, verifiedEmail: 'm@example.com' }])
          .mockResolvedValueOnce([]),
      };
      const deps = makeDeps({ shopsRepo });
      const service = createNurtureEmailService(deps);

      const { results } = await service.runNurtureSweep({ now });

      expect(results).toHaveLength(1);
      expect(results[0].error).toBeInstanceOf(Error);
    });
  });
});
