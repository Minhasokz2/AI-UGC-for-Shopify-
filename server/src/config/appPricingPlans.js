// Shopify App Pricing plan handles. Each of this app's 4 plans is ONE plan in
// Partner Dashboard ("Monthly recurring, with yearly discount" billing type)
// covering BOTH periods — there is no separate annual plan/handle. Which
// period a merchant actually picked comes back on the Partner API's
// activeSubscription.billingPeriod field ('ANNUAL' | 'EVERY_30_DAYS'), NOT
// from the handle — see billingService.confirmAppPricingPlan and
// billingReconciliation.reconcileShop, which read that field to choose
// monthly vs annual credits.
//
// Fill in / update a value here to match the exact `plan_handle` shown when
// you create or edit the plan in Partner Dashboard > your app > Distribution
// > Manage listing > Pricing content > Manage. Leave a value `null` if that
// plan doesn't exist yet in Shopify App Pricing; the pricing table only
// offers a pack once its handle is filled in here.
const PLAN_HANDLES = {
  starter: 'starter',
  growth: 'growth',
  scale: 'scale-monthly',
  unlimited: 'unlimited-monthly',
};

/**
 * @param {string} planHandle
 * @returns {{ packId: string }|{ unlimited: true }|null}
 */
function resolvePlanFromHandle(planHandle) {
  if (!planHandle) return null;
  if (PLAN_HANDLES.unlimited === planHandle) return { unlimited: true };
  for (const packId of ['starter', 'growth', 'scale']) {
    if (PLAN_HANDLES[packId] === planHandle) return { packId };
  }
  return null;
}

module.exports = { PLAN_HANDLES, resolvePlanFromHandle };
