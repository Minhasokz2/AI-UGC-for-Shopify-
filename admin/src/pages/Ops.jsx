import { useState, useEffect, useCallback } from 'react';
import { Page, Card, Button, InlineStack, BlockStack, Text, Banner, Select, TextField } from '@shopify/polaris';
import { apiGet, apiPost, ApiError } from '../lib/apiClient';

/**
 * Low-priority optional page: manually trigger the two ADMIN_API_KEY-gated
 * operational sweeps that otherwise only run via an external pinger
 * (server/src/routes/admin/sweeps.js), and show the raw JSON result. Also
 * hosts a manual credit grant tool — useful for crediting a dev/admin shop
 * for testing without running a real Shopify App Pricing charge through it.
 */
function Ops() {
  const [billingResult, setBillingResult] = useState(null);
  const [nurtureResult, setNurtureResult] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [nurtureLoading, setNurtureLoading] = useState(false);
  const [error, setError] = useState('');

  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState('');
  const [creditAmount, setCreditAmount] = useState('100');
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState('');
  const [grantSuccess, setGrantSuccess] = useState('');

  const loadShops = useCallback(async () => {
    setShopsLoading(true);
    try {
      const { shops: fetched } = await apiGet('/admin/api/shops');
      setShops(fetched);
      setSelectedShop((current) => current || fetched[0]?.shopDomain || '');
    } catch (err) {
      setGrantError(err instanceof ApiError ? err.message : 'Failed to load shops.');
    } finally {
      setShopsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

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

  const grantCredits = async () => {
    const amount = Number.parseInt(creditAmount, 10);
    if (!selectedShop || !Number.isInteger(amount) || amount === 0) {
      setGrantError('Choose a shop and enter a non-zero whole number of credits.');
      return;
    }
    setGrantLoading(true);
    setGrantError('');
    setGrantSuccess('');
    try {
      const result = await apiPost(`/admin/api/shops/${selectedShop}/credits`, { amount });
      setGrantSuccess(`${selectedShop} now has ${result.creditBalance} credits.`);
      await loadShops();
    } catch (err) {
      setGrantError(err instanceof ApiError ? err.message : 'Failed to grant credits.');
    } finally {
      setGrantLoading(false);
    }
  };

  const shopOptions = shops.map((shop) => ({
    label: `${shop.shopDomain} — ${shop.creditBalance} credits (${shop.plan})`,
    value: shop.shopDomain,
  }));

  return (
    <Page title="Ops">
      <BlockStack gap="400">
        {error ? <Banner tone="critical">{error}</Banner> : null}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              Grant credits to a shop
            </Text>
            {grantError ? <Banner tone="critical">{grantError}</Banner> : null}
            {grantSuccess ? <Banner tone="success">{grantSuccess}</Banner> : null}
            {shopsLoading ? (
              <Text as="p" tone="subdued">
                Loading shops…
              </Text>
            ) : shopOptions.length === 0 ? (
              <Text as="p" tone="subdued">
                No installed shops found.
              </Text>
            ) : (
              <InlineStack gap="300" blockAlign="end">
                <div style={{ minWidth: '360px' }}>
                  <Select label="Shop" options={shopOptions} value={selectedShop} onChange={setSelectedShop} />
                </div>
                <div style={{ width: '140px' }}>
                  <TextField label="Credits" type="number" value={creditAmount} onChange={setCreditAmount} autoComplete="off" />
                </div>
                <Button variant="primary" loading={grantLoading} onClick={grantCredits}>
                  Grant credits
                </Button>
              </InlineStack>
            )}
          </BlockStack>
        </Card>
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
