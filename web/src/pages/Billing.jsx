import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BlockStack, Card, Text } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { PricingTable } from '../components/billing/PricingTable.jsx';
import { CustomAmountPreview } from '../components/billing/CustomAmountPreview.jsx';
import {
  useBillingStatus,
  useBillingPacks,
  useSubscribeToPack,
  useSubscribeUnlimited,
  useCustomPurchase,
  useConfirmCharge,
  redirectTopLevel,
} from '../hooks/usePricingPreview.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';
import { useQueryClient } from '@tanstack/react-query';

export function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: status, isLoading, isError, error } = useBillingStatus();
  const { data: packsData } = useBillingPacks();
  const subscribeToPack = useSubscribeToPack();
  const subscribeUnlimited = useSubscribeUnlimited();
  const customPurchase = useCustomPurchase();
  const confirmCharge = useConfirmCharge();
  const { showApiError, showSuccess } = useAppBridgeToast();
  const queryClient = useQueryClient();

  // After Shopify redirects the merchant back from the confirmation page,
  // the returnUrl (server-controlled, currently <APP_URL>/billing) carries
  // Shopify's own query params — commonly charge_id.
  useEffect(() => {
    const chargeId = searchParams.get('charge_id');
    if (!chargeId) return;

    confirmCharge
      .mutateAsync({ chargeId })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['shopStatus'] });
        showSuccess('Billing confirmed.');
      })
      .catch((err) => showApiError(err))
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete('charge_id');
        setSearchParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSubscribe(packId, period) {
    try {
      const { confirmationUrl } = await subscribeToPack.mutateAsync({ packId, period });
      redirectTopLevel(confirmationUrl);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleSubscribeUnlimited() {
    try {
      const { confirmationUrl } = await subscribeUnlimited.mutateAsync();
      redirectTopLevel(confirmationUrl);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleCustomPurchase(amountCents) {
    try {
      const { confirmationUrl } = await customPurchase.mutateAsync({ amountCents });
      redirectTopLevel(confirmationUrl);
    } catch (err) {
      showApiError(err);
    }
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
            <PricingTable
              packs={packsData.packs}
              unlimitedPlan={packsData.unlimitedPlan}
              onSubscribe={handleSubscribe}
              onSubscribeUnlimited={handleSubscribeUnlimited}
              pendingPackId={subscribeToPack.isPending ? subscribeToPack.variables?.packId : undefined}
              isUnlimitedPending={subscribeUnlimited.isPending}
            />
          </Card>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Custom top-up
            </Text>
            <CustomAmountPreview onPurchase={handleCustomPurchase} isPending={customPurchase.isPending} />
          </BlockStack>
        </Card>
      </BlockStack>
    </PageSkeleton>
  );
}
