import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../../src/pages/Dashboard.jsx';

let mockUsageStats;
let mockJobs;

vi.mock('../../src/hooks/useUsageStats.js', () => ({ useUsageStats: () => mockUsageStats }));
vi.mock('../../src/hooks/useJobs.js', () => ({ useJobs: () => mockJobs }));

function renderDashboard() {
  return render(
    <AppProvider i18n={{}}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </AppProvider>,
  );
}

beforeEach(() => {
  mockUsageStats = { data: { creditBalance: 10, plan: 'metered', lifetimeCreditsSpent: 0, lifetimeImagesGenerated: 0 }, isLoading: false, isError: false, error: null };
  mockJobs = { data: { jobs: [{ id: 'job-1' }] }, isLoading: false };
});

describe('Dashboard', () => {
  it('renders usage stats once loaded', () => {
    renderDashboard();
    expect(screen.getByText('Usage & ROI')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('shows an error state when usage stats fail to load', () => {
    mockUsageStats = { data: null, isLoading: false, isError: true, error: new Error('boom') };
    renderDashboard();
    expect(screen.getByText("Couldn't load usage stats")).toBeInTheDocument();
  });

  it('shows the welcome card when the shop has no jobs yet', () => {
    mockJobs = { data: { jobs: [] }, isLoading: false };
    renderDashboard();
    expect(screen.queryByText('Usage & ROI')).toBeInTheDocument();
  });
});
