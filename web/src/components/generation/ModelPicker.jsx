import { BlockStack, Text, InlineGrid, Button, Card } from '@shopify/polaris';
import { useModels } from '../../hooks/useModels.js';
import { LoadingState } from '../feedback/LoadingState.jsx';
import { ErrorState } from '../feedback/ErrorState.jsx';

/**
 * Renders first and is the ONLY enabled control until a model is chosen —
 * callers must not mount the image-attach UI before selectedModel exists.
 *
 * `excludeCategories` filters client-side after the fetch — `eligibleFlow`
 * alone isn't a sufficient filter for e.g. Custom Prompt Studio, since
 * background-removal, video, and try-on models all also list 'custom' among
 * their eligibleFlows despite needing a different UI/flow than this generic
 * prompt+image picker offers.
 * @param {{ category?: string, eligibleFlow?: string, excludeCategories?: string[], selectedModelId?: string, onSelect: (model: object) => void }} props
 */
export function ModelPicker({ category, eligibleFlow, excludeCategories, selectedModelId, onSelect }) {
  const { data, isLoading, isError, error } = useModels({ category, eligibleFlow });

  if (isLoading) return <LoadingState label="Loading models…" />;
  if (isError) return <ErrorState error={error} title="Couldn't load models" />;

  const models = (data?.models ?? []).filter((model) => !excludeCategories?.includes(model.category));

  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingSm">
        Choose a model
      </Text>
      <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
        {models.map((model) => (
          <Card key={model.id} background={model.id === selectedModelId ? 'bg-surface-selected' : undefined}>
            <BlockStack gap="200">
              <Text as="span" fontWeight="semibold">
                {model.label}
              </Text>
              <Text as="span" tone="subdued">
                {model.creditCost} credits
              </Text>
              <Button
                pressed={model.id === selectedModelId}
                onClick={() => onSelect(model)}
              >
                {model.id === selectedModelId ? 'Selected' : 'Select'}
              </Button>
            </BlockStack>
          </Card>
        ))}
      </InlineGrid>
    </BlockStack>
  );
}
