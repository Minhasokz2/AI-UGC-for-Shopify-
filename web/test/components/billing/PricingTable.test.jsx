import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
      <PricingTable
        packs={PACKS}
        unlimitedPlan={UNLIMITED_PLAN}
        onSubscribe={() => {}}
        onSubscribeUnlimited={() => {}}
        pendingPackId={undefined}
        isUnlimitedPending={false}
        {...props}
      />
    </AppProvider>,
  );
}

describe('PricingTable', () => {
  it('shows no loading/disabled state on any button when nothing is pending', () => {
    renderTable();
    for (const name of ['Choose Starter', 'Choose Growth', 'Go Unlimited']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('shows the spinner ONLY on the clicked pack\'s button, and disables the others — not every button going into a loading state for one click', () => {
    renderTable({ pendingPackId: 'starter' });

    const starterButton = screen.getByRole('button', { name: 'Choose Starter' });
    const growthButton = screen.getByRole('button', { name: 'Choose Growth' });
    const unlimitedButton = screen.getByRole('button', { name: 'Go Unlimited' });

    // Polaris renders a loading button's own accessible name as "Loading" with
    // the label as visually-hidden text — the pressed one no longer exposes
    // "Choose Starter" as its accessible name, which is itself proof only that
    // one entered the loading state (getByRole above already fails otherwise).
    expect(starterButton).toBeInTheDocument();
    expect(growthButton).toHaveAttribute('aria-disabled', 'true');
    expect(unlimitedButton).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the spinner on Unlimited and disables the packs when isUnlimitedPending is true', () => {
    renderTable({ isUnlimitedPending: true });

    expect(screen.getByRole('button', { name: 'Choose Starter' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Choose Growth' })).toHaveAttribute('aria-disabled', 'true');
  });
});
