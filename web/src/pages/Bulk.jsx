import { useState } from 'react';
import { BlockStack, TextField, Button, Card } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { ProductPicker } from '../components/generation/ProductPicker.jsx';
import { useCreateBatch } from '../hooks/useBatch.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';
import { rememberSourceImageProduct } from '../lib/sourceImageProductMap.js';

export function Bulk() {
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [prompt, setPrompt] = useState('');
  const createBatch = useCreateBatch();
  const { showApiError, showSuccess } = useAppBridgeToast();
  const navigate = useNavigate();

  const canSubmit = selectedProducts.length > 0;

  async function handleSubmit() {
    try {
      const { batch } = await createBatch.mutateAsync({
        contentType: 'scene',
        prompt,
        items: selectedProducts.map((p) => ({ sourceImageUrl: p.imageUrls?.[0] })),
      });
      selectedProducts.forEach((p) => rememberSourceImageProduct(p.imageUrls?.[0], p.shopifyProductId));
      showSuccess(`Batch of ${selectedProducts.length} started.`);
      navigate(`/bulk/${batch.id}`);
    } catch (error) {
      showApiError(error);
    }
  }

  return (
    <PageSkeleton title="Bulk Generation">
      <Card>
        <BlockStack gap="400">
          <ProductPicker
            multiple
            selectedIds={selectedProductIds}
            onChangeSelected={(ids, products) => {
              setSelectedProductIds(ids);
              setSelectedProducts(products);
            }}
          />
          <TextField
            label="Shared prompt"
            value={prompt}
            onChange={setPrompt}
            multiline={3}
            autoComplete="off"
          />
          <Button variant="primary" disabled={!canSubmit} loading={createBatch.isPending} onClick={handleSubmit}>
            Start batch ({selectedProducts.length} products)
          </Button>
        </BlockStack>
      </Card>
    </PageSkeleton>
  );
}
