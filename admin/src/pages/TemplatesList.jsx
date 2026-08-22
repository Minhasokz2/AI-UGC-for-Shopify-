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
  InlineStack,
  Text,
} from '@shopify/polaris';
import { apiGet, apiDelete, toQueryString, ApiError } from '../lib/apiClient';
import { TEMPLATE_CATEGORIES } from '../lib/constants';
import { useToast } from '../components/ToastProvider';

function TemplatesList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState(null);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingSlug, setDeletingSlug] = useState(null);

  const load = useCallback(async (cat) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/admin/api/templates${toQueryString({ category: cat })}`);
      setTemplates(data.templates ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(category);
  }, [load, category]);

  const handleDelete = useCallback(
    async (slug) => {
      if (!window.confirm(`Delete template "${slug}"? This cannot be undone.`)) return;
      setDeletingSlug(slug);
      try {
        await apiDelete(`/admin/api/templates/${slug}`);
        showToast(`Deleted template "${slug}".`);
        await load(category);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to delete template.', { error: true });
      } finally {
        setDeletingSlug(null);
      }
    },
    [category, load, showToast],
  );

  const categoryOptions = [{ label: 'All categories', value: '' }, ...TEMPLATE_CATEGORIES.map((c) => ({ label: c, value: c }))];

  const rows = (templates ?? []).map((t) => [
    t.label,
    t.category,
    t.modelRole,
    t.creditCost,
    <ButtonGroup key={t.id}>
      <Button onClick={() => navigate(`/templates/${t.id}`)}>Edit</Button>
      <Button
        tone="critical"
        loading={deletingSlug === t.id}
        onClick={() => handleDelete(t.id)}
      >
        Delete
      </Button>
    </ButtonGroup>,
  ]);

  return (
    <Page
      title="Templates"
      primaryAction={{ content: 'New template', onAction: () => navigate('/templates/new') }}
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
            <Spinner accessibilityLabel="Loading templates" size="large" />
          </div>
        ) : (templates ?? []).length === 0 ? (
          <EmptyState heading="No templates yet" action={{ content: 'New template', onAction: () => navigate('/templates/new') }}>
            <p>Create a template to make it available to the generation flows.</p>
          </EmptyState>
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
            headings={['Label', 'Category', 'Model role', 'Credit cost', 'Actions']}
            rows={rows}
          />
        )}
      </Card>
      {templates ? (
        <div style={{ marginTop: '0.5rem' }}>
          <Text as="p" tone="subdued">
            {templates.length} template{templates.length === 1 ? '' : 's'}
          </Text>
        </div>
      ) : null}
    </Page>
  );
}

export default TemplatesList;
