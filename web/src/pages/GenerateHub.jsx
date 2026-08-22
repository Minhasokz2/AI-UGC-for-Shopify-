import { InlineGrid, Card, BlockStack, Text, Button } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';

const MODES = [
  { path: '/templates', title: 'Template Gallery', description: 'Pick a ready-made template and a product image.' },
  { path: '/studio', title: 'Custom Prompt Studio', description: 'Pick a model and write your own prompt.' },
  { path: '/persona', title: 'Persona Builder', description: 'Generate UGC-style on-model images.' },
  { path: '/video', title: 'Video Studio', description: 'Turn a product image into a short motion video.' },
  { path: '/try-on', title: 'Virtual Try-On', description: 'Combine a person photo and a garment photo.' },
];

export function GenerateHub() {
  const navigate = useNavigate();
  return (
    <PageSkeleton title="Generate">
      <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
        {MODES.map((mode) => (
          <Card key={mode.path}>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                {mode.title}
              </Text>
              <Text as="p" tone="subdued">
                {mode.description}
              </Text>
              <Button onClick={() => navigate(mode.path)}>Open</Button>
            </BlockStack>
          </Card>
        ))}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Bulk Generation
            </Text>
            <Text as="p" tone="subdued">
              Apply one prompt/model/tier across many products at once.
            </Text>
            <Button onClick={() => navigate('/bulk')}>Open</Button>
          </BlockStack>
        </Card>
      </InlineGrid>
    </PageSkeleton>
  );
}
