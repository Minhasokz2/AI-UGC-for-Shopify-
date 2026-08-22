import { BlockStack, Card, Text, Button, ResourceList, ResourceItem, Badge, InlineStack } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { EmptyState } from '../components/feedback/EmptyState.jsx';
import { useReferral } from '../hooks/useReferral.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

export function Referrals() {
  const { data, isLoading, isError, error } = useReferral();
  const { showSuccess } = useAppBridgeToast();

  if (isLoading) return <PageSkeleton title="Referrals"><LoadingState label="Loading referrals…" /></PageSkeleton>;
  if (isError) return <PageSkeleton title="Referrals"><ErrorState error={error} title="Couldn't load referrals" /></PageSkeleton>;

  const { code, referrals } = data;

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    showSuccess('Referral code copied.');
  }

  return (
    <PageSkeleton title="Referrals">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Your referral code
            </Text>
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="headingLg">
                {code}
              </Text>
              <Button onClick={copyCode}>Copy</Button>
            </InlineStack>
            <Text as="p" tone="subdued">
              Payouts are tracked here but processed manually by our team once a month — Shopify's
              billing platform doesn't support automatic payouts to third-party merchants, so
              there's no automatic payout button.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          {referrals.length === 0 ? (
            <EmptyState heading="No referrals yet">
              <Text as="p">Share your code to start earning commission.</Text>
            </EmptyState>
          ) : (
            <ResourceList
              resourceName={{ singular: 'referral', plural: 'referrals' }}
              items={referrals}
              renderItem={(referral) => (
                <ResourceItem id={referral.id}>
                  <InlineStack align="space-between">
                    <BlockStack gap="050">
                      <Text as="span">{referral.referredShopDomain}</Text>
                      <Text as="span" tone="subdued">
                        ${(referral.commissionOwedCents / 100).toFixed(2)} owed
                      </Text>
                    </BlockStack>
                    <Badge tone={referral.status === 'converted' ? 'success' : 'info'}>
                      {referral.status}
                    </Badge>
                  </InlineStack>
                </ResourceItem>
              )}
            />
          )}
        </Card>
      </BlockStack>
    </PageSkeleton>
  );
}
