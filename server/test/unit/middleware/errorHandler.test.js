const { z } = require('zod');
const { createErrorHandler, GENERIC_MESSAGE } = require('../../../src/middleware/errorHandler');
const { ValidationError, PublishError } = require('../../../src/errors/AppError');

function makeRes() {
  const res = { statusCode: undefined, body: undefined };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('middleware/errorHandler', () => {
  it('returns the error message verbatim for a statusCode < 500 AppError, without logging or reporting', () => {
    const logger = { error: vi.fn() };
    const captureException = vi.fn();
    const handler = createErrorHandler({ logger, captureException });
    const err = new ValidationError('Bad input');
    const res = makeRes();

    handler(err, { shopDomain: 'shop-a' }, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Bad input' } });
    expect(logger.error).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('includes err.details when present on an exposed error', () => {
    const handler = createErrorHandler({ logger: { error: vi.fn() }, captureException: vi.fn() });
    const err = new ValidationError('Bad input', { field: 'email' });
    const res = makeRes();

    handler(err, {}, res, () => {});

    expect(res.body.error.details).toEqual({ field: 'email' });
  });

  it('masks the top-level message for a 502 PublishError (>= 500) but still surfaces its structured shopifyErrors', () => {
    const handler = createErrorHandler({ logger: { error: vi.fn() }, captureException: vi.fn() });
    const err = new PublishError('Publish failed', [{ field: ['files'], message: 'bad url' }]);
    const res = makeRes();

    handler(err, {}, res, () => {});

    expect(res.statusCode).toBe(502);
    expect(res.body.error.message).toBe(GENERIC_MESSAGE);
    expect(res.body.error.shopifyErrors).toEqual([{ field: ['files'], message: 'bad url' }]);
  });

  it('masks the message and logs+reports for a >= 500 error', () => {
    const logger = { error: vi.fn() };
    const captureException = vi.fn();
    const handler = createErrorHandler({ logger, captureException });
    const err = new Error('leaked internal detail');
    const res = makeRes();

    handler(err, { shopDomain: 'shop-a', params: { jobId: 'job-1' } }, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: GENERIC_MESSAGE } });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err, shopDomain: 'shop-a', jobId: 'job-1' }),
      'Unhandled server error',
    );
    expect(captureException).toHaveBeenCalledWith(err, { tags: { shopDomain: 'shop-a', jobId: 'job-1' } });
  });

  it('masks the message for an AppError explicitly marked expose:false even below 500', () => {
    const handler = createErrorHandler({ logger: { error: vi.fn() }, captureException: vi.fn() });
    const err = new Error('lease lost');
    err.statusCode = 409;
    err.expose = false;
    const res = makeRes();

    handler(err, {}, res, () => {});

    expect(res.body.error.message).toBe(GENERIC_MESSAGE);
  });

  it('maps a ZodError to a 400 VALIDATION_ERROR with the issues as details, without logging or reporting', () => {
    const logger = { error: vi.fn() };
    const captureException = vi.fn();
    const handler = createErrorHandler({ logger, captureException });
    const res = makeRes();
    let zodErr;
    try {
      z.object({ contentType: z.enum(['scene', 'ugc']) }).parse({ contentType: 'nonsense' });
    } catch (e) {
      zodErr = e;
    }

    handler(zodErr, {}, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('defaults to 500 for a plain error with no statusCode', () => {
    const handler = createErrorHandler({ logger: { error: vi.fn() }, captureException: vi.fn() });
    const res = makeRes();

    handler(new Error('unexpected'), {}, res, () => {});

    expect(res.statusCode).toBe(500);
  });
});
