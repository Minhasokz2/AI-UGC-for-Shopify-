// Resend wrapper backing nurture emails. Verified against the installed
// package (v4.8.0, node_modules/resend/dist/index.d.ts): `new Resend(apiKey)`
// exposes `.emails.send(payload)`, which resolves to `{ data, error }` and
// does NOT throw on an API-level failure (e.g. an invalid `from` address) —
// it returns `{ data: null, error: ErrorResponse }` instead. sendEmail
// surfaces that failure mode as a thrown ProviderApiError so callers don't
// have to remember to check `.error` themselves.

const { Resend } = require('resend');
const { env } = require('../config/env');
const { ProviderApiError } = require('../errors/AppError');

let realClient;
/** Lazily-constructed real Resend client, configured with RESEND_API_KEY. */
function getClient() {
  if (!realClient) {
    if (!env.RESEND_API_KEY) {
      throw new ProviderApiError('Email sending is not configured (RESEND_API_KEY is not set).', {
        provider: 'resend',
        status: 503,
      });
    }
    realClient = new Resend(env.RESEND_API_KEY);
  }
  return realClient;
}

/**
 * @param {{ to: string|string[], subject: string, html: string }} params
 * @param {{ client?: object }} [opts]
 * @returns {Promise<{ id: string }>}
 */
async function sendEmail({ to, subject, html }, { client = getClient() } = {}) {
  const { data, error } = await client.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  });
  if (error) {
    throw new ProviderApiError(`Resend failed to send email: ${error.message || JSON.stringify(error)}`, {
      provider: 'resend',
    });
  }
  return { id: data.id };
}

module.exports = { sendEmail, getClient };
