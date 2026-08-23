import { InlineGrid, Card, BlockStack, Text, Button, ButtonGroup } from '@shopify/polaris';
import { useState } from 'react';
import { formatCurrency } from '../../lib/formatCurrency.js';

/**
 * @param {{
 *   packs: object[], unlimitedPlan: object,
 *   onSubscribe: (packId: string, period: string) => void,
 *   onSubscribeUnlimited: () => void,
 *   pendingPackId: string|undefined, isUnlimitedPending: boolean,
 * }} props `pendingPackId`/`isUnlimitedPending` identify which single button
 *   actually triggered a submission, so only THAT button shows a spinner —
 *   the others are merely disabled while any one submission is in flight,
 *   rather than every plan going into a loading state for one click.
 */
export function PricingTable({ packs, unlimitedPlan, onSubscribe, onSubscribeUnlimited, pendingPackId, isUnlimitedPending }) {
  const [period, setPeriod] = useState('monthly');
  const anyPending = Boolean(pendingPackId) || isUnlimitedPending;

  return (
    <BlockStack gap="400">
      <ButtonGroup variant="segmented">
        <Button pressed={period === 'monthly'} onClick={() => setPeriod('monthly')}>
          Monthly
        </Button>
        <Button pressed={period === 'annual'} onClick={() => setPeriod('annual')}>
          Annual
        </Button>
      </ButtonGroup>

      <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
        {packs.map((pack) => {
          const priceCents = period === 'monthly' ? pack.monthlyPriceCents : pack.annualPriceCents;
          const credits = period === 'monthly' ? pack.monthlyCredits : pack.annualCredits;
          return (
            <Card key={pack.id}>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  {pack.label}
                </Text>
                <Text as="p" variant="headingLg">
                  {formatCurrency(priceCents)}
                  <Text as="span" tone="subdued">
                    {' '}
                    / {period === 'monthly' ? 'mo' : 'yr'}
                  </Text>
                </Text>
                <Text as="p" tone="subdued">
                  {credits} credits
                </Text>
                <Button
                  variant="primary"
                  onClick={() => onSubscribe(pack.id, period)}
                  loading={pack.id === pendingPackId}
                  disabled={anyPending && pack.id !== pendingPackId}
                >
                  Choose {pack.label}
                </Button>
              </BlockStack>
            </Card>
          );
        })}

        {unlimitedPlan && (
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                {unlimitedPlan.label}
              </Text>
              <Text as="p" variant="headingLg">
                {formatCurrency(unlimitedPlan.monthlyPriceCents)}
                <Text as="span" tone="subdued">
                  {' '}
                  / mo
                </Text>
              </Text>
              <Text as="p" tone="subdued">
                Unlimited generations, fair use up to {unlimitedPlan.fairUseCreditsPerMonth?.toLocaleString()} credits/mo
              </Text>
              <Button variant="primary" onClick={onSubscribeUnlimited} loading={isUnlimitedPending} disabled={anyPending && !isUnlimitedPending}>
                Go Unlimited
              </Button>
            </BlockStack>
          </Card>
        )}
      </InlineGrid>
    </BlockStack>
  );
}
