// Thin wrapper around the `wavespeed` SDK for video generation (own dedicated
// Video Studio flow, tiered fast/standard/premium).
//
// --- `wavespeed` package shape, verified against the installed package (v0.2.6)
// via node_modules/wavespeed/dist/api/client.d.ts and its README ---
// The package exports a `Client` class (`new Client(apiKey, { baseUrl, ... })`),
// not a bare `wavespeed.run(modelId, input)` module function as originally
// assumed — `run` does exist but only as a convenience wrapper around a
// module-level default singleton client, which isn't what we want for DI, so
// we construct our own `Client` instance instead.
//
// Crucially, `client.run(model, input, options)` is NOT a raw job-submission
// call — it submits the task AND internally polls until completion (see
// `Client.prototype._wait` in dist/api/client.js), resolving directly to
// `{ outputs: string[] }` (an array of output URLs, confirmed by the README's
// `output["outputs"][0] // Output URL` example and by `data.outputs` in the
// SDK's own `_wait`/`run` implementations). So no separate `pollStatus` export
// is needed here — unlike a raw async/job-based API, this SDK already hides the
// polling loop behind a single awaited call. `outputs` is used uniformly for
// every model regardless of media type, so there's no per-model `outputField`
// branch here the way there is in fal.js/extendedModels.js.
//
// `WAVESPEED_API_KEY` matches the SDK's own default env var name exactly (see
// dist/config.js), so — unlike fal.js's FAL_API_KEY/FAL_KEY mismatch — no
// override is needed there; only `baseUrl` needs to be passed explicitly when
// `WAVESPEED_BASE_URL` is set, since the SDK's own default env var lookup
// doesn't check that name.

const { Client } = require('wavespeed');
const { env } = require('../config/env');

let realClient;
/** Lazily-constructed real wavespeed Client instance. */
function getClient() {
  if (!realClient) {
    const options = {};
    if (env.WAVESPEED_BASE_URL) options.baseUrl = env.WAVESPEED_BASE_URL;
    realClient = new Client(env.WAVESPEED_API_KEY, options);
  }
  return realClient;
}

/**
 * @param {{ model: object, imageUrl: string, prompt?: string, client?: object }} params
 * @returns {Promise<{ url: string }>}
 */
async function generateVideo({ model, imageUrl, prompt, client = getClient() }) {
  if (typeof model.imageParam !== 'string') {
    throw new Error(`wavespeed.js: model "${model.id}" has a non-string imageParam`);
  }
  const input = { [model.imageParam]: imageUrl, prompt };
  const result = await client.run(model.endpoint, input);
  const url = Array.isArray(result?.outputs) ? result.outputs[0] : undefined;
  if (!url) {
    throw new Error(`wavespeed.js: model "${model.id}" returned no output URL`);
  }
  return { url };
}

module.exports = { generateVideo, getClient };
