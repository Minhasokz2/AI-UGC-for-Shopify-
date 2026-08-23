import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Pricing from '../src/pages/Pricing.jsx';

const PRICING_PAYLOAD = {
  packs: [
    {
      id: 'starter',
      label: 'Starter',
      monthlyPriceCents: 1900,
      monthlyCredits: 50,
      annualPriceCents: 19000,
      annualCredits: 600,
    },
    {
      id: 'growth',
      label: 'Growth',
      monthlyPriceCents: 4900,
      monthlyCredits: 200,
      annualPriceCents: 49000,
      annualCredits: 2400,
    },
  ],
  unlimitedPlan: {
    id: 'unlimited',
    label: 'Unlimited',
    monthlyPriceCents: 9900,
    annualPriceCents: 99000,
    fairUseCreditsPerMonth: 5436,
    fairUseCreditsPerMonthAnnual: 4503,
  },
};

function renderPricing() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}

describe('Pricing page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a loading state before pricing resolves', () => {
    fetch.mockReturnValueOnce(new Promise(() => {})); // never resolves during this test

    renderPricing();

    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });

  it('renders packs and the unlimited plan once pricing loads', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => PRICING_PAYLOAD });

    renderPricing();

    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument();
    });

    expect(screen.getByText('Growth')).toBeInTheDocument();
    expect(screen.getByText('$19.00')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.getByText('$99.00')).toBeInTheDocument();
  });

  it('toggles the Unlimited plan to its own annual price and fair-use cap', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => PRICING_PAYLOAD });

    renderPricing();

    await waitFor(() => {
      expect(screen.getByText('Unlimited')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Annual' }));

    expect(screen.getByText('$990.00')).toBeInTheDocument();
    expect(screen.getByText('4,503', { exact: false })).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    fetch.mockRejectedValueOnce(new Error('network down'));

    renderPricing();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load pricing/i);
    });
  });
});
