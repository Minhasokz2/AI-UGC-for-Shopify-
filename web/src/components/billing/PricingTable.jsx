import { InlineGrid, Card, BlockStack, Text, Button, ButtonGroup } from '@shopify/polaris';
import { useState } from 'react';
import { formatCurrency } from '../../lib/formatCurrency.js';

/**
 * Purely informational pricing display — Shopify App Pricing means Shopify
 * itself hosts the actual plan picker and processes the charge, so this
 * table has no per-plan "Choose" buttons anymore. One CTA sends the merchant
 * to Shopify's hosted page (onViewPlans), where they pick and confirm.
 * @param {{ packs: object[], unlimitedPlan: object, onViewPlans: () => void }} props
 */
export function PricingTable({ packs, unlimitedPlan, onViewPlans }) {
  const [period, setPeriod] = useState('monthly');

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
                {formatCurrency(period === 'monthly' ? unlimitedPlan.monthlyPriceCents : unlimitedPlan.annualPriceCents)}
                <Text as="span" tone="subdued">
                  {' '}
                  / {period === 'monthly' ? 'mo' : 'yr'}
                </Text>
              </Text>
              <Text as="p" tone="subdued">
                Unlimited generations, fair use up to{' '}
                {(period === 'monthly' ? unlimitedPlan.fairUseCreditsPerMonth : unlimitedPlan.fairUseCreditsPerMonthAnnual)?.toLocaleString()}{' '}
                credits/mo
              </Text>
            </BlockStack>
          </Card>
        )}
      </InlineGrid>

      <BlockStack gap="100" inlineAlign="start">
        <Button variant="primary" onClick={onViewPlans}>
          View plans &amp; subscribe
        </Button>
        <Text as="p" tone="subdued">
          You&apos;ll choose and confirm your plan on Shopify&apos;s own billing page.
        </Text>
      </BlockStack>
    </BlockStack>
  );
}
