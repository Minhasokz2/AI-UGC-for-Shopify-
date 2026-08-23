import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { Account } from '../../src/pages/Account.jsx';

let mockShopStatus;
const signOutMutate = vi.fn();

vi.mock('../../src/hooks/useShopStatus.js', () => ({ useShopStatus: () => mockShopStatus }));
vi.mock('../../src/hooks/useGoogleSignOut.js', () => ({
  useGoogleSignOut: () => ({ mutate: signOutMutate, isPending: false }),
}));

function renderAccount() {
  return render(
    <AppProvider i18n={{}}>
      <Account />
    </AppProvider>,
  );
}

beforeEach(() => {
  signOutMutate.mockClear();
  mockShopStatus = { data: { verifiedEmail: 'merchant@example.com' }, isLoading: false };
});

describe('Account', () => {
  it('shows the signed-in email and a Sign out button when verifiedEmail is present', () => {
    renderAccount();
    expect(screen.getByText('merchant@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('calls the sign-out mutation when the button is clicked', () => {
    renderAccount();
    screen.getByRole('button', { name: 'Sign out' }).click();
    expect(signOutMutate).toHaveBeenCalled();
  });

  it('shows an unlinked message and no Sign out button when verifiedEmail is absent', () => {
    mockShopStatus = { data: { verifiedEmail: null }, isLoading: false };
    renderAccount();
    expect(screen.getByText('No Google account is linked to this shop.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('shows a loading state while shop status is loading', () => {
    mockShopStatus = { data: undefined, isLoading: true };
    renderAccount();
    expect(screen.getAllByText('Loading account…').length).toBeGreaterThan(0);
  });
});
