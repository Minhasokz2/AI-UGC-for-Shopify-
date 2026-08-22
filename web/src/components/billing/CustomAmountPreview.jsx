import { useState } from 'react';
import { BlockStack, TextField, Text, Button } from '@shopify/polaris';
import { useCustomPurchasePreview } from '../../hooks/usePricingPreview.js';

export function CustomAmountPreview({ onPurchase, isPending }) {
  const [amountDollars, setAmountDollars] = useState('');
  const amountCents = amountDollars ? Math.round(parseFloat(amountDollars) * 100) : NaN;
  const { data, isFetching } = useCustomPurchasePreview(Number.isInteger(amountCents) ? amountCents : undefined);

  return (
    <BlockStack gap="200">
      <TextField
        label="Custom amount (USD)"
        type="number"
        value={amountDollars}
        onChange={setAmountDollars}
        prefix="$"
        autoComplete="off"
      />
      {isFetching && <Text as="p">Calculating…</Text>}
      {data && !isFetching && (
        <Text as="p" tone="subdued">
          ${amountDollars} gets you {data.credits} credits
        </Text>
      )}
      <Button
        onClick={() => onPurchase(amountCents)}
        disabled={!Number.isInteger(amountCents) || amountCents <= 0}
        loading={isPending}
      >
        Purchase
      </Button>
    </BlockStack>
  );
}
