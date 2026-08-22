import { useEffect, useState } from 'react';
import { BlockStack, Card, TextField, Button, Text, Tag, InlineStack } from '@shopify/polaris';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { LoadingState } from '../components/feedback/LoadingState.jsx';
import { ErrorState } from '../components/feedback/ErrorState.jsx';
import { ImageAttachControl } from '../components/generation/ImageAttachControl.jsx';
import { useBrandSettings, useSaveBrandSettings, useExtractBrandSettings } from '../hooks/useBrandSettings.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

const EXTRACT_IMAGES_CONSTRAINT = { min: 1, max: 10 };

export function BrandSettings() {
  const { data, isLoading, isError, error } = useBrandSettings();
  const saveBrandSettings = useSaveBrandSettings();
  const extractBrandSettings = useExtractBrandSettings();
  const { showApiError, showSuccess } = useAppBridgeToast();

  const [colors, setColors] = useState([]);
  const [colorInput, setColorInput] = useState('');
  const [tone, setTone] = useState('');
  const [extractImages, setExtractImages] = useState([]);

  useEffect(() => {
    if (data?.brandStyleProfile) {
      setColors(data.brandStyleProfile.colors ?? []);
      setTone(data.brandStyleProfile.tone ?? '');
    }
  }, [data]);

  function addColor() {
    if (colorInput.trim()) {
      setColors([...colors, colorInput.trim()]);
      setColorInput('');
    }
  }

  async function handleSave() {
    try {
      await saveBrandSettings.mutateAsync({ colors, tone });
      showSuccess('Brand settings saved.');
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleExtract() {
    try {
      const result = await extractBrandSettings.mutateAsync(extractImages);
      setColors(result.brandStyleProfile.colors ?? []);
      setTone(result.brandStyleProfile.tone ?? '');
      showSuccess('Extracted brand style from your images.');
    } catch (err) {
      showApiError(err);
    }
  }

  if (isLoading) return <PageSkeleton title="Brand Settings"><LoadingState label="Loading brand settings…" /></PageSkeleton>;
  if (isError) return <PageSkeleton title="Brand Settings"><ErrorState error={error} title="Couldn't load brand settings" /></PageSkeleton>;

  return (
    <PageSkeleton title="Brand Settings">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Extract from images
            </Text>
            <ImageAttachControl
              label="Reference images"
              images={extractImages}
              onChange={setExtractImages}
              constraint={EXTRACT_IMAGES_CONSTRAINT}
            />
            <Button
              onClick={handleExtract}
              disabled={extractImages.length === 0}
              loading={extractBrandSettings.isPending}
            >
              Extract from images
            </Button>
            {extractBrandSettings.isPending && (
              <Text as="p" tone="subdued">
                Analyzing your images — this can take several seconds…
              </Text>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">
              Manual editor
            </Text>
            <InlineStack gap="200">
              <TextField label="Add color" labelHidden value={colorInput} onChange={setColorInput} autoComplete="off" />
              <Button onClick={addColor}>Add</Button>
            </InlineStack>
            <InlineStack gap="150">
              {colors.map((c, i) => (
                <Tag key={`${c}-${i}`} onRemove={() => setColors(colors.filter((_, idx) => idx !== i))}>
                  {c}
                </Tag>
              ))}
            </InlineStack>
            <TextField label="Tone" value={tone} onChange={setTone} autoComplete="off" />
            <Button variant="primary" onClick={handleSave} loading={saveBrandSettings.isPending}>
              Save
            </Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </PageSkeleton>
  );
}
