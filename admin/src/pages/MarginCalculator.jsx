import { useEffect, useMemo, useState } from 'react';
import { Page, Card, FormLayout, TextField, Select, Banner, Spinner, BlockStack, InlineStack, Text } from '@shopify/polaris';
import { apiGet, ApiError } from '../lib/apiClient';
import { computeCostPerCreditCents, computeMarginRange } from '../lib/marginMath';
import MarginTable from '../components/MarginTable';

/**
 * Standalone margin calculator: pick a real model (auto-fills its actual
 * cost + current credit price) or enter a hypothetical cost/creditCost pair,
 * and see the margin at every pack, live — everything after the initial
 * fetch is computed client-side via marginMath.js, recomputed with useMemo
 * on every keystroke.
 */
function MarginCalculator() {
  const [packs, setPacks] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [actualCostUsd, setActualCostUsd] = useState('0.05');
  const [creditCost, setCreditCost] = useState('1');
  const [period, setPeriod] = useState('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [pricingData, marginData] = await Promise.all([
          apiGet('/admin/api/pricing-config'),
          apiGet('/admin/api/margin/model-costs'),
        ]);
        if (cancelled) return;
        setPacks(pricingData.packs ?? []);
        setModels(marginData.models ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load pricing data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectModel = (modelId) => {
    setSelectedModelId(modelId);
    const model = models.find((m) => m.id === modelId);
    if (model) {
      setActualCostUsd(String(model.actualCostUsd));
      setCreditCost(String(model.creditCost));
    }
  };

  const marginResult = useMemo(() => {
    const costPerCreditCents = computeCostPerCreditCents(Number(actualCostUsd), Number(creditCost));
    return computeMarginRange(packs, costPerCreditCents, period);
  }, [actualCostUsd, creditCost, packs, period]);

  const modelOptions = [
    { label: 'Custom (hypothetical)', value: '' },
    ...models.map((m) => ({ label: `${m.label} (${m.id})`, value: m.id })),
  ];

  if (loading) {
    return (
      <Page title="Margin calculator">
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Spinner accessibilityLabel="Loading pricing data" size="large" />
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Margin calculator">
      <BlockStack gap="400">
        {error ? <Banner tone="critical">{error}</Banner> : null}
        <Card>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Pick an existing model to see its margin at every pack, or enter a hypothetical cost to price a new one.
            </Text>
            <FormLayout>
              <Select label="Model" options={modelOptions} value={selectedModelId} onChange={handleSelectModel} />
              <InlineStack gap="300">
                <TextField
                  label="Actual cost (USD)"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={actualCostUsd}
                  onChange={setActualCostUsd}
                  autoComplete="off"
                />
                <TextField
                  label="Credit cost"
                  type="number"
                  min="0"
                  value={creditCost}
                  onChange={setCreditCost}
                  autoComplete="off"
                />
                <Select
                  label="Period"
                  options={[
                    { label: 'Monthly packs', value: 'monthly' },
                    { label: 'Annual packs', value: 'annual' },
                  ]}
                  value={period}
                  onChange={setPeriod}
                />
              </InlineStack>
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingSm">
              Margin at every pack
            </Text>
            <MarginTable entries={marginResult.entries} worstCase={marginResult.worstCase} />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export default MarginCalculator;
