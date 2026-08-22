import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Page, Card, FormLayout, TextField, Select, Banner, Spinner, BlockStack, Button, InlineStack } from '@shopify/polaris';
import { apiGet, apiPut, ApiError } from '../lib/apiClient';
import { TEMPLATE_CATEGORIES } from '../lib/constants';
import { slugify } from '../lib/slugify';
import { useToast } from '../components/ToastProvider';

const EMPTY_FORM = { label: '', category: TEMPLATE_CATEGORIES[0], modelRole: '', prompt: '', creditCost: '1' };

/**
 * Create/edit form for one template. The slug is the URL-safe id the admin
 * operator chooses when creating a template (auto-filled from the label,
 * editable) — PUT /admin/api/templates/:slug upserts, so this same form
 * handles both /templates/new and /templates/:slug.
 */
function TemplateEditor() {
  const { slug } = useParams();
  const isNew = !slug;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [form, setForm] = useState(EMPTY_FORM);
  const [slugField, setSlugField] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    apiGet(`/admin/api/templates/${slug}`)
      .then((data) => {
        if (cancelled) return;
        const t = data.template;
        setForm({
          label: t.label ?? '',
          category: t.category ?? TEMPLATE_CATEGORIES[0],
          modelRole: t.modelRole ?? '',
          prompt: t.prompt ?? '',
          creditCost: String(t.creditCost ?? ''),
        });
        setSlugField(t.id ?? slug);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load template.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, slug]);

  const handleLabelChange = useCallback(
    (value) => {
      setForm((f) => ({ ...f, label: value }));
      if (isNew && !slugTouched) {
        setSlugField(slugify(value));
      }
    },
    [isNew, slugTouched],
  );

  const handleSlugChange = useCallback((value) => {
    setSlugTouched(true);
    setSlugField(value);
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const targetSlug = (isNew ? slugField : slug).trim();
      if (!targetSlug) {
        setError('A slug is required.');
        return;
      }
      const creditCostNum = Number(form.creditCost);
      if (!Number.isFinite(creditCostNum) || creditCostNum < 0) {
        setError('Credit cost must be a non-negative number.');
        return;
      }
      setSaving(true);
      setError('');
      try {
        await apiPut(`/admin/api/templates/${targetSlug}`, {
          label: form.label,
          category: form.category,
          modelRole: form.modelRole,
          prompt: form.prompt,
          creditCost: creditCostNum,
        });
        showToast(`Saved template "${targetSlug}".`);
        navigate('/templates');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to save template.');
      } finally {
        setSaving(false);
      }
    },
    [isNew, slugField, slug, form, navigate, showToast],
  );

  if (loading) {
    return (
      <Page title={isNew ? 'New template' : 'Edit template'} backAction={{ content: 'Templates', url: '/templates' }}>
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Spinner accessibilityLabel="Loading template" size="large" />
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title={isNew ? 'New template' : `Edit template: ${slug}`}
      backAction={{ content: 'Templates', url: '/templates' }}
    >
      <Card>
        <form onSubmit={handleSubmit}>
          <BlockStack gap="400">
            {error ? <Banner tone="critical">{error}</Banner> : null}
            <FormLayout>
              <TextField
                label="Slug (id)"
                value={isNew ? slugField : slug}
                onChange={isNew ? handleSlugChange : undefined}
                disabled={!isNew}
                autoComplete="off"
                helpText={
                  isNew
                    ? 'URL-safe id used in the template catalog. Auto-filled from the label — edit if you want something different.'
                    : 'The slug is fixed once a template is created.'
                }
              />
              <TextField label="Label" value={form.label} onChange={handleLabelChange} autoComplete="off" />
              <Select
                label="Category"
                options={TEMPLATE_CATEGORIES.map((c) => ({ label: c, value: c }))}
                value={form.category}
                onChange={(value) => setForm((f) => ({ ...f, category: value }))}
              />
              <TextField
                label="Model role"
                value={form.modelRole}
                onChange={(value) => setForm((f) => ({ ...f, modelRole: value }))}
                autoComplete="off"
                helpText="Must match a real model's `role` field from the Models catalog, appropriate for this template's category."
              />
              <TextField
                label="Prompt"
                value={form.prompt}
                onChange={(value) => setForm((f) => ({ ...f, prompt: value }))}
                multiline={6}
                autoComplete="off"
              />
              <TextField
                label="Credit cost"
                type="number"
                min="0"
                value={form.creditCost}
                onChange={(value) => setForm((f) => ({ ...f, creditCost: value }))}
                autoComplete="off"
              />
            </FormLayout>
            <InlineStack gap="300">
              <Button submit variant="primary" loading={saving} disabled={saving}>
                Save
              </Button>
              <Button onClick={() => navigate('/templates')} disabled={saving}>
                Cancel
              </Button>
            </InlineStack>
          </BlockStack>
        </form>
      </Card>
    </Page>
  );
}

export default TemplateEditor;
