const { createHttpsRedirect } = require('../../../src/middleware/httpsRedirect');

function makeRes() {
  return { redirect: vi.fn() };
}

describe('middleware/httpsRedirect', () => {
  it('calls next() without redirecting outside production', () => {
    const middleware = createHttpsRedirect({ nodeEnv: 'development' });
    const next = vi.fn();
    const res = makeRes();

    middleware({ headers: { host: 'example.com' } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('calls next() in production when the request already arrived over HTTPS', () => {
    const middleware = createHttpsRedirect({ nodeEnv: 'production' });
    const next = vi.fn();
    const res = makeRes();

    middleware({ headers: { host: 'example.com', 'x-forwarded-proto': 'https' } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects to the HTTPS equivalent URL in production when the request arrived over plain HTTP', () => {
    const middleware = createHttpsRedirect({ nodeEnv: 'production' });
    const next = vi.fn();
    const res = makeRes();

    middleware({ headers: { host: 'example.com' }, originalUrl: '/billing?foo=bar' }, res, next);

    expect(res.redirect).toHaveBeenCalledWith(301, 'https://example.com/billing?foo=bar');
    expect(next).not.toHaveBeenCalled();
  });
});
