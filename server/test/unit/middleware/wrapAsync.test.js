const { wrapAsync } = require('../../../src/middleware/wrapAsync');

describe('middleware/wrapAsync', () => {
  it('calls the handler with req/res/next and does not call next on success', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const req = {};
    const res = {};
    const next = vi.fn();

    await wrapAsync(handler)(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards a rejected promise to next(err) instead of throwing', async () => {
    const err = new Error('boom');
    const handler = vi.fn().mockRejectedValue(err);
    const next = vi.fn();

    await wrapAsync(handler)({}, {}, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  it('forwards a synchronously-thrown error to next(err) as well', async () => {
    const err = new Error('sync boom');
    const handler = vi.fn(() => {
      throw err;
    });
    const next = vi.fn();

    await wrapAsync(handler)({}, {}, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
