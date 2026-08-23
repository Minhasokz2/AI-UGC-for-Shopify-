import { useState } from 'react';
import { BlockStack, TextField, Button, Card, ButtonGroup, Text } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { ImageAttachControl } from '../components/generation/ImageAttachControl.jsx';
import { useModels } from '../hooks/useModels.js';
import { useCreateJob } from '../hooks/useJobs.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

const SOURCE_IMAGE_CONSTRAINT = { min: 1, max: 1 };
const TIERS = ['fast', 'standard', 'premium'];
const ROLE_BY_TIER = {
  fast: 'video_fast',
  standard: 'video_standard',
  premium: 'video_premium',
};

export function Video() {
  const [images, setImages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [tier, setTier] = useState('standard');
  const { data: modelsData } = useModels({ category: 'video' });
  const createJob = useCreateJob();
  const { showApiError, showSuccess } = useAppBridgeToast();
  const navigate = useNavigate();

  const models = modelsData?.models ?? [];
  const tierModel = models.find((m) => m.role === ROLE_BY_TIER[tier]);

  const canGenerate = images.length === 1 && prompt.trim().length > 0;

  async function handleGenerate() {
    try {
      const { job } = await createJob.mutateAsync({
        contentType: 'video',
        sourceImageUrl: images[0],
        prompt,
        videoTier: tier,
      });
      showSuccess('Job created — track it in Job History.');
      navigate(`/jobs/${job.id}`);
    } catch (error) {
      showApiError(error);
    }
  }

  return (
    <PageSkeleton title="Video Studio">
      <Card>
        <BlockStack gap="400">
          <ImageAttachControl
            label="Source image"
            images={images}
            onChange={setImages}
            constraint={SOURCE_IMAGE_CONSTRAINT}
          />
          <TextField
            label="Motion prompt"
            value={prompt}
            onChange={setPrompt}
            multiline={3}
            autoComplete="off"
            placeholder="Describe the motion / camera movement…"
          />
          <BlockStack gap="200">
            <Text as="span" fontWeight="semibold">
              Quality tier
            </Text>
            <ButtonGroup variant="segmented">
              {TIERS.map((t) => (
                <Button key={t} pressed={tier === t} onClick={() => setTier(t)}>
                  {t}
                </Button>
              ))}
            </ButtonGroup>
            {tierModel && (
              <Text as="span" tone="subdued">
                {tierModel.creditCost} credits
              </Text>
            )}
          </BlockStack>
          <Button variant="primary" disabled={!canGenerate} loading={createJob.isPending} onClick={handleGenerate}>
            Generate
          </Button>
        </BlockStack>
      </Card>
    </PageSkeleton>
  );
}
