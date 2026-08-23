// Shopify App Pricing plan handles. Shopify assigns (or lets you confirm) a
// `plan_handle` per plan when you create it in Partner Dashboard > your app >
// Distribution > Manage listing > Pricing content > Manage. Open each plan's
// settings there to find its exact handle, then fill it in below — this file
// is the single place the returnUrl's `plan_handle` query param (and the
// Partner API's activeSubscription.items[].handle) gets mapped back to one of
// this app's own credit packs. Leave a value `null` if that plan/period
// doesn't exist yet in Shopify App Pricing; the pricing table only offers a
// pack/period once its handle is filled in here.
const PLAN_HANDLES = {
  starter: { monthly: 'starter', annual: null },
  growth: { monthly: 'growth', annual: null },
  scale: { monthly: 'scale-monthly', annual: null },
  unlimited: { monthly: 'unlimited-monthly' },
};

/**
 * @param {string} planHandle
 * @returns {{ packId: string, period: 'monthly'|'annual' }|{ unlimited: true }|null}
 */
function resolvePlanFromHandle(planHandle) {
  if (!planHandle) return null;
  if (PLAN_HANDLES.unlimited.monthly === planHandle) return { unlimited: true };
  for (const packId of ['starter', 'growth', 'scale']) {
    for (const period of ['monthly', 'annual']) {
      if (PLAN_HANDLES[packId][period] === planHandle) return { packId, period };
    }
  }
  return null;
}

module.exports = { PLAN_HANDLES, resolvePlanFromHandle };
