import { useState } from 'react';
import { BlockStack, InlineStack, Text, RangeSlider } from '@shopify/polaris';

export function BeforeAfterSlider({ beforeUrl, afterUrl }) {
  const [position, setPosition] = useState(50);

  return (
    <BlockStack gap="200">
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, aspectRatio: '1 / 1' }}>
        <img
          src={beforeUrl}
          alt="Before"
          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            clipPath: `inset(0 ${100 - position}% 0 0)`,
          }}
        >
          <img
            src={afterUrl}
            alt="After"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      </div>
      <RangeSlider
        label="Before / after"
        labelHidden
        value={position}
        onChange={setPosition}
        min={0}
        max={100}
        output
      />
      <InlineStack align="space-between">
        <Text as="span" tone="subdued">
          Before
        </Text>
        <Text as="span" tone="subdued">
          After
        </Text>
      </InlineStack>
    </BlockStack>
  );
}
