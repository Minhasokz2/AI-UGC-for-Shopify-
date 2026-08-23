import { Card, BlockStack, InlineStack, Text, Button } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { useShopStatus } from '../hooks/useShopStatus.js';
import { useGoogleSignOut } from '../hooks/useGoogleSignOut.js';

/**
 * Dedicated account view: who's signed in and a way to sign out. Signing out
 * resets the Google verification gate (GoogleSignInGate re-shows the
 * sign-in screen on the next render) so a merchant can verify a different
 * account — it never re-grants the free trial.
 */
export function Account() {
  const { data: shopStatus, isLoading } = useShopStatus();
  const signOut = useGoogleSignOut();

  if (isLoading) {
    return (
      <PageSkeleton title="Account">
        <LoadingState label="Loading account…" />
      </PageSkeleton>
    );
  }

  return (
    <PageSkeleton title="Account">
      <Card>
        <BlockStack gap="200">
          {shopStatus?.verifiedEmail ? (
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span">
                Signed in as <Text as="span" fontWeight="semibold">{shopStatus.verifiedEmail}</Text>
              </Text>
              <Button onClick={() => signOut.mutate()} loading={signOut.isPending}>
                Sign out
              </Button>
            </InlineStack>
          ) : (
            <Text as="p" tone="subdued">
              No Google account is linked to this shop.
            </Text>
          )}
        </BlockStack>
      </Card>
    </PageSkeleton>
  );
}
