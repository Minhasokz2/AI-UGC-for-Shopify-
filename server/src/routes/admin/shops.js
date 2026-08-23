// Admin-only shop listing + manual credit adjustment — for granting test
// credits to a dev/admin shop, or correcting a balance by hand, without
// needing a real Shopify App Pricing charge to run through the app first.

const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { NotFoundError } = require('../../errors/AppError');

const adjustCreditsSchema = z.object({ amount: z.number().int().refine((n) => n !== 0, 'amount must not be 0') });

/**
 * @param {{ shopsRepo: object, FieldValue: object }} deps
 */
function createAdminShopsRouter({ shopsRepo, FieldValue }) {
  const router = express.Router();

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const shops = await shopsRepo.listInstalledShops({ limit: 200 });
      res.json({
        shops: shops.map((shop) => ({
          shopDomain: shop.id,
          plan: shop.plan,
          creditBalance: shop.creditBalance,
          verifiedEmail: shop.verifiedEmail,
        })),
      });
    }),
  );

  router.post(
    '/:shopDomain/credits',
    wrapAsync(async (req, res) => {
      const { amount } = adjustCreditsSchema.parse(req.body);
      const shop = await shopsRepo.getShop(req.params.shopDomain);
      if (!shop) throw new NotFoundError('Shop not found');

      await shopsRepo.updateShop(req.params.shopDomain, { creditBalance: FieldValue.increment(amount) });
      const updated = await shopsRepo.getShop(req.params.shopDomain);
      res.json({ shopDomain: updated.id, creditBalance: updated.creditBalance });
    }),
  );

  return router;
}

module.exports = { createAdminShopsRouter };
