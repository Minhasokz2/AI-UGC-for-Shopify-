import { useRef } from 'react';
import { BlockStack, InlineStack, Text, Button, Thumbnail } from '@shopify/polaris';
import { useUploadImage, readFileAsDataUrl } from '../../hooks/useUploadImage.js';
import { useAppBridgeToast } from '../../hooks/useAppBridgeToast.js';

/**
 * Generic multi/single image-attach control gated by a { min, max }
 * constraint. Renders nothing meaningful when max === 0 (callers should
 * simply not mount this in that case — see Custom Prompt Studio contract).
 *
 * @param {{
 *   label: string,
 *   images: string[],
 *   onChange: (urls: string[]) => void,
 *   constraint: { min: number, max: number },
 *   onPickFromCatalog?: () => void,
 * }} props
 */
export function ImageAttachControl({ label, images, onChange, constraint, onPickFromCatalog }) {
  const fileInputRef = useRef(null);
  const uploadImage = useUploadImage();
  const { showApiError } = useAppBridgeToast();

  if (constraint.max === 0) return null;

  const atMax = images.length >= constraint.max;

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { url } = await uploadImage.mutateAsync(dataUrl);
      onChange([...images, url]);
    } catch (error) {
      showApiError(error);
    }
  }

  function removeAt(index) {
    onChange(images.filter((_, i) => i !== index));
  }

  return (
    <BlockStack gap="200">
      <Text as="span" fontWeight="semibold">
        {label} ({images.length}/{constraint.max === Infinity ? '∞' : constraint.max})
      </Text>
      <InlineStack gap="200" wrap>
        {images.map((url, index) => (
          <div key={`${url}-${index}`} style={{ position: 'relative' }}>
            <Thumbnail source={url} alt={`${label} ${index + 1}`} size="large" />
            <Button size="micro" tone="critical" onClick={() => removeAt(index)}>
              Remove
            </Button>
          </div>
        ))}
      </InlineStack>
      {!atMax && (
        <InlineStack gap="200">
          <Button onClick={() => fileInputRef.current?.click()} loading={uploadImage.isPending}>
            Upload image
          </Button>
          {onPickFromCatalog && <Button onClick={onPickFromCatalog}>Pick from catalog</Button>}
        </InlineStack>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </BlockStack>
  );
}
