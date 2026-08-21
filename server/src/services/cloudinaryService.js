// Image hosting/optimization wrapper around the `cloudinary` package, backing
// POST /api/uploads. Verified against the installed package (v2.10.1):
// `require('cloudinary').v2` exposes `.config()` and `.uploader.{upload,destroy}`
// exactly as assumed.

const cloudinary = require('cloudinary').v2;
const { env } = require('../config/env');

let configured = false;
/** Lazily configures and returns the real cloudinary v2 client singleton. */
function getClient() {
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
  return cloudinary;
}

/**
 * @param {string|Buffer} fileBufferOrUrl
 * @param {{ client?: object }} [opts]
 * @returns {Promise<{ url: string, publicId: string }>}
 */
async function uploadImage(fileBufferOrUrl, { client = getClient() } = {}) {
  const result = await client.uploader.upload(fileBufferOrUrl);
  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * @param {string} publicId
 * @param {{ client?: object }} [opts]
 */
async function deleteImage(publicId, { client = getClient() } = {}) {
  return client.uploader.destroy(publicId);
}

module.exports = { uploadImage, deleteImage, getClient };
