// Shared constants for the admin/ SPA.

/** sessionStorage key holding the operator's admin API key. */
export const ADMIN_API_KEY_STORAGE_KEY = 'motionart_admin_key';

/** Every template category the backend accepts (server/src/routes/admin/templates.js). */
export const TEMPLATE_CATEGORIES = ['scene', 'ugc', 'video'];

/** Every model category the backend accepts (server/src/routes/admin/models.js). */
export const MODEL_CATEGORIES = [
  'background_removal',
  'scene',
  'ugc',
  'color_safe',
  'upscale',
  'retouch',
  'object_extraction',
  'try_on',
  'text_to_image',
  'video',
];
