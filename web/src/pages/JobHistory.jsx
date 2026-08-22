import { useState } from 'react';
import { BlockStack, Card, ResourceList, ResourceItem, Text, ButtonGroup, Button } from '@shopify/polaris';
import { Link } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { JobStatusBadge } from '../components/generation/JobStatusBadge.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { EmptyState } from '../components/feedback/EmptyState.jsx';
import { useJobs } from '../hooks/useJobs.js';
import { useJobListStatusToasts } from '../hooks/useJobStatusToast.js';

const STATUS_FILTERS = ['pending', 'processing', 'succeeded', 'failed', 'cancelled'];

export function JobHistory() {
  const [status, setStatus] = useState(undefined);
  const { data, isLoading, isError, error } = useJobs({ status });

  useJobListStatusToasts(data?.jobs);

  const jobs = data?.jobs ?? [];

  return (
    <PageSkeleton title="Job History">
      <BlockStack gap="400">
        <ButtonGroup variant="segmented">
          <Button pressed={!status} onClick={() => setStatus(undefined)}>
            All
          </Button>
          {STATUS_FILTERS.map((s) => (
            <Button key={s} pressed={status === s} onClick={() => setStatus(s)}>
              {s}
            </Button>
          ))}
        </ButtonGroup>

        {isLoading && <LoadingState label="Loading jobs…" />}
        {isError && <ErrorState error={error} title="Couldn't load jobs" />}
        {!isLoading && !isError && jobs.length === 0 && (
          <EmptyState heading="No jobs yet">
            <Text as="p">Start a generation from the Generate hub.</Text>
          </EmptyState>
        )}

        {!isLoading && !isError && jobs.length > 0 && (
          <Card>
            <ResourceList
              resourceName={{ singular: 'job', plural: 'jobs' }}
              items={jobs}
              renderItem={(job) => (
                <ResourceItem id={job.id} url={`/jobs/${job.id}`}>
                  <Link to={`/jobs/${job.id}`} style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <BlockStack gap="050">
                      <Text as="span" fontWeight="semibold">
                        {job.contentType}
                      </Text>
                      <Text as="span" tone="subdued">
                        {job.id}
                      </Text>
                    </BlockStack>
                    <JobStatusBadge status={job.status} />
                  </Link>
                </ResourceItem>
              )}
            />
          </Card>
        )}
      </BlockStack>
    </PageSkeleton>
  );
}
