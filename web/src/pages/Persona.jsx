import { useState } from 'react';
import { BlockStack, TextField, Button, Card } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { ImageAttachControl } from '../components/generation/ImageAttachControl.jsx';
import { AgeConfirmationCheckbox } from '../components/generation/AgeConfirmationCheckbox.jsx';
import { useCreateJob } from '../hooks/useJobs.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

const SOURCE_IMAGE_CONSTRAINT = { min: 1, max: 1 };

export function Persona() {
  const [images, setImages] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const createJob = useCreateJob();
  const { showApiError, showSuccess } = useAppBridgeToast();
  const navigate = useNavigate();

  const canGenerate = images.length === 1 && prompt.trim().length > 0 && ageConfirmed;

  async function handleGenerate() {
    try {
      const { job } = await createJob.mutateAsync({
        contentType: 'ugc',
        sourceImageUrl: images[0],
        prompt,
        personaAttributes: { ageRange: ageConfirmed ? 'adult' : undefined },
      });
      showSuccess('Job created — track it in Job History.');
      navigate(`/jobs/${job.id}`);
    } catch (error) {
      showApiError(error);
    }
  }

  return (
    <PageSkeleton title="Persona Builder">
      <Card>
        <BlockStack gap="400">
          <ImageAttachControl
            label="Source image"
            images={images}
            onChange={setImages}
            constraint={SOURCE_IMAGE_CONSTRAINT}
          />
          <TextField
            label="Prompt"
            value={prompt}
            onChange={setPrompt}
            multiline={4}
            autoComplete="off"
            placeholder="Describe the UGC-style scene…"
          />
          <AgeConfirmationCheckbox checked={ageConfirmed} onChange={setAgeConfirmed} />
          <Button variant="primary" disabled={!canGenerate} loading={createJob.isPending} onClick={handleGenerate}>
            Generate
          </Button>
        </BlockStack>
      </Card>
    </PageSkeleton>
  );
}
