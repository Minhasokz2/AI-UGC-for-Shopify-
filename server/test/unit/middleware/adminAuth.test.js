const { createAdminAuth } = require('../../../src/middleware/adminAuth');
const { UnauthorizedError } = require('../../../src/errors/AppError');

describe('middleware/adminAuth', () => {
  it('calls next() with no error when the header matches the configured key', () => {
    const middleware = createAdminAuth({ adminApiKey: 'secret-key-1234567890' });
    const next = vi.fn();

    middleware({ headers: { 'x-admin-api-key': 'secret-key-1234567890' } }, {}, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(UnauthorizedError) when the header is missing', () => {
    const middleware = createAdminAuth({ adminApiKey: 'secret-key-1234567890' });
    const next = vi.fn();

    middleware({ headers: {} }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next(UnauthorizedError) when the header does not match', () => {
    const middleware = createAdminAuth({ adminApiKey: 'secret-key-1234567890' });
    const next = vi.fn();

    middleware({ headers: { 'x-admin-api-key': 'wrong-key' } }, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});
