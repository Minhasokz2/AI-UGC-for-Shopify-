import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Card, BlockStack, Text, Button, InlineStack } from '@shopify/polaris';
import { clearAdminApiKey } from '../lib/apiClient';

/**
 * Dedicated sign-out confirmation, reached from the top-bar user menu.
 * There's no session to invalidate server-side (see Login.jsx) — signing
 * out just drops the locally-stored admin API key and sends the operator
 * back to /login.
 */
function Logout() {
  const navigate = useNavigate();

  const handleConfirm = useCallback(() => {
    clearAdminApiKey();
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <Page narrowWidth title="Sign out">
      <Card>
        <BlockStack gap="400">
          <Text as="p">
            You&rsquo;re about to sign out of the AI UGC Generator admin panel. You&rsquo;ll need
            the admin API key again to sign back in.
          </Text>
          <InlineStack gap="200">
            <Button variant="primary" tone="critical" onClick={handleConfirm}>
              Sign out
            </Button>
            <Button onClick={() => navigate(-1)}>Cancel</Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  );
}

export default Logout;
