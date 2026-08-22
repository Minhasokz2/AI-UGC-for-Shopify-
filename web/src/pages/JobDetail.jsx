import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { BlockStack, Card, Text, InlineGrid, Checkbox, Button, Banner } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { JobStatusBadge } from '../components/generation/JobStatusBadge.jsx';
import { ProductPicker } from '../components/generation/ProductPicker.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { useJob, usePublishJob } from '../hooks/useJob.js';
import { useJobStatusToast } from '../hooks/useJobStatusToast.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';
import { getRememberedProductId } from '../lib/sourceImageProductMap.js';

export function JobDetail() {
  const { jobId } = useParams();
  const { data, isLoading, isError, error } = useJob(jobId);
  const job = data?.job;

  useJobStatusToast(job);

  const [approvedIndices, setApprovedIndices] = useState([]);
  const [productIds, setProductIds] = useState([]);
  const publishJob = usePublishJob();
  const { showApiError, showSuccess } = useAppBridgeToast();

  useEffect(() => {
    if (job?.sourceImageUrl) {
      const remembered = getRememberedProductId(job.sourceImageUrl);
      if (remembered) setProductIds([remembered]);
    }
  }, [job?.sourceImageUrl]);

  if (isLoading) return <PageSkeleton title="Job"><LoadingState label="Loading job…" /></PageSkeleton>;
  if (isError) return <PageSkeleton title="Job"><ErrorState error={error} title="Couldn't load job" /></PageSkeleton>;

  function toggleVariation(index) {
    setApprovedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  }

  async function handlePublish() {
    try {
      const result = await publishJob.mutateAsync({
        jobId: job.id,
        shopifyProductId: productIds[0],
        approvedVariationIndices: approvedIndices,
      });
      if (result.alreadyPublished) {
        showSuccess('This job was already published to that product.');
      } else {
        showSuccess('Published to your product.');
      }
    } catch (err) {
      showApiError(err);
    }
  }

  const canPublish = job.status === 'succeeded' && approvedIndices.length > 0 && productIds.length > 0;

  return (
    <PageSkeleton title="Job detail" backAction={{ content: 'Job History', url: '/jobs' }}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="span">
              {job.contentType} · <JobStatusBadge status={job.status} />
            </Text>
            <Text as="span" tone="subdued">
              {job.id}
            </Text>
            {job.publishStatus && (
              <Text as="span" tone="subdued">
                Publish status: {job.publishStatus}
              </Text>
            )}
          </BlockStack>
        </Card>

        {job.status === 'succeeded' && (
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Review &amp; approve variations
              </Text>
              <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
                {(job.resultVariations ?? []).map((variation, index) => (
                  <BlockStack key={index} gap="100">
                    <img
                      src={variation.url}
                      alt={`Variation ${index + 1}`}
                      style={{ width: '100%', borderRadius: 8 }}
                    />
                    <Checkbox
                      label={`Approve #${index + 1}`}
                      checked={approvedIndices.includes(index)}
                      onChange={() => toggleVariation(index)}
                    />
                  </BlockStack>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        )}

        {job.status === 'succeeded' && (
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Publish to product
              </Text>
              <ProductPicker
                selectedIds={productIds}
                onChangeSelected={(ids) => setProductIds(ids)}
              />
              <Button variant="primary" disabled={!canPublish} loading={publishJob.isPending} onClick={handlePublish}>
                Publish approved variations
              </Button>
              {publishJob.isError && publishJob.error?.shopifyErrors && (
                <Banner tone="critical" title="Shopify rejected the media">
                  <BlockStack gap="100">
                    {publishJob.error.shopifyErrors.map((e, i) => (
                      <Text as="p" key={i}>
                        {e.field}: {e.message}
                      </Text>
                    ))}
                  </BlockStack>
                </Banner>
              )}
            </BlockStack>
          </Card>
        )}

        {job.status === 'failed' && (
          <Banner tone="critical" title="This job failed">
            <Text as="p">You can try generating again from the same flow.</Text>
          </Banner>
        )}
      </BlockStack>
    </PageSkeleton>
  );
}
