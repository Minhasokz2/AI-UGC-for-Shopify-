import { useParams, Link } from 'react-router-dom';
import { BlockStack, Card, ResourceList, ResourceItem, Text } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { BatchProgressBar } from '../components/generation/BatchProgressBar.jsx';
import { JobStatusBadge } from '../components/generation/JobStatusBadge.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { useBatch } from '../hooks/useBatch.js';
import { useJobListStatusToasts } from '../hooks/useJobStatusToast.js';

export function BulkDetail() {
  const { batchId } = useParams();
  const { data, isLoading, isError, error } = useBatch(batchId);

  useJobListStatusToasts(data?.jobs);

  if (isLoading) return <PageSkeleton title="Batch"><LoadingState label="Loading batch…" /></PageSkeleton>;
  if (isError) return <PageSkeleton title="Batch"><ErrorState error={error} title="Couldn't load batch" /></PageSkeleton>;

  const { batch, jobs } = data;

  return (
    <PageSkeleton title="Batch progress" backAction={{ content: 'Bulk', url: '/bulk' }}>
      <BlockStack gap="400">
        <Card>
          <BatchProgressBar batch={batch} />
        </Card>
        <Card>
          <ResourceList
            resourceName={{ singular: 'job', plural: 'jobs' }}
            items={jobs ?? []}
            renderItem={(job) => (
              <ResourceItem id={job.id} url={`/jobs/${job.id}`}>
                <Link to={`/jobs/${job.id}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text as="span">{job.id}</Text>
                  <JobStatusBadge status={job.status} />
                </Link>
              </ResourceItem>
            )}
          />
        </Card>
      </BlockStack>
    </PageSkeleton>
  );
}
