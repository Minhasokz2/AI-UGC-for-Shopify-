import { useState } from 'react';
import { BlockStack, Card, Text, Button, TextField, ResourceList, ResourceItem, Badge, InlineStack } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { EmptyState } from '../components/feedback/EmptyState.jsx';
import { useReferral, useApplyReferralCode } from '../hooks/useReferral.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

const APPLY_RESULT_MESSAGES = {
  unknown_code: "That code doesn't match any shop.",
  self_referral: "You can't refer yourself.",
  already_referred: 'This shop already has a referral on file.',
};

export function Referrals() {
  const { data, isLoading, isError, error } = useReferral();
  const applyCode = useApplyReferralCode();
  const [enteredCode, setEnteredCode] = useState('');
  const { showSuccess, showError, showApiError } = useAppBridgeToast();

  if (isLoading) return <PageSkeleton title="Referrals"><LoadingState label="Loading referrals…" /></PageSkeleton>;
  if (isError) return <PageSkeleton title="Referrals"><ErrorState error={error} title="Couldn't load referrals" /></PageSkeleton>;

  const { code, referrals } = data;

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    showSuccess('Referral code copied.');
  }

  async function handleApplyCode() {
    try {
      const result = await applyCode.mutateAsync(enteredCode.trim());
      if (result.applied) {
        showSuccess('Referral code applied.');
        setEnteredCode('');
      } else {
        showError(APPLY_RESULT_MESSAGES[result.reason] ?? "Couldn't apply that code.");
      }
    } catch (err) {
      showApiError(err);
    }
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
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Have a referral code?
            </Text>
            <InlineStack gap="200" blockAlign="end">
              <div style={{ flexGrow: 1 }}>
                <TextField
                  label="Referral code"
                  labelHidden
                  value={enteredCode}
                  onChange={setEnteredCode}
                  autoComplete="off"
                  placeholder="Enter a code"
                />
              </div>
              <Button onClick={handleApplyCode} loading={applyCode.isPending} disabled={!enteredCode.trim()}>
                Apply
              </Button>
            </InlineStack>
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
