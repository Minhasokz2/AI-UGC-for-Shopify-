import { useState } from 'react';
import { BlockStack, TextField, Button, Card, Text } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { ModelPicker } from '../components/generation/ModelPicker.jsx';
import { ImageAttachControl } from '../components/generation/ImageAttachControl.jsx';
import { getImageCountConstraint } from '../lib/getImageCountConstraint.js';
import { isSelectionValid } from '../lib/isSelectionValid.js';
import { useCreateJob } from '../hooks/useJobs.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

// background_removal has no standalone prompt-driven UI of its own here;
// video and try_on each have their own dedicated flow (Video Studio, Virtual
// Try-On) with UI these models actually need (a tier picker, a person+garment
// image pair) that this generic prompt+image picker doesn't collect.
const STUDIO_EXCLUDED_CATEGORIES = ['background_removal', 'video', 'try_on'];

/**
 * Custom Prompt Studio. ModelPicker renders first and is the ONLY enabled
 * control until a model is chosen — the image-attach UI isn't even
 * mounted before that. Changing the selected model resets any already
 * attached images. If constraint.max === 0 (text-to-image), no attach UI
 * renders at all. Generate is disabled until prompt is non-empty AND the
 * image selection satisfies the model's constraint.
 */
export function Studio() {
  const [selectedModel, setSelectedModel] = useState(null);
  const [images, setImages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const createJob = useCreateJob();
  const { showApiError, showSuccess } = useAppBridgeToast();
  const navigate = useNavigate();

  function handleSelectModel(model) {
    setSelectedModel(model);
    setImages([]); // changing the model resets already-attached images
  }

  const constraint = selectedModel ? getImageCountConstraint(selectedModel) : { min: 0, max: 0 };
  const canGenerate =
    Boolean(selectedModel) && prompt.trim().length > 0 && isSelectionValid(images.length, constraint);

  async function handleGenerate() {
    try {
      const { job } = await createJob.mutateAsync({
        contentType: 'custom',
        modelId: selectedModel.id,
        prompt,
        imageUrls: images,
      });
      showSuccess('Job created — track it in Job History.');
      navigate(`/jobs/${job.id}`);
    } catch (error) {
      showApiError(error);
    }
  }

  return (
    <PageSkeleton title="Custom Prompt Studio">
      <BlockStack gap="400">
        <Card>
          <ModelPicker
            eligibleFlow="custom"
            excludeCategories={STUDIO_EXCLUDED_CATEGORIES}
            selectedModelId={selectedModel?.id}
            onSelect={handleSelectModel}
          />
        </Card>

        {selectedModel && (
          <Card>
            <BlockStack gap="400">
              {constraint.max > 0 && (
                <ImageAttachControl
                  label="Reference images"
                  images={images}
                  onChange={setImages}
                  constraint={constraint}
                />
              )}
              <TextField
                label="Prompt"
                value={prompt}
                onChange={setPrompt}
                multiline={4}
                autoComplete="off"
                placeholder="Describe what you want generated…"
              />
              <Text as="p" tone="subdued">
                {selectedModel.creditCost} credits per image
              </Text>
              <Button variant="primary" disabled={!canGenerate} loading={createJob.isPending} onClick={handleGenerate}>
                Generate
              </Button>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </PageSkeleton>
  );
}
