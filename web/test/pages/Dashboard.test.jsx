import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { Dashboard } from '../../src/pages/Dashboard.jsx';

let mockUsageStats;
let mockJobs;
let mockShopStatus;
const signOutMutate = vi.fn();

vi.mock('../../src/hooks/useUsageStats.js', () => ({ useUsageStats: () => mockUsageStats }));
vi.mock('../../src/hooks/useJobs.js', () => ({ useJobs: () => mockJobs }));
vi.mock('../../src/hooks/useShopStatus.js', () => ({ useShopStatus: () => mockShopStatus }));
vi.mock('../../src/hooks/useGoogleSignOut.js', () => ({
  useGoogleSignOut: () => ({ mutate: signOutMutate, isPending: false }),
}));

function renderDashboard() {
  return render(
    <AppProvider i18n={{}}>
      <Dashboard />
    </AppProvider>,
  );
}

beforeEach(() => {
  signOutMutate.mockClear();
  mockUsageStats = { data: { creditBalance: 10, plan: 'metered', lifetimeCreditsSpent: 0, lifetimeImagesGenerated: 0 }, isLoading: false, isError: false, error: null };
  mockJobs = { data: { jobs: [{ id: 'job-1' }] }, isLoading: false };
  mockShopStatus = { data: { verifiedEmail: 'merchant@example.com' } };
});

describe('Dashboard', () => {
  it('shows the signed-in email and a Sign out button when verifiedEmail is present', () => {
    renderDashboard();
    expect(screen.getByText('merchant@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('calls the sign-out mutation when the button is clicked', async () => {
    const { getByRole } = renderDashboard();
    getByRole('button', { name: 'Sign out' }).click();
    expect(signOutMutate).toHaveBeenCalled();
  });

  it('renders no account card when verifiedEmail is absent', () => {
    mockShopStatus = { data: { verifiedEmail: null } };
    renderDashboard();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });
});
