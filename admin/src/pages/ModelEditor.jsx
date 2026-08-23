import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  Banner,
  Spinner,
  BlockStack,
  Button,
  InlineStack,
  Text,
  DescriptionList,
} from '@shopify/polaris';
import { apiGet, apiPut, ApiError } from '../lib/apiClient';
import { MODEL_CATEGORIES } from '../lib/constants';
import { slugify } from '../lib/slugify';
import { computeMarginRange, computeCostPerCreditCents } from '../lib/marginMath';
import { useToast } from '../components/ToastProvider';
import MarginTable from '../components/MarginTable';

const EMPTY_NEW_MODEL = {
  id: '',
  label: '',
  category: MODEL_CATEGORIES[0],
  role: '',
  provider: '',
  endpoint: '',
  inputShape: '',
  imageParam: '',
  outputField: '',
  supportsBatch: false,
  creditCost: '1',
  actualCostUsd: '0',
  needsPriceReview: false,
  imageCountMin: '1',
  imageCountMax: '1',
};

/**
 * Create/edit form for one model. Per the build brief, the edit form's
 * primary focus is pricing: for an EXISTING model only creditCost and
 * needsPriceReview are editable here (everything else is shown read-only —
 * "View parameters" on the list page has the full read-only detail too).
 * For a NEW model, every field is editable since nothing exists yet to
 * show read-only.
 *
 * Both modes show a live margin preview (marginMath.js, recomputed via
 * useMemo on every keystroke) so the operator sees the pricing consequence
 * of a creditCost change before saving.
 */
function ModelEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [existingModel, setExistingModel] = useState(null); // fetched model, edit mode only
  const [newModel, setNewModel] = useState(EMPTY_NEW_MODEL); // new-model form state
  const [creditCost, setCreditCost] = useState('1'); // shared editable field (both modes)
  const [needsPriceReview, setNeedsPriceReview] = useState(false); // shared editable field (both modes)
  const [packs, setPacks] = useState([]);
  // Defaults to 'annual' — see MarginCalculator.jsx's identical comment: Scale
  // billed annually is the true catalog-wide worst case, not monthly.
  const [period, setPeriod] = useState('annual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const pricingData = await apiGet('/admin/api/pricing-config');
        if (cancelled) return;
        setPacks(pricingData.packs ?? []);

        if (!isNew) {
          const modelData = await apiGet(`/admin/api/models/${id}`);
          if (cancelled) return;
          setExistingModel(modelData.model);
          setCreditCost(String(modelData.model.creditCost ?? ''));
          setNeedsPriceReview(Boolean(modelData.model.needsPriceReview));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load model.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isNew, id]);

  const handleNewLabelChange = useCallback((value) => {
    setNewModel((m) => ({ ...m, label: value, id: m.idTouched ? m.id : slugify(value) }));
  }, []);

  const handleNewIdChange = useCallback((value) => {
    setNewModel((m) => ({ ...m, id: value, idTouched: true }));
  }, []);

  // The actualCostUsd feeding the live preview: fixed (from the fetched
  // model) when editing, user-entered when creating.
  const actualCostUsd = isNew ? Number(newModel.actualCostUsd) : Number(existingModel?.actualCostUsd);
  const creditCostNum = isNew ? Number(newModel.creditCost) : Number(creditCost);

  const marginResult = useMemo(() => {
    const costPerCreditCents = computeCostPerCreditCents(actualCostUsd, creditCostNum);
    return computeMarginRange(packs, costPerCreditCents, period);
  }, [actualCostUsd, creditCostNum, packs, period]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setError('');

      if (isNew) {
        const targetId = newModel.id.trim();
        if (!targetId) {
          setError('An id is required.');
          return;
        }
        const body = {
          label: newModel.label,
          category: newModel.category,
          role: newModel.role,
          provider: newModel.provider,
          endpoint: newModel.endpoint,
          inputShape: newModel.inputShape,
          imageParam: newModel.imageParam,
          outputField: newModel.outputField,
          supportsBatch: Boolean(newModel.supportsBatch),
          creditCost: Number(newModel.creditCost),
          actualCostUsd: Number(newModel.actualCostUsd),
          needsPriceReview: Boolean(newModel.needsPriceReview),
          imageCountConstraint: { min: Number(newModel.imageCountMin), max: Number(newModel.imageCountMax) },
        };
        setSaving(true);
        try {
          await apiPut(`/admin/api/models/${targetId}`, body);
          showToast(`Saved model "${targetId}".`);
          navigate('/models');
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Failed to save model.');
        } finally {
          setSaving(false);
        }
        return;
      }

      const creditCostValue = Number(creditCost);
      if (!Number.isFinite(creditCostValue) || creditCostValue < 0) {
        setError('Credit cost must be a non-negative number.');
        return;
      }
      setSaving(true);
      try {
        await apiPut(`/admin/api/models/${id}`, { creditCost: creditCostValue, needsPriceReview });
        showToast(`Saved model "${id}".`);
        navigate('/models');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to save model.');
      } finally {
        setSaving(false);
      }
    },
    [isNew, newModel, creditCost, needsPriceReview, id, navigate, showToast],
  );

  if (loading) {
    return (
      <Page title={isNew ? 'New model' : 'Edit model'} backAction={{ content: 'Models', url: '/models' }}>
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Spinner accessibilityLabel="Loading model" size="large" />
          </div>
        </Card>
      </Page>
    );
  }

  const readOnlyItems = !isNew && existingModel
    ? [
        { term: 'category', description: existingModel.category },
        { term: 'role', description: existingModel.role },
        { term: 'provider', description: existingModel.provider },
        { term: 'endpoint', description: existingModel.endpoint },
        { term: 'inputShape', description: existingModel.inputShape },
        { term: 'imageParam', description: existingModel.imageParam },
        { term: 'outputField', description: existingModel.outputField },
        { term: 'supportsBatch', description: existingModel.supportsBatch ? 'true' : 'false' },
        { term: 'actualCostUsd', description: `$${Number(existingModel.actualCostUsd).toFixed(4)}` },
        {
          term: 'imageCountConstraint',
          description: `min ${existingModel.imageCountConstraint?.min ?? '—'} / max ${existingModel.imageCountConstraint?.max ?? '—'}`,
        },
      ]
    : [];

  return (
    <Page
      title={isNew ? 'New model' : `Edit model: ${id}`}
      backAction={{ content: 'Models', url: '/models' }}
    >
      <BlockStack gap="400">
        <Card>
          <form onSubmit={handleSubmit}>
            <BlockStack gap="400">
              {error ? <Banner tone="critical">{error}</Banner> : null}

              {isNew ? (
                <FormLayout>
                  <TextField label="Id" value={newModel.id} onChange={handleNewIdChange} autoComplete="off" />
                  <TextField label="Label" value={newModel.label} onChange={handleNewLabelChange} autoComplete="off" />
                  <Select
                    label="Category"
                    options={MODEL_CATEGORIES.map((c) => ({ label: c, value: c }))}
                    value={newModel.category}
                    onChange={(value) => setNewModel((m) => ({ ...m, category: value }))}
                  />
                  <TextField
                    label="Role"
                    value={newModel.role}
                    onChange={(value) => setNewModel((m) => ({ ...m, role: value }))}
                    autoComplete="off"
                    helpText="Referenced by a template's modelRole field."
                  />
                  <TextField
                    label="Provider"
                    value={newModel.provider}
                    onChange={(value) => setNewModel((m) => ({ ...m, provider: value }))}
                    autoComplete="off"
                  />
                  <TextField
                    label="Endpoint"
                    value={newModel.endpoint}
                    onChange={(value) => setNewModel((m) => ({ ...m, endpoint: value }))}
                    autoComplete="off"
                  />
                  <TextField
                    label="Input shape"
                    value={newModel.inputShape}
                    onChange={(value) => setNewModel((m) => ({ ...m, inputShape: value }))}
                    autoComplete="off"
                  />
                  <TextField
                    label="Image param"
                    value={newModel.imageParam}
                    onChange={(value) => setNewModel((m) => ({ ...m, imageParam: value }))}
                    autoComplete="off"
                  />
                  <TextField
                    label="Output field"
                    value={newModel.outputField}
                    onChange={(value) => setNewModel((m) => ({ ...m, outputField: value }))}
                    autoComplete="off"
                  />
                  <Checkbox
                    label="Supports batch"
                    checked={newModel.supportsBatch}
                    onChange={(value) => setNewModel((m) => ({ ...m, supportsBatch: value }))}
                  />
                  <InlineStack gap="300">
                    <TextField
                      label="Image count min"
                      type="number"
                      min="0"
                      value={newModel.imageCountMin}
                      onChange={(value) => setNewModel((m) => ({ ...m, imageCountMin: value }))}
                      autoComplete="off"
                    />
                    <TextField
                      label="Image count max"
                      type="number"
                      min="0"
                      value={newModel.imageCountMax}
                      onChange={(value) => setNewModel((m) => ({ ...m, imageCountMax: value }))}
                      autoComplete="off"
                    />
                  </InlineStack>
                  <TextField
                    label="Actual cost (USD)"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={newModel.actualCostUsd}
                    onChange={(value) => setNewModel((m) => ({ ...m, actualCostUsd: value }))}
                    autoComplete="off"
                    helpText="Real USD cost per generation — feeds the margin preview below."
                  />
                  <TextField
                    label="Credit cost"
                    type="number"
                    min="0"
                    value={newModel.creditCost}
                    onChange={(value) => setNewModel((m) => ({ ...m, creditCost: value }))}
                    autoComplete="off"
                  />
                  <Checkbox
                    label="Needs price review"
                    checked={newModel.needsPriceReview}
                    onChange={(value) => setNewModel((m) => ({ ...m, needsPriceReview: value }))}
                  />
                </FormLayout>
              ) : (
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm">
                    Pricing
                  </Text>
                  <FormLayout>
                    <TextField
                      label="Credit cost"
                      type="number"
                      min="0"
                      value={creditCost}
                      onChange={setCreditCost}
                      autoComplete="off"
                      helpText="How many credits one generation with this model charges the merchant."
                    />
                    <Checkbox
                      label="Needs price review"
                      checked={needsPriceReview}
                      onChange={setNeedsPriceReview}
                      helpText="Flag this model as needing an operator to revisit its pricing."
                    />
                  </FormLayout>

                  <Text as="h2" variant="headingSm">
                    Technical parameters (read-only)
                  </Text>
                  <DescriptionList items={readOnlyItems} />
                </BlockStack>
              )}

              <InlineStack gap="300">
                <Button submit variant="primary" loading={saving} disabled={saving}>
                  Save
                </Button>
                <Button onClick={() => navigate('/models')} disabled={saving}>
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
          </form>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">
                Live margin preview
              </Text>
              <Select
                label="Period"
                labelHidden
                options={[
                  { label: 'Monthly packs', value: 'monthly' },
                  { label: 'Annual packs', value: 'annual' },
                ]}
                value={period}
                onChange={setPeriod}
              />
            </InlineStack>
            {Number.isFinite(actualCostUsd) && actualCostUsd >= 0 ? (
              <MarginTable entries={marginResult.entries} worstCase={marginResult.worstCase} />
            ) : (
              <Banner tone="warning">Enter a valid actual cost to see the margin preview.</Banner>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export default ModelEditor;
