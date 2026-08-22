import { BlockStack } from '@shopify/polaris';
import { ImageAttachControl } from './ImageAttachControl.jsx';

const FIXED_SINGLE_IMAGE_CONSTRAINT = { min: 1, max: 1 };

/**
 * Virtual Try-On does NOT reuse the Custom Prompt Studio model-first flow —
 * it has one fixed backend model. Two independently-labeled controls, each
 * hardcoded to { min: 1, max: 1 }, mapping to personImageUrl / garmentImageUrl.
 */
export function TryOnImagePair({ personImageUrl, garmentImageUrl, onChangePerson, onChangeGarment }) {
  return (
    <BlockStack gap="400">
      <ImageAttachControl
        label="Person photo"
        images={personImageUrl ? [personImageUrl] : []}
        onChange={(urls) => onChangePerson(urls[urls.length - 1] ?? null)}
        constraint={FIXED_SINGLE_IMAGE_CONSTRAINT}
      />
      <ImageAttachControl
        label="Garment photo"
        images={garmentImageUrl ? [garmentImageUrl] : []}
        onChange={(urls) => onChangeGarment(urls[urls.length - 1] ?? null)}
        constraint={FIXED_SINGLE_IMAGE_CONSTRAINT}
      />
    </BlockStack>
  );
}
