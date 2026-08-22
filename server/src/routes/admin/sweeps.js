// ADMIN_API_KEY-gated endpoints a free external pinger (cron-job.org, a
// scheduled GitHub Action) hits on a schedule, since Render's free tier has
// no native Cron Job service. Both sweeps are plain functions elsewhere
// (billingReconciliation.runReconciliationSweep, nurtureEmailService.runNurtureSweep)
// also invocable from a local CLI script — this route is just a third way to
// trigger the exact same code.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ billingReconciliation: object, nurtureEmailService: object }} deps
 */
function createSweepsRouter({ billingReconciliation, nurtureEmailService }) {
  const router = express.Router();

  router.post(
    '/billing',
    wrapAsync(async (req, res) => {
      const result = await billingReconciliation.runReconciliationSweep();
      res.json(result);
    }),
  );

  router.post(
    '/nurture',
    wrapAsync(async (req, res) => {
      const result = await nurtureEmailService.runNurtureSweep();
      res.json(result);
    }),
  );

  return router;
}

module.exports = { createSweepsRouter };
