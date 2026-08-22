import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Card, FormLayout, TextField, Button, Banner, BlockStack, Text } from '@shopify/polaris';
import { setAdminApiKey, verifyAdminApiKey } from '../lib/apiClient';

/**
 * There is no username/password login for this admin panel — just a shared
 * secret (ADMIN_API_KEY on the server) carried as X-Admin-Api-Key on every
 * request. This page collects that key, verifies it against a real endpoint
 * (GET /admin/api/templates) so a typo is caught immediately rather than on
 * the first click inside the app, stores it in sessionStorage, and redirects
 * to /templates.
 */
function Login() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!key.trim()) {
        setError('Enter an admin API key.');
        return;
      }
      setSubmitting(true);
      setError('');
      try {
        const ok = await verifyAdminApiKey(key.trim());
        if (!ok) {
          setError('That key was rejected. Double-check ADMIN_API_KEY and try again.');
          setSubmitting(false);
          return;
        }
        setAdminApiKey(key.trim());
        navigate('/templates', { replace: true });
      } catch {
        setError('Could not reach the backend. Check your connection and try again.');
        setSubmitting(false);
      }
    },
    [key, navigate],
  );

  return (
    <Page narrowWidth>
      <div style={{ marginTop: '10vh' }}>
        <Card>
          <form onSubmit={handleSubmit}>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h1" variant="headingLg">
                  AI UGC Generator Admin
                </Text>
                <Text as="p" tone="subdued">
                  Enter the admin API key to manage the shared template and model catalog.
                </Text>
              </BlockStack>
              {error ? <Banner tone="critical">{error}</Banner> : null}
              <FormLayout>
                <TextField
                  label="Admin API key"
                  type="password"
                  value={key}
                  onChange={setKey}
                  autoComplete="off"
                  disabled={submitting}
                  helpText="Matches the server's ADMIN_API_KEY environment variable."
                />
                <Button submit variant="primary" loading={submitting} disabled={submitting}>
                  Sign in
                </Button>
              </FormLayout>
            </BlockStack>
          </form>
        </Card>
      </div>
    </Page>
  );
}

export default Login;
