import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Page,
  Card,
  DataTable,
  Button,
  ButtonGroup,
  EmptyState,
  Spinner,
  Banner,
  Select,
  Badge,
  InlineStack,
  Text,
} from '@shopify/polaris';
import { apiGet, apiDelete, apiPost, toQueryString, ApiError } from '../lib/apiClient';
import { MODEL_CATEGORIES } from '../lib/constants';
import { useToast } from '../components/ToastProvider';
import ModelParametersModal from '../components/ModelParametersModal';

function ModelsList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [models, setModels] = useState(null);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [viewingModel, setViewingModel] = useState(null);

  const load = useCallback(async (cat) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/admin/api/models${toQueryString({ category: cat })}`);
      setModels(data.models ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load models.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(category);
  }, [load, category]);

  const handleDelete = useCallback(
    async (id) => {
      if (!window.confirm(`Delete model "${id}"? This cannot be undone.`)) return;
      setDeletingId(id);
      try {
        await apiDelete(`/admin/api/models/${id}`);
        showToast(`Deleted model "${id}".`);
        await load(category);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to delete model.', { error: true });
      } finally {
        setDeletingId(null);
      }
    },
    [category, load, showToast],
  );

  const handleReseed = useCallback(async () => {
    setSeeding(true);
    try {
      const result = await apiPost('/admin/api/seed-models', {});
      showToast(
        `Re-seed complete: ${result.created} created, ${result.skipped} skipped, ${result.total} total.`,
      );
      await load(category);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to re-seed models.', { error: true });
    } finally {
      setSeeding(false);
    }
  }, [category, load, showToast]);

  const categoryOptions = [{ label: 'All categories', value: '' }, ...MODEL_CATEGORIES.map((c) => ({ label: c, value: c }))];

  const rows = (models ?? []).map((m) => [
    m.id,
    m.label,
    m.category,
    m.creditCost,
    <Badge key={`${m.id}-flag`} tone={m.needsPriceReview ? 'warning' : 'success'}>
      {m.needsPriceReview ? 'Needs review' : 'Reviewed'}
    </Badge>,
    <ButtonGroup key={m.id}>
      <Button onClick={() => setViewingModel(m)}>View parameters</Button>
      <Button onClick={() => navigate(`/models/${m.id}`)}>Edit</Button>
      <Button tone="critical" loading={deletingId === m.id} onClick={() => handleDelete(m.id)}>
        Delete
      </Button>
    </ButtonGroup>,
  ]);

  return (
    <Page
      title="Models"
      primaryAction={{ content: 'New model', onAction: () => navigate('/models/new') }}
      secondaryActions={[{ content: 'Re-seed models', onAction: handleReseed, loading: seeding }]}
    >
      <Card>
        <div style={{ padding: '1rem 1rem 0' }}>
          <InlineStack gap="400" align="start" blockAlign="center">
            <div style={{ minWidth: 220 }}>
              <Select label="Category" labelHidden options={categoryOptions} value={category} onChange={setCategory} />
            </div>
          </InlineStack>
        </div>
        {error ? (
          <div style={{ padding: '1rem' }}>
            <Banner tone="critical">{error}</Banner>
          </div>
        ) : null}
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Spinner accessibilityLabel="Loading models" size="large" />
          </div>
        ) : (models ?? []).length === 0 ? (
          <EmptyState heading="No models yet" action={{ content: 'Re-seed models', onAction: handleReseed }}>
            <p>Re-seed from the backend's built-in defaults, or add one manually.</p>
          </EmptyState>
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'numeric', 'text', 'text']}
            headings={['ID', 'Label', 'Category', 'Credit cost', 'Price review', 'Actions']}
            rows={rows}
          />
        )}
      </Card>
      {models ? (
        <div style={{ marginTop: '0.5rem' }}>
          <Text as="p" tone="subdued">
            {models.length} model{models.length === 1 ? '' : 's'}
          </Text>
        </div>
      ) : null}
      {viewingModel ? <ModelParametersModal model={viewingModel} onClose={() => setViewingModel(null)} /> : null}
    </Page>
  );
}

export default ModelsList;
