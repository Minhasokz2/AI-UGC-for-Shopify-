const {
  AppError,
  ValidationError,
  InsufficientCreditsError,
  PersonaGuardError,
  NoApprovedVariationsError,
  ConcurrencyLimitError,
  QuotaExceededError,
  IdempotencyConflictError,
  PublishError,
  ShopifyApiError,
  ProviderApiError,
  LostLeaseError,
} = require('../../../src/errors/AppError');

describe('errors/AppError', () => {
  it('sets statusCode, code, and expose defaults on the base class', () => {
    const err = new AppError('boom', 400);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('AppError');
    expect(err.expose).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('InsufficientCreditsError carries required/available and a 402 status', () => {
    const err = new InsufficientCreditsError(5, 2);
    expect(err.statusCode).toBe(402);
    expect(err.required).toBe(5);
    expect(err.available).toBe(2);
    expect(err.message).toContain('5');
    expect(err.message).toContain('2');
  });

  it('PersonaGuardError and NoApprovedVariationsError are 422', () => {
    expect(new PersonaGuardError().statusCode).toBe(422);
    expect(new NoApprovedVariationsError().statusCode).toBe(422);
  });

  it('ConcurrencyLimitError is 429', () => {
    expect(new ConcurrencyLimitError('shop').statusCode).toBe(429);
  });

  it('QuotaExceededError is 429', () => {
    const err = new QuotaExceededError('Daily quota reached');
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.message).toBe('Daily quota reached');
  });

  it('IdempotencyConflictError is 409', () => {
    expect(new IdempotencyConflictError().statusCode).toBe(409);
  });

  it('PublishError carries shopifyErrors and is a 502', () => {
    const err = new PublishError('failed', [{ message: 'bad media' }]);
    expect(err.statusCode).toBe(502);
    expect(err.shopifyErrors).toHaveLength(1);
  });

  it('ShopifyApiError defaults to 502 but accepts an override', () => {
    expect(new ShopifyApiError('x').statusCode).toBe(502);
    expect(new ShopifyApiError('x', { status: 401 }).statusCode).toBe(401);
  });

  it('ProviderApiError defaults to 502, accepts a status override, and carries the provider name', () => {
    expect(new ProviderApiError('x').statusCode).toBe(502);
    const err = new ProviderApiError('resend failed', { provider: 'resend', status: 400 });
    expect(err.statusCode).toBe(400);
    expect(err.provider).toBe('resend');
    expect(err.code).toBe('PROVIDER_API_ERROR');
  });

  it('LostLeaseError is marked non-exposable (never HTTP-facing)', () => {
    const err = new LostLeaseError('job_123');
    expect(err.expose).toBe(false);
    expect(err.statusCode).toBe(409);
  });

  it('ValidationError carries details', () => {
    const err = new ValidationError('bad input', { field: 'prompt' });
    expect(err.details).toEqual({ field: 'prompt' });
  });
});
