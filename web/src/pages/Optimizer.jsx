import { useState } from 'react';
import { BlockStack, Card, Text, Button, ButtonGroup, ResourceList, ResourceItem } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { ProductPicker } from '../components/generation/ProductPicker.jsx';
import { BeforeAfterSlider } from '../components/generation/BeforeAfterSlider.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { EmptyState } from '../components/feedback/EmptyState.jsx';
import { useOptimizerJobs, useCreateOptimizerJob } from '../hooks/useOptimizerJobs.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

const OPERATIONS = [
  { id: 'upscale_budget', label: 'Upscale (budget)' },
  { id: 'upscale_premium', label: 'Upscale (premium)' },
  { id: 'retouch', label: 'Retouch' },
];

export function Optimizer() {
  const [productIds, setProductIds] = useState([]);
  const [products, setProducts] = useState([]);
  const [operation, setOperation] = useState('upscale_budget');
  const createOptimizerJob = useCreateOptimizerJob();
  const { data, isLoading, isError, error } = useOptimizerJobs();
  const { showApiError, showSuccess, showError } = useAppBridgeToast();

  const product = products[0];
  const imageUrl = product?.imageUrls?.[0];

  async function handleSubmit() {
    if (!product || !imageUrl) return;
    try {
      await createOptimizerJob.mutateAsync({
        shopifyProductId: product.shopifyProductId,
        imageUrl,
        operation,
      });
      showSuccess('Optimization started.');
    } catch (err) {
      if (err.code === 'QUOTA_EXCEEDED') {
        showError('Daily free quota exhausted — upgrade for more optimizations.');
      } else {
        showApiError(err);
      }
    }
  }

  const jobs = data?.jobs ?? [];

  return (
    <PageSkeleton title="Image Optimizer">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <ProductPicker
              selectedIds={productIds}
              onChangeSelected={(ids, prods) => {
                setProductIds(ids);
                setProducts(prods);
              }}
            />
            <BlockStack gap="200">
              <Text as="span" fontWeight="semibold">
                Operation
              </Text>
              <ButtonGroup variant="segmented">
                {OPERATIONS.map((op) => (
                  <Button key={op.id} pressed={operation === op.id} onClick={() => setOperation(op.id)}>
                    {op.label}
                  </Button>
                ))}
              </ButtonGroup>
            </BlockStack>
            <Button variant="primary" disabled={!product} loading={createOptimizerJob.isPending} onClick={handleSubmit}>
              Optimize
            </Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Recent optimizations
            </Text>
            {isLoading && <LoadingState label="Loading…" />}
            {isError && <ErrorState error={error} />}
            {!isLoading && !isError && jobs.length === 0 && (
              <EmptyState heading="No optimizations yet" />
            )}
            {!isLoading && !isError && jobs.length > 0 && (
              <ResourceList
                resourceName={{ singular: 'job', plural: 'jobs' }}
                items={jobs}
                renderItem={(job) => (
                  <ResourceItem id={job.id}>
                    <BlockStack gap="200">
                      <Text as="span">
                        {job.operation} — {job.status}
                      </Text>
                      {job.status === 'succeeded' && job.resultImageUrl && (
                        <BeforeAfterSlider beforeUrl={job.imageUrl} afterUrl={job.resultImageUrl} />
                      )}
                    </BlockStack>
                  </ResourceItem>
                )}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </PageSkeleton>
  );
}
