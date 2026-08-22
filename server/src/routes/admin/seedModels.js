const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ db: object, seedAllowedModels: Function }} deps
 */
function createSeedModelsRouter({ db, seedAllowedModels }) {
  const router = express.Router();

  router.post(
    '/',
    wrapAsync(async (req, res) => {
      const result = await seedAllowedModels({ db });
      res.json(result);
    }),
  );

  return router;
}

module.exports = { createSeedModelsRouter };
