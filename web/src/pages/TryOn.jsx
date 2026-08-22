import { useState } from 'react';
import { BlockStack, Button, Card } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/layout/PageSkeleton.jsx';
import { TryOnImagePair } from '../components/generation/TryOnImagePair.jsx';
import { useCreateJob } from '../hooks/useJobs.js';
import { useAppBridgeToast } from '../hooks/useAppBridgeToast.js';

export function TryOn() {
  const [personImageUrl, setPersonImageUrl] = useState(null);
  const [garmentImageUrl, setGarmentImageUrl] = useState(null);
  const createJob = useCreateJob();
  const { showApiError, showSuccess } = useAppBridgeToast();
  const navigate = useNavigate();

  const canGenerate = Boolean(personImageUrl) && Boolean(garmentImageUrl);

  async function handleGenerate() {
    try {
      const { job } = await createJob.mutateAsync({
        contentType: 'tryOn',
        personImageUrl,
        garmentImageUrl,
      });
      showSuccess('Job created — track it in Job History.');
      navigate(`/jobs/${job.id}`);
    } catch (error) {
      showApiError(error);
    }
  }

  return (
    <PageSkeleton title="Virtual Try-On">
      <Card>
        <BlockStack gap="400">
          <TryOnImagePair
            personImageUrl={personImageUrl}
            garmentImageUrl={garmentImageUrl}
            onChangePerson={setPersonImageUrl}
            onChangeGarment={setGarmentImageUrl}
          />
          <Button variant="primary" disabled={!canGenerate} loading={createJob.isPending} onClick={handleGenerate}>
            Generate
          </Button>
        </BlockStack>
      </Card>
    </PageSkeleton>
  );
}
