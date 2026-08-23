import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { PricingTable } from '../../../src/components/billing/PricingTable.jsx';

const PACKS = [
  { id: 'starter', label: 'Starter', monthlyPriceCents: 1900, monthlyCredits: 200, annualPriceCents: 19000, annualCredits: 2400 },
  { id: 'growth', label: 'Growth', monthlyPriceCents: 4900, monthlyCredits: 600, annualPriceCents: 49000, annualCredits: 7200 },
];
const UNLIMITED_PLAN = { id: 'unlimited', label: 'Unlimited', monthlyPriceCents: 29900, fairUseCreditsPerMonth: 5436 };

function renderTable(props = {}) {
  return render(
    <AppProvider i18n={{}}>
      <PricingTable packs={PACKS} unlimitedPlan={UNLIMITED_PLAN} onViewPlans={() => {}} {...props} />
    </AppProvider>,
  );
}

describe('PricingTable', () => {
  it('shows every pack and the Unlimited plan\'s pricing info, purely as read-only cards', () => {
    renderTable();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Growth')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.getByText('$19.00')).toBeInTheDocument();
    // No per-pack "Choose X" buttons anymore — Shopify hosts the actual picker.
    expect(screen.queryByRole('button', { name: /choose/i })).not.toBeInTheDocument();
  });

  it('calls onViewPlans when the single CTA is clicked', () => {
    const onViewPlans = vi.fn();
    renderTable({ onViewPlans });

    fireEvent.click(screen.getByRole('button', { name: 'View plans & subscribe' }));

    expect(onViewPlans).toHaveBeenCalled();
  });

  it('toggles displayed price/credits between monthly and annual', () => {
    renderTable();
    expect(screen.getByText('$19.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));

    expect(screen.getByText('$190.00')).toBeInTheDocument();
    expect(screen.getByText('2400', { exact: false })).toBeInTheDocument();
  });
});
