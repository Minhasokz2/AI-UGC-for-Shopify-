// Extracts a brand color palette + tone descriptor from images via an LLM
// (OpenAI or Anthropic, per BRAND_STYLE_LLM_PROVIDER). Both provider branches
// ask the model to return ONLY a JSON object of shape
// `{ colors: string[], tone: string }` and parse its text response.
//
// --- OpenAI shape, verified against the installed `openai` package (v4.104.0) ---
// `new OpenAI({ apiKey })` exposes `.chat.completions.create({ model, messages })`;
// a vision message's `content` is an array mixing `{ type: 'text', text }` and
// `{ type: 'image_url', image_url: { url } }` parts (confirmed in
// resources/chat/completions/completions.d.ts's ChatCompletionContentPartImage).
// The response text is `response.choices[0].message.content`.
//
// --- Anthropic shape — SEE FLAG BELOW ---
// `new Anthropic({ apiKey })` exposes `.messages.create({ model, max_tokens,
// messages })`; the response text is in `response.content` (an array of
// blocks; the text block has `{ type: 'text', text }`).
//
// FLAG for verification against a live call: the installed @anthropic-ai/sdk
// version (0.32.1, an older release) only declares a base64 image source in
// its TypeScript types (`ImageBlockParam.Source` = `{ type: 'base64', data,
// media_type }` — see node_modules/@anthropic-ai/sdk/resources/messages.d.ts);
// it has no `url`-typed source in its .d.ts at all. Anthropic's current public
// Messages API does accept `{ type: 'image', source: { type: 'url', url } }`
// (this SDK is a thin fetch-based client with no runtime validation beyond its
// TS types, so it will still serialize and send whatever object shape we give
// it), so extractBrandStyleWithAnthropic below sends a URL source rather than
// downloading+base64-encoding every image (which would pull in an HTTP client
// this package doesn't otherwise need). Re-verify this against a live call —
// and consider bumping @anthropic-ai/sdk — before this ships against real
// credentials.

const { env } = require('../config/env');
const { ProviderApiError } = require('../errors/AppError');

const OPENAI_VISION_MODEL = 'gpt-4o'; // verify this is still the intended vision model before shipping
const ANTHROPIC_VISION_MODEL = 'claude-opus-5';

const BRAND_STYLE_PROMPT =
  'Analyze the attached brand/product image(s) and extract the brand\'s visual style. ' +
  'Respond with ONLY a JSON object of the shape {"colors": string[], "tone": string} — ' +
  '"colors" is an array of hex color codes (e.g. "#RRGGBB") capturing the brand\'s color palette, ' +
  'and "tone" is a short (2-6 word) style descriptor (e.g. "minimalist and earthy"). ' +
  'Do not include any prose, markdown, or code fences — respond with the raw JSON object only.';

let realOpenAIClient;
/** Lazily-constructed real OpenAI client, configured with OPENAI_API_KEY. */
function getOpenAIClient() {
  if (!realOpenAIClient) {
    // eslint-disable-next-line global-require
    const OpenAI = require('openai');
    realOpenAIClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return realOpenAIClient;
}

let realAnthropicClient;
/** Lazily-constructed real Anthropic client, configured with ANTHROPIC_API_KEY. */
function getAnthropicClient() {
  if (!realAnthropicClient) {
    // eslint-disable-next-line global-require
    const Anthropic = require('@anthropic-ai/sdk');
    realAnthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return realAnthropicClient;
}

/**
 * Parses an LLM's freeform text response as the `{colors, tone}` JSON we
 * asked for. Unlike the model-metadata-driven throws elsewhere in this
 * services layer, this IS a genuine external-response-shape risk worth
 * guarding defensively — an LLM's text output can legitimately fail to be
 * valid JSON (extra prose, a stray code fence, truncation) even when the API
 * call itself succeeded, so a parse failure here throws a clear
 * ProviderApiError rather than letting `JSON.parse`'s cryptic error (or worse,
 * silently-wrong downstream behavior) leak out.
 * @param {string} text
 * @returns {{ colors: string[], tone: string }}
 */
function parseBrandStyleResponse(text) {
  let jsonText = String(text).trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new ProviderApiError(`brandStyle.js: LLM response was not valid JSON: ${err.message}`, {
      provider: 'brand-style-llm',
    });
  }
  if (!parsed || !Array.isArray(parsed.colors) || typeof parsed.tone !== 'string') {
    throw new ProviderApiError(
      'brandStyle.js: LLM response JSON did not match the expected {colors, tone} shape',
      { provider: 'brand-style-llm' },
    );
  }
  return { colors: parsed.colors, tone: parsed.tone };
}

async function extractBrandStyleWithOpenAI({ imageUrls, client }) {
  const openai = client || getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: OPENAI_VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: BRAND_STYLE_PROMPT },
          ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
  });
  const text = response?.choices?.[0]?.message?.content;
  if (!text) {
    throw new ProviderApiError('brandStyle.js: OpenAI returned no content', { provider: 'openai' });
  }
  return parseBrandStyleResponse(text);
}

async function extractBrandStyleWithAnthropic({ imageUrls, client }) {
  const anthropic = client || getAnthropicClient();
  const response = await anthropic.messages.create({
    model: ANTHROPIC_VISION_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageUrls.map((url) => ({ type: 'image', source: { type: 'url', url } })),
          { type: 'text', text: BRAND_STYLE_PROMPT },
        ],
      },
    ],
  });
  const block = response?.content?.find((b) => b.type === 'text');
  if (!block) {
    throw new ProviderApiError('brandStyle.js: Anthropic returned no text content', { provider: 'anthropic' });
  }
  return parseBrandStyleResponse(block.text);
}

/**
 * @param {{ imageUrls: string[], provider?: 'openai'|'anthropic', client?: object }} params
 * @returns {Promise<{ colors: string[], tone: string }>}
 */
async function extractBrandStyle({ imageUrls, provider = env.BRAND_STYLE_LLM_PROVIDER, client } = {}) {
  if (provider === 'openai') return extractBrandStyleWithOpenAI({ imageUrls, client });
  if (provider === 'anthropic') return extractBrandStyleWithAnthropic({ imageUrls, client });
  throw new Error(`brandStyle.js: unsupported provider "${provider}"`);
}

module.exports = {
  extractBrandStyle,
  parseBrandStyleResponse,
  getOpenAIClient,
  getAnthropicClient,
};
