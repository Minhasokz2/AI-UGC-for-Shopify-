import { BlockStack, Text, Select } from '@shopify/polaris';
import { useModels } from '../../hooks/useModels.js';
import { LoadingState } from '../feedback/LoadingState.jsx';
import { ErrorState } from '../feedback/ErrorState.jsx';

function creditLabel(creditCost) {
  return `${creditCost} credit${creditCost === 1 ? '' : 's'}`;
}

/**
 * Renders first and is the ONLY enabled control until a model is chosen —
 * callers must not mount the image-attach UI before selectedModel exists.
 *
 * A single dropdown rather than a card grid — the catalog runs well past a
 * dozen models, which made the old one-card-per-model grid the tallest
 * section on every generation page.
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
  const selectedModel = models.find((model) => model.id === selectedModelId);

  const options = [
    { label: 'Select a model…', value: '' },
    ...models.map((model) => ({ label: `${model.label} (${creditLabel(model.creditCost)})`, value: model.id })),
  ];

  function handleChange(value) {
    const model = models.find((m) => m.id === value);
    if (model) onSelect(model);
  }

  return (
    <BlockStack gap="200">
      <Select label="Choose a model" options={options} value={selectedModelId ?? ''} onChange={handleChange} />
      {selectedModel && (
        <Text as="span" tone="subdued">
          {creditLabel(selectedModel.creditCost)} per generation
        </Text>
      )}
    </BlockStack>
  );
}
