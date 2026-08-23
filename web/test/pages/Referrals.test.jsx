import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { Referrals } from '../../src/pages/Referrals.jsx';

let mockReferral;
const applyCodeMutateAsync = vi.fn();
const showSuccess = vi.fn();
const showError = vi.fn();
const showApiError = vi.fn();

vi.mock('../../src/hooks/useReferral.js', () => ({
  useReferral: () => mockReferral,
  useApplyReferralCode: () => ({ mutateAsync: applyCodeMutateAsync, isPending: false }),
}));
vi.mock('../../src/hooks/useAppBridgeToast.js', () => ({
  useAppBridgeToast: () => ({ showSuccess, showError, showApiError }),
}));

function renderReferrals() {
  return render(
    <AppProvider i18n={{}}>
      <Referrals />
    </AppProvider>,
  );
}

beforeEach(() => {
  applyCodeMutateAsync.mockReset();
  showSuccess.mockReset();
  showError.mockReset();
  showApiError.mockReset();
  mockReferral = {
    data: { code: 'ABCDEFGH', referrals: [] },
    isLoading: false,
    isError: false,
  };
});

describe('Referrals', () => {
  it('applies a referral code and clears the input on success', async () => {
    applyCodeMutateAsync.mockResolvedValue({ applied: true });
    renderReferrals();

    fireEvent.change(screen.getByPlaceholderText('Enter a code'), { target: { value: 'friendcode' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(applyCodeMutateAsync).toHaveBeenCalledWith('friendcode'));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Referral code applied.'));
    await waitFor(() => expect(screen.getByPlaceholderText('Enter a code')).toHaveValue(''));
  });

  it('shows a specific toast when the code is unknown, and leaves the input untouched', async () => {
    applyCodeMutateAsync.mockResolvedValue({ applied: false, reason: 'unknown_code' });
    renderReferrals();

    fireEvent.change(screen.getByPlaceholderText('Enter a code'), { target: { value: 'bogus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith("That code doesn't match any shop."));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Enter a code')).toHaveValue('bogus');
  });

  it('routes a thrown request error to showApiError', async () => {
    applyCodeMutateAsync.mockRejectedValue(new Error('network down'));
    renderReferrals();

    fireEvent.change(screen.getByPlaceholderText('Enter a code'), { target: { value: 'anycode' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(showApiError).toHaveBeenCalled());
  });

  it('disables Apply until a code is entered', () => {
    renderReferrals();
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(screen.getByPlaceholderText('Enter a code'), { target: { value: 'x' } });
    expect(screen.getByRole('button', { name: 'Apply' })).not.toHaveAttribute('aria-disabled', 'true');
  });
});
