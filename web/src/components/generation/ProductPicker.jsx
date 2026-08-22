import { useState } from 'react';
import { BlockStack, InlineStack, Text, TextField, Button, Thumbnail, Checkbox } from '@shopify/polaris';
import { useProducts, useSyncProducts } from '../../hooks/useProducts.js';
import { LoadingState } from '../feedback/LoadingState.jsx';
import { ErrorState } from '../feedback/ErrorState.jsx';
import { EmptyState } from '../feedback/EmptyState.jsx';

/**
 * Product search/select backed by the synced catalog. Supports single or
 * multi-select via `multiple`.
 *
 * @param {{
 *   multiple?: boolean,
 *   selectedIds: string[],
 *   onChangeSelected: (ids: string[], products: object[]) => void,
 * }} props
 */
export function ProductPicker({ multiple = false, selectedIds = [], onChangeSelected }) {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error } = useProducts({ search, limit: 20 });
  const syncProducts = useSyncProducts();

  const products = data?.products ?? [];

  function toggle(product) {
    if (multiple) {
      const isSelected = selectedIds.includes(product.id);
      const nextIds = isSelected
        ? selectedIds.filter((id) => id !== product.id)
        : [...selectedIds, product.id];
      onChangeSelected(nextIds, products.filter((p) => nextIds.includes(p.id)));
    } else {
      onChangeSelected([product.id], [product]);
    }
  }

  return (
    <BlockStack gap="300">
      <InlineStack gap="200" align="space-between">
        <TextField
          label="Search products"
          labelHidden
          placeholder="Search your catalog…"
          value={search}
          onChange={setSearch}
          autoComplete="off"
        />
        <Button onClick={() => syncProducts.mutate()} loading={syncProducts.isPending}>
          Sync catalog
        </Button>
      </InlineStack>

      {isLoading && <LoadingState label="Loading products…" />}
      {isError && <ErrorState error={error} title="Couldn't load products" />}
      {!isLoading && !isError && products.length === 0 && (
        <EmptyState heading="No products found">
          <Text as="p">Try syncing your catalog, or search for a different term.</Text>
        </EmptyState>
      )}

      <BlockStack gap="200">
        {products.map((product) => (
          <InlineStack key={product.id} gap="300" blockAlign="center">
            {multiple ? (
              <Checkbox
                label=""
                labelHidden
                checked={selectedIds.includes(product.id)}
                onChange={() => toggle(product)}
              />
            ) : (
              <Button
                pressed={selectedIds.includes(product.id)}
                onClick={() => toggle(product)}
              >
                {selectedIds.includes(product.id) ? 'Selected' : 'Select'}
              </Button>
            )}
            <Thumbnail source={product.imageUrls?.[0] ?? ''} alt={product.title} size="small" />
            <Text as="span">{product.title}</Text>
          </InlineStack>
        ))}
      </BlockStack>
    </BlockStack>
  );
}
