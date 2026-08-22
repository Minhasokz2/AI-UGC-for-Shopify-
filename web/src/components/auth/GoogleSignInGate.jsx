import { Button, Card, BlockStack, Text, Page } from '@shopify/polaris';
import { useGoogleSignInPopup } from '../../hooks/useGoogleSignInPopup.js';
import { useShopStatus } from '../../hooks/useShopStatus.js';
import { LoadingState } from '../feedback/LoadingState.jsx';

/**
 * Gates the app behind Google sign-in until the shop is verified.
 * GET /api/billing/status's `googleVerified` field is the source of truth —
 * set server-side once trialCreditsService.grantTrialIfEligible runs after
 * a successful popup round-trip (see server/src/routes/api/auth/google.js).
 */
export function GoogleSignInGate({ children }) {
  const { data, isLoading, isError } = useShopStatus();
  const { startSignIn, isPending } = useGoogleSignInPopup();

  if (isLoading) {
    return (
      <Page>
        <LoadingState label="Loading your shop…" />
      </Page>
    );
  }

  if (isError || !data || !data.googleVerified) {
    return (
      <Page title="Sign in required">
        <Card>
          <BlockStack gap="400" inlineAlign="start">
            <Text as="p">
              Sign in with Google to verify your account and start generating AI product
              photography.
            </Text>
            <Button variant="primary" onClick={startSignIn} loading={isPending}>
              Sign in with Google
            </Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  return children;
}
