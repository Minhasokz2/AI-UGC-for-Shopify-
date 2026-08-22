import { BlockStack, InlineStack, Text, ProgressBar, Badge } from '@shopify/polaris';

export function BatchProgressBar({ batch }) {
  const total = batch.totalCount || 0;
  const done = (batch.succeededCount ?? 0) + (batch.failedCount ?? 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between">
        <Text as="span" fontWeight="semibold">
          {done} / {total} processed
        </Text>
        <Badge tone={batch.status === 'complete' ? 'success' : 'attention'}>{batch.status}</Badge>
      </InlineStack>
      <ProgressBar progress={progress} />
      <InlineStack gap="400">
        <Text as="span" tone="success">
          {batch.succeededCount ?? 0} succeeded
        </Text>
        <Text as="span" tone="critical">
          {batch.failedCount ?? 0} failed
        </Text>
      </InlineStack>
    </BlockStack>
  );
}
