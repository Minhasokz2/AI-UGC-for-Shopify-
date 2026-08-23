import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { CustomAmountPreview } from '../../../src/components/billing/CustomAmountPreview.jsx';
import { ApiError } from '../../../src/lib/apiClient.js';

let mockPreview;

vi.mock('../../../src/hooks/usePricingPreview.js', () => ({
  useCustomPurchasePreview: () => mockPreview,
}));

function renderPreview(props = {}) {
  return render(
    <AppProvider i18n={{}}>
      <CustomAmountPreview onPurchase={() => {}} isPending={false} {...props} />
    </AppProvider>,
  );
}

beforeEach(() => {
  mockPreview = { data: undefined, isFetching: false, isError: false, error: undefined };
});

describe('CustomAmountPreview', () => {
  it('disables Purchase and shows the real error once the preview 400s below the minimum', () => {
    mockPreview = {
      data: undefined,
      isFetching: false,
      isError: true,
      error: new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Custom purchase amount must be at least $5.00.' }),
    };
    renderPreview();
    fireEvent.change(screen.getByLabelText('Custom amount (USD)'), { target: { value: '1' } });

    expect(screen.getByText('Custom purchase amount must be at least $5.00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchase' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('enables Purchase once a valid preview resolves', () => {
    mockPreview = { data: { credits: 75 }, isFetching: false, isError: false, error: undefined };
    renderPreview();
    fireEvent.change(screen.getByLabelText('Custom amount (USD)'), { target: { value: '10' } });

    expect(screen.getByText(/gets you 75 credits/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchase' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps Purchase disabled with no amount entered, showing neither data nor an error', () => {
    renderPreview();
    expect(screen.getByRole('button', { name: 'Purchase' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText(/gets you/)).not.toBeInTheDocument();
  });
});
