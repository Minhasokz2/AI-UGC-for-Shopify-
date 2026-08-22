import { useState } from 'react';
import { Page, Card, Button, InlineStack, BlockStack, Text, Banner } from '@shopify/polaris';
import { apiPost, ApiError } from '../lib/apiClient';

/**
 * Low-priority optional page: manually trigger the two ADMIN_API_KEY-gated
 * operational sweeps that otherwise only run via an external pinger
 * (server/src/routes/admin/sweeps.js), and show the raw JSON result.
 */
function Ops() {
  const [billingResult, setBillingResult] = useState(null);
  const [nurtureResult, setNurtureResult] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [nurtureLoading, setNurtureLoading] = useState(false);
  const [error, setError] = useState('');

  const runSweep = async (path, setLoading, setResult) => {
    setLoading(true);
    setError('');
    try {
      const result = await apiPost(path, {});
      setResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to run ${path}.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="Ops">
      <BlockStack gap="400">
        {error ? <Banner tone="critical">{error}</Banner> : null}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              Billing reconciliation sweep
            </Text>
            <InlineStack gap="300">
              <Button
                loading={billingLoading}
                onClick={() => runSweep('/admin/api/sweep/billing', setBillingLoading, setBillingResult)}
              >
                Run billing sweep
              </Button>
            </InlineStack>
            {billingResult ? (
              <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(billingResult, null, 2)}</pre>
            ) : null}
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              Nurture email sweep
            </Text>
            <InlineStack gap="300">
              <Button
                loading={nurtureLoading}
                onClick={() => runSweep('/admin/api/sweep/nurture', setNurtureLoading, setNurtureResult)}
              >
                Run nurture sweep
              </Button>
            </InlineStack>
            {nurtureResult ? (
              <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(nurtureResult, null, 2)}</pre>
            ) : null}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export default Ops;
