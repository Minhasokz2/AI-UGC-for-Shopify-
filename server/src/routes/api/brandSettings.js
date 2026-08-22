const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');

const updateSchema = z.object({ brandStyleProfile: z.object({ colors: z.array(z.string()), tone: z.string() }) });
const extractSchema = z.object({ imageUrls: z.array(z.string().url()).min(1).max(10) });

/**
 * @param {{ shopsRepo: object, brandStyle: object }} deps
 */
function createBrandSettingsRouter({ shopsRepo, brandStyle }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ brandStyleProfile: req.shop.brandStyleProfile ?? null });
  });

  router.put(
    '/',
    wrapAsync(async (req, res) => {
      const { brandStyleProfile } = updateSchema.parse(req.body);
      await shopsRepo.updateShop(req.shopDomain, { brandStyleProfile });
      res.json({ brandStyleProfile });
    }),
  );

  router.post(
    '/extract',
    wrapAsync(async (req, res) => {
      const { imageUrls } = extractSchema.parse(req.body);
      const brandStyleProfile = await brandStyle.extractBrandStyle({ imageUrls });
      await shopsRepo.updateShop(req.shopDomain, { brandStyleProfile });
      res.json({ brandStyleProfile });
    }),
  );

  return router;
}

module.exports = { createBrandSettingsRouter };
