const { createBurstGuard, checkFixedWindow } = require('../../../src/middleware/rateLimiter');
const { RateLimitError } = require('../../../src/errors/AppError');

describe('middleware/rateLimiter', () => {
  describe('checkFixedWindow (pure)', () => {
    it('allows the first request in a fresh window', () => {
      const { allowed, state } = checkFixedWindow(undefined, 1000, { windowMs: 60_000, limit: 3 });
      expect(allowed).toBe(true);
      expect(state).toEqual({ windowStart: 1000, count: 1 });
    });

    it('allows and increments up to the limit within the same window', () => {
      const second = checkFixedWindow({ windowStart: 1000, count: 1 }, 1500, { windowMs: 60_000, limit: 3 });
      expect(second.allowed).toBe(true);
      expect(second.state.count).toBe(2);

      const third = checkFixedWindow(second.state, 2000, { windowMs: 60_000, limit: 3 });
      expect(third.allowed).toBe(true);
      expect(third.state.count).toBe(3);
    });

    it('rejects once the limit is reached within the window, without incrementing further', () => {
      const state = { windowStart: 1000, count: 3 };
      const result = checkFixedWindow(state, 2000, { windowMs: 60_000, limit: 3 });
      expect(result.allowed).toBe(false);
      expect(result.state).toBe(state);
    });

    it('resets the window (and allows) once windowMs has elapsed', () => {
      const state = { windowStart: 1000, count: 3 };
      const result = checkFixedWindow(state, 1000 + 60_000, { windowMs: 60_000, limit: 3 });
      expect(result.allowed).toBe(true);
      expect(result.state).toEqual({ windowStart: 1000 + 60_000, count: 1 });
    });
  });

  describe('createBurstGuard (Express middleware)', () => {
    it('calls next() with no error for requests under the limit', () => {
      const guard = createBurstGuard({ limit: 2, windowMs: 60_000 });
      const next = vi.fn();
      guard({ shopDomain: 'shop-a' }, {}, next);
      guard({ shopDomain: 'shop-a' }, {}, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenNthCalledWith(1);
      expect(next).toHaveBeenNthCalledWith(2);
    });

    it('calls next(RateLimitError) once the per-key limit is exceeded', () => {
      const guard = createBurstGuard({ limit: 1, windowMs: 60_000 });
      const next = vi.fn();
      guard({ shopDomain: 'shop-a' }, {}, next);
      guard({ shopDomain: 'shop-a' }, {}, next);
      expect(next).toHaveBeenLastCalledWith(expect.any(RateLimitError));
    });

    it('tracks separate counters per key (shopDomain), so one shop cannot rate-limit another', () => {
      const guard = createBurstGuard({ limit: 1, windowMs: 60_000 });
      const next = vi.fn();
      guard({ shopDomain: 'shop-a' }, {}, next);
      guard({ shopDomain: 'shop-b' }, {}, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });

    it('uses a custom keyFn when provided', () => {
      const guard = createBurstGuard({ limit: 1, windowMs: 60_000, keyFn: (req) => req.customKey });
      const next = vi.fn();
      guard({ customKey: 'k1' }, {}, next);
      guard({ customKey: 'k1' }, {}, next);
      expect(next).toHaveBeenLastCalledWith(expect.any(RateLimitError));
    });
  });
});
