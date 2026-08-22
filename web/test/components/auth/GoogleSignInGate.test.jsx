import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { GoogleSignInGate } from '../../../src/components/auth/GoogleSignInGate.jsx';

function renderGate(children) {
  return render(
    <AppProvider i18n={{}}>
      <GoogleSignInGate>{children}</GoogleSignInGate>
    </AppProvider>,
  );
}

let mockShopStatus;

vi.mock('../../../src/hooks/useShopStatus.js', () => ({
  useShopStatus: () => mockShopStatus,
}));

vi.mock('../../../src/hooks/useGoogleSignInPopup.js', () => ({
  useGoogleSignInPopup: () => ({ startSignIn: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  mockShopStatus = { data: undefined, isLoading: false, isError: false };
});

describe('GoogleSignInGate', () => {
  it('shows a loading state while shop status is loading', () => {
    mockShopStatus = { data: undefined, isLoading: true, isError: false };
    renderGate(<div>protected content</div>);
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('shows the sign-in prompt (not the app) when googleVerified is false', () => {
    mockShopStatus = { data: { googleVerified: false, plan: 'metered', creditBalance: 10 }, isLoading: false, isError: false };
    renderGate(<div>protected content</div>);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('shows the sign-in prompt when the shop status request errors', () => {
    mockShopStatus = { data: undefined, isLoading: false, isError: true };
    renderGate(<div>protected content</div>);
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders the app once googleVerified is true', () => {
    mockShopStatus = { data: { googleVerified: true, plan: 'metered', creditBalance: 10 }, isLoading: false, isError: false };
    renderGate(<div>protected content</div>);
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });
});
