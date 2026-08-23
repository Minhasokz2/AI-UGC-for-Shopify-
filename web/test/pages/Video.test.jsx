import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { MemoryRouter } from 'react-router-dom';
import { Video } from '../../src/pages/Video.jsx';

let mockModels;

vi.mock('../../src/hooks/useModels.js', () => ({ useModels: () => mockModels }));
vi.mock('../../src/hooks/useJobs.js', () => ({ useCreateJob: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('../../src/hooks/useUploadImage.js', () => ({
  useUploadImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  readFileAsDataUrl: vi.fn(),
}));
vi.mock('../../src/hooks/useAppBridgeToast.js', () => ({
  useAppBridgeToast: () => ({ showApiError: vi.fn(), showSuccess: vi.fn() }),
}));

function renderVideo() {
  return render(
    <AppProvider i18n={{}}>
      <MemoryRouter>
        <Video />
      </MemoryRouter>
    </AppProvider>,
  );
}

beforeEach(() => {
  mockModels = {
    data: {
      models: [
        { id: 'wan25-preview-video-fast', role: 'video_fast', creditCost: 16 },
        { id: 'kling25-turbo-pro-video-standard', role: 'video_standard', creditCost: 22 },
        { id: 'veo3-audio-video-premium', role: 'video_premium', creditCost: 122 },
      ],
    },
  };
});

describe('Video Studio credit preview', () => {
  it('shows the standard tier\'s real credit cost by default — regression for the modelRole/role field-name mismatch', () => {
    renderVideo();
    expect(screen.getByText('22 credits')).toBeInTheDocument();
  });

  it('updates the shown credit cost when a different tier is picked', () => {
    renderVideo();

    fireEvent.click(screen.getByRole('button', { name: 'premium' }));

    expect(screen.getByText('122 credits')).toBeInTheDocument();
  });
});
