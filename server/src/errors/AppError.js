/**
 * Base class for every deliberately-thrown error in the app. `statusCode < 500`
 * errors have their `message` returned verbatim to the HTTP client by the global
 * error handler; `statusCode >= 500` errors never leak their message to the client
 * (see middleware/errorHandler.js) regardless of what's set here.
 */
class AppError extends Error {
  constructor(message, statusCode, { code, expose = true } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code || this.constructor.name;
    this.expose = expose;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, { code: 'VALIDATION_ERROR' });
    this.details = details;
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, { code: 'UNAUTHORIZED' });
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, { code: 'FORBIDDEN' });
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, { code: 'NOT_FOUND' });
  }
}

class InsufficientCreditsError extends AppError {
  constructor(required, available) {
    super(`Insufficient credits: this action requires ${required} credit(s), you have ${available}.`, 402, {
      code: 'INSUFFICIENT_CREDITS',
    });
    this.required = required;
    this.available = available;
  }
}

class PersonaGuardError extends AppError {
  constructor(message = 'Only adult personas (ageRange: "adult") are permitted for UGC/on-model generation.') {
    super(message, 422, { code: 'PERSONA_NOT_ADULT' });
  }
}

class NoApprovedVariationsError extends AppError {
  constructor(message = 'No approved variations to publish.') {
    super(message, 422, { code: 'NO_APPROVED_VARIATIONS' });
  }
}

class ConcurrencyLimitError extends AppError {
  constructor(scope = 'shop') {
    super(`Concurrency limit reached for this ${scope} — please wait for existing jobs to finish.`, 429, {
      code: 'CONCURRENCY_LIMIT',
    });
  }
}

/**
 * Thrown by imageOptimizerQuota.js when a shop's free daily Image Optimizer
 * quota is exhausted and the paid add-on isn't active. Distinct from
 * InsufficientCreditsError since Image Optimizer uses a daily-quota model, not
 * the credit ledger.
 */
class QuotaExceededError extends AppError {
  constructor(message = 'Daily quota exceeded.') {
    super(message, 429, { code: 'QUOTA_EXCEEDED' });
  }
}

class IdempotencyConflictError extends AppError {
  constructor(message = 'An identical request is already in flight.') {
    super(message, 409, { code: 'IDEMPOTENCY_CONFLICT' });
  }
}

class PublishError extends AppError {
  constructor(message, shopifyErrors = []) {
    super(message, 502, { code: 'PUBLISH_FAILED' });
    this.shopifyErrors = shopifyErrors;
  }
}

class ShopifyApiError extends AppError {
  constructor(message, { status = 502 } = {}) {
    super(message, status, { code: 'SHOPIFY_API_ERROR' });
  }
}

/**
 * Generic upstream-provider failure for the external-API-client layer
 * (services/emailService.js, services/brandStyle.js, etc.) — used only where a
 * provider's SDK reports failure through its *return value* rather than by
 * throwing (Resend's `{data, error}` shape) or where the provider's response
 * doesn't match the contract we depend on (an LLM's freeform text failing to
 * parse as the JSON we asked for). Native SDK exceptions (fal.ai's ApiError,
 * WaveSpeed's WavespeedException hierarchy, etc.) are left to propagate
 * unwrapped — this class exists only to give the two non-throwing failure modes
 * above a consistent, HTTP-status-bearing shape, tagged with which provider
 * failed since this one error class spans several unrelated external services.
 */
class ProviderApiError extends AppError {
  constructor(message, { provider, status = 502 } = {}) {
    super(message, status, { code: 'PROVIDER_API_ERROR' });
    this.provider = provider;
  }
}

/**
 * Thrown internally by jobsRepo/leaseClaim when a worker discovers it no longer
 * owns a job's lease (it was reclaimed after going stale). Never HTTP-facing —
 * jobWorker.js catches this and aborts the current run silently rather than
 * clobbering whatever the new owner is doing.
 */
class LostLeaseError extends AppError {
  constructor(docId) {
    super(`Lease lost for document ${docId}`, 409, { code: 'LOST_LEASE', expose: false });
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
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
};
