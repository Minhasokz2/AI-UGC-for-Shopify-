import { Card, BlockStack, Text, Button } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';

export function WelcomeCard() {
  const navigate = useNavigate();
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Welcome to AI UGC Generator
        </Text>
        <Text as="p" tone="subdued">
          Generate AI product photography, UGC-style on-model images, and short product videos
          from your catalog. Start with a template, or build a custom prompt in the Studio.
        </Text>
        <Button variant="primary" onClick={() => navigate('/generate')}>
          Create your first generation
        </Button>
      </BlockStack>
    </Card>
  );
}
