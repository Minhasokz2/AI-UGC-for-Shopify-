import { useEffect, useRef, useState } from 'react';
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
  const hasAutoSynced = useRef(false);

  const products = data?.products ?? [];

  // A merchant shouldn't need to know "Sync catalog" exists just to see their
  // own products on first load — auto-trigger it once if the cache comes back
  // empty. Guarded to fire only once per mount so a genuinely empty Shopify
  // catalog (or a search with no matches) doesn't retry forever; the button
  // below still exists for an explicit re-sync after adding new products.
  useEffect(() => {
    if (!hasAutoSynced.current && !isLoading && !isError && products.length === 0) {
      hasAutoSynced.current = true;
      syncProducts.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isError, products.length]);

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

      {/* Sync failures were previously silent — the button would spin, finish, and the list would
          just stay empty with no indication anything went wrong. This surfaces the mutation's own
          error the same way the product-list query's error is already surfaced below, so a real
          failure (e.g. a Shopify Admin API scope/permission error) is visible instead of reading
          as "the app is broken" with zero diagnostic signal. */}
      {syncProducts.isError && <ErrorState error={syncProducts.error} title="Couldn't sync catalog" />}

      {isLoading && <LoadingState label="Loading products…" />}
      {isError && <ErrorState error={error} title="Couldn't load products" />}
      {!isLoading && !isError && products.length === 0 && syncProducts.isPending && (
        <LoadingState label="Syncing your catalog…" />
      )}
      {!isLoading && !isError && products.length === 0 && !syncProducts.isPending && (
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
