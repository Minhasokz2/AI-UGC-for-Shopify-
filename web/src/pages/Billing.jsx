import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BlockStack, Card, Text } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { PricingTable } from '../components/billing/PricingTable.jsx';
import {
  useBillingStatus,
  useBillingPacks,
  useConfirmAppPricingPlan,
  redirectTopLevel,
} from '../hooks/usePricingPreview.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';
import { useQueryClient } from '@tanstack/react-query';

export function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: status, isLoading, isError, error } = useBillingStatus();
  const { data: packsData } = useBillingPacks();
  const confirmAppPricingPlan = useConfirmAppPricingPlan();
  const { showApiError, showSuccess, showError } = useAppBridgeToast();
  const queryClient = useQueryClient();

  // After Shopify redirects the merchant back from its hosted pricing page,
  // the redirection URL (configured per-plan in Partner Dashboard, currently
  // <APP_URL>/billing) carries a `plan_handle` query param. The server never
  // trusts this param alone — it re-verifies against the Partner API before
  // granting anything (see billingService.confirmAppPricingPlan).
  useEffect(() => {
    const planHandle = searchParams.get('plan_handle');
    if (!planHandle) return;

    confirmAppPricingPlan
      .mutateAsync({ planHandle })
      .then((result) => {
        queryClient.invalidateQueries({ queryKey: ['shopStatus'] });
        if (result.confirmed) {
          showSuccess('Billing confirmed.');
        } else {
          showError("Couldn't confirm your plan yet — it can take a moment to activate. Refresh in a bit.");
        }
      })
      .catch((err) => showApiError(err))
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('plan_handle');
        next.delete('shop');
        setSearchParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleViewPlans() {
    redirectTopLevel(packsData.pricingPlansUrl);
  }

  if (isLoading) return <PageSkeleton title="Billing"><LoadingState label="Loading billing…" /></PageSkeleton>;
  if (isError) return <PageSkeleton title="Billing"><ErrorState error={error} title="Couldn't load billing status" /></PageSkeleton>;

  return (
    <PageSkeleton title="Billing">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="100">
            <Text as="span">Current plan: {status.plan}</Text>
            <Text as="span">Credit balance: {status.creditBalance}</Text>
          </BlockStack>
        </Card>

        {packsData && (
          <Card>
            <PricingTable packs={packsData.packs} unlimitedPlan={packsData.unlimitedPlan} onViewPlans={handleViewPlans} />
          </Card>
        )}
      </BlockStack>
    </PageSkeleton>
  );
}
