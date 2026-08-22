import { Spinner, BlockStack, Text } from '@shopify/polaris';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <BlockStack inlineAlign="center" gap="200">
      <Spinner accessibilityLabel={label} size="large" />
      <Text as="p" tone="subdued">
        {label}
      </Text>
    </BlockStack>
  );
}
