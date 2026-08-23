import { Card, BlockStack, Text, InlineGrid } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { WelcomeCard } from '../components/onboarding/WelcomeCard.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { useUsageStats } from '../hooks/useUsageStats.js';
import { useJobs } from '../hooks/useJobs.js';

export function Dashboard() {
  const { data: statsData, isLoading: statsLoading, isError: statsError, error: statsErrorObj } = useUsageStats();
  const { data: jobsData, isLoading: jobsLoading } = useJobs({ limit: 1 });

  const hasAnyJob = (jobsData?.jobs?.length ?? 0) > 0;

  return (
    <PageSkeleton title="Dashboard">
      <BlockStack gap="400">
        {!jobsLoading && !hasAnyJob && <WelcomeCard />}

        {statsLoading && <LoadingState label="Loading your stats…" />}
        {statsError && <ErrorState error={statsErrorObj} title="Couldn't load usage stats" />}
        {statsData && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Usage &amp; ROI
              </Text>
              <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
                <Stat label="Credit balance" value={statsData.creditBalance} />
                <Stat label="Plan" value={statsData.plan} />
                <Stat label="Lifetime credits spent" value={statsData.lifetimeCreditsSpent} />
                <Stat label="Lifetime images generated" value={statsData.lifetimeImagesGenerated} />
              </InlineGrid>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </PageSkeleton>
  );
}

function Stat({ label, value }) {
  return (
    <BlockStack gap="100">
      <Text as="span" tone="subdued">
        {label}
      </Text>
      <Text as="span" variant="headingLg">
        {value}
      </Text>
    </BlockStack>
  );
}
