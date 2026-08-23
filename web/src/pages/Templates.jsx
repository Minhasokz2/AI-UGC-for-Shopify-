import { useState } from 'react';
import { BlockStack, InlineGrid, Card, Text, Button, Modal, TextField, ButtonGroup } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { ProductPicker } from '../components/generation/ProductPicker.jsx';
import { AgeConfirmationCheckbox } from '../components/generation/AgeConfirmationCheckbox.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { EmptyState } from '../components/feedback/EmptyState.jsx';
import { useTemplates } from '../hooks/useTemplates.js';
import { useCreateJob } from '../hooks/useJobs.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';
import { rememberSourceImageProduct } from '../lib/sourceImageProductMap.js';

const CATEGORIES = ['scene', 'ugc', 'video'];

export function Templates() {
  const [category, setCategory] = useState(undefined);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [numImages, setNumImages] = useState('1');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const { data, isLoading, isError, error } = useTemplates({ category });
  const createJob = useCreateJob();
  const { showApiError, showSuccess } = useAppBridgeToast();
  const navigate = useNavigate();

  const templates = data?.templates ?? [];

  function openFlow(template) {
    setActiveTemplate(template);
    setSelectedProductIds([]);
    setSelectedProducts([]);
    setNumImages('1');
    setAgeConfirmed(false);
  }

  const isUgcTemplate = activeTemplate?.category === 'ugc';

  async function handleGenerate() {
    const product = selectedProducts[0];
    if (!product) return;
    try {
      const sourceImageUrl = product.imageUrls?.[0];
      const { job } = await createJob.mutateAsync({
        contentType: activeTemplate.category,
        templateId: activeTemplate.id,
        sourceImageUrl,
        numImages: Number(numImages) || 1,
        // The UGC template always 422'd without this — personaGuard requires
        // it for any contentType:'ugc' job, and this modal never collected it.
        ...(isUgcTemplate ? { personaAttributes: { ageRange: 'adult' } } : {}),
      });
      rememberSourceImageProduct(sourceImageUrl, product.shopifyProductId);
      showSuccess('Job created — track it in Job History.');
      setActiveTemplate(null);
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <PageSkeleton title="Template Gallery">
      <BlockStack gap="400">
        <ButtonGroup variant="segmented">
          <Button pressed={!category} onClick={() => setCategory(undefined)}>
            All
          </Button>
          {CATEGORIES.map((c) => (
            <Button key={c} pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </Button>
          ))}
        </ButtonGroup>

        {isLoading && <LoadingState label="Loading templates…" />}
        {isError && <ErrorState error={error} title="Couldn't load templates" />}
        {!isLoading && !isError && templates.length === 0 && (
          <EmptyState heading="No templates found">
            <Text as="p">Try a different category.</Text>
          </EmptyState>
        )}

        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
          {templates.map((template) => (
            <Card key={template.id}>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  {template.label}
                </Text>
                <Text as="p" tone="subdued">
                  {template.category} · {template.creditCost} credits
                </Text>
                <Button onClick={() => openFlow(template)}>Use this template</Button>
              </BlockStack>
            </Card>
          ))}
        </InlineGrid>
      </BlockStack>

      {activeTemplate && (
        <Modal
          open
          onClose={() => setActiveTemplate(null)}
          title={`Use "${activeTemplate.label}"`}
          primaryAction={{
            content: 'Generate',
            onAction: handleGenerate,
            disabled: selectedProducts.length === 0 || (isUgcTemplate && !ageConfirmed),
            loading: createJob.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setActiveTemplate(null) }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <ProductPicker
                selectedIds={selectedProductIds}
                onChangeSelected={(ids, products) => {
                  setSelectedProductIds(ids);
                  setSelectedProducts(products);
                }}
              />
              <TextField
                label="Number of images"
                type="number"
                value={numImages}
                onChange={setNumImages}
                min={1}
                max={10}
                autoComplete="off"
              />
              {isUgcTemplate && <AgeConfirmationCheckbox checked={ageConfirmed} onChange={setAgeConfirmed} />}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </PageSkeleton>
  );
}
