// Backs every "attach a new image" control across the app (Custom Prompt
// Studio, Persona Builder, Video Studio, Virtual Try-On's two image slots).
// Accepts either a remote URL or a base64 data URI in the JSON body — both
// are valid first-argument shapes for cloudinary's uploader.upload(), so no
// multipart/multer parsing is needed. app.js raises the global JSON body
// limit to accommodate a base64-encoded image payload.

const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');

const uploadSchema = z.object({ image: z.string().min(1) });

/**
 * @param {{ cloudinaryService: object }} deps
 */
function createUploadsRouter({ cloudinaryService }) {
  const router = express.Router();

  router.post(
    '/',
    wrapAsync(async (req, res) => {
      const { image } = uploadSchema.parse(req.body);
      const result = await cloudinaryService.uploadImage(image);
      res.status(201).json(result);
    }),
  );

  return router;
}

module.exports = { createUploadsRouter, uploadSchema };
