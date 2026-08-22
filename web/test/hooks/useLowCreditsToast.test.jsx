import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLowCreditsToast } from '../../src/hooks/useLowCreditsToast.js';

const showErrorMock = vi.fn();
let mockShopStatusData;

vi.mock('@shopify/app-bridge-react', () => ({
  useAppBridge: () => ({ toast: { show: showErrorMock } }),
}));

vi.mock('../../src/hooks/useShopStatus.js', () => ({
  useShopStatus: () => ({ data: mockShopStatusData }),
}));

beforeEach(() => {
  showErrorMock.mockClear();
  mockShopStatusData = undefined;
});

// LOW_CREDITS_THRESHOLD is 5, re-arm threshold is 2 * 5 = 10.

describe('useLowCreditsToast', () => {
  it('does not fire while balance is comfortably above the threshold', () => {
    mockShopStatusData = { creditBalance: 50 };
    const { rerender } = renderHook(() => useLowCreditsToast());
    rerender();
    expect(showErrorMock).not.toHaveBeenCalled();
  });

  it('fires once when balance drops to/below the threshold', () => {
    mockShopStatusData = { creditBalance: 20 };
    const { rerender } = renderHook(() => useLowCreditsToast());

    mockShopStatusData = { creditBalance: 5 };
    rerender();
    expect(showErrorMock).toHaveBeenCalledTimes(1);
    expect(showErrorMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ isError: true }));
  });

  it('does not fire again while hovering near the threshold (no spam)', () => {
    mockShopStatusData = { creditBalance: 5 };
    const { rerender } = renderHook(() => useLowCreditsToast());
    expect(showErrorMock).toHaveBeenCalledTimes(1);

    mockShopStatusData = { creditBalance: 4 };
    rerender();
    mockShopStatusData = { creditBalance: 6 };
    rerender();
    mockShopStatusData = { creditBalance: 3 };
    rerender();
    expect(showErrorMock).toHaveBeenCalledTimes(1);
  });

  it('re-arms only once balance climbs back above 2x the threshold, then can fire again on a later dip', () => {
    mockShopStatusData = { creditBalance: 5 };
    const { rerender } = renderHook(() => useLowCreditsToast());
    expect(showErrorMock).toHaveBeenCalledTimes(1);

    // Climbs to 9 — still <= 2*threshold (10) — must NOT re-arm yet.
    mockShopStatusData = { creditBalance: 9 };
    rerender();
    mockShopStatusData = { creditBalance: 4 };
    rerender();
    expect(showErrorMock).toHaveBeenCalledTimes(1);

    // Climbs above 10 — re-arms.
    mockShopStatusData = { creditBalance: 11 };
    rerender();

    // Dips again — fires a second time.
    mockShopStatusData = { creditBalance: 5 };
    rerender();
    expect(showErrorMock).toHaveBeenCalledTimes(2);
  });

  it('ignores updates while creditBalance is not yet loaded', () => {
    mockShopStatusData = undefined;
    const { rerender } = renderHook(() => useLowCreditsToast());
    rerender();
    expect(showErrorMock).not.toHaveBeenCalled();
  });
});
