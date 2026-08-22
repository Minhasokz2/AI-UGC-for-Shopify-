import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { ProductPicker } from '../../../src/components/generation/ProductPicker.jsx';

let mockUseProducts;
let mockMutate;
let mockSyncProducts;

vi.mock('../../../src/hooks/useProducts.js', () => ({
  useProducts: () => mockUseProducts,
  useSyncProducts: () => mockSyncProducts,
}));

function renderPicker() {
  return render(
    <AppProvider i18n={{}}>
      <ProductPicker selectedIds={[]} onChangeSelected={() => {}} />
    </AppProvider>,
  );
}

beforeEach(() => {
  mockMutate = vi.fn();
  mockSyncProducts = { mutate: mockMutate, isPending: false, isError: false, error: undefined };
});

describe('ProductPicker', () => {
  it('auto-syncs once, with no button click, when the catalog cache comes back empty', () => {
    mockUseProducts = { data: { products: [] }, isLoading: false, isError: false, error: undefined };
    renderPicker();

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('does not auto-sync when products are already cached', () => {
    mockUseProducts = {
      data: { products: [{ id: 'shop-a:1', title: 'Widget', imageUrls: [] }] },
      isLoading: false,
      isError: false,
      error: undefined,
    };
    renderPicker();

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Widget')).toBeInTheDocument();
  });

  it('does not auto-sync while the initial product list is still loading', () => {
    mockUseProducts = { data: undefined, isLoading: true, isError: false, error: undefined };
    renderPicker();

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('does not auto-sync when the product list query itself errored', () => {
    mockUseProducts = { data: undefined, isLoading: false, isError: true, error: new Error('boom') };
    renderPicker();

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows a syncing indicator instead of "No products found" while the auto-sync is in flight', () => {
    mockUseProducts = { data: { products: [] }, isLoading: false, isError: false, error: undefined };
    mockSyncProducts = { mutate: mockMutate, isPending: true, isError: false, error: undefined };
    renderPicker();

    expect(screen.getAllByText('Syncing your catalog…').length).toBeGreaterThan(0);
    expect(screen.queryByText('No products found')).not.toBeInTheDocument();
  });
});
