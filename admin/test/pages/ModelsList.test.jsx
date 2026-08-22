import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import ModelsList from '../../src/pages/ModelsList';
import { renderWithProviders } from '../testUtils';

function mockFetchJson(body, status = 200) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

describe('ModelsList', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders a row per model with a needsPriceReview badge', async () => {
    global.fetch = mockFetchJson({
      models: [
        {
          id: 'seedream-scene-v1',
          label: 'Seedream Scene v1',
          category: 'scene',
          role: 'scene-gen',
          creditCost: 3,
          actualCostUsd: 0.05,
          needsPriceReview: false,
          provider: 'fal',
          endpoint: '/x',
          inputShape: 'image',
          imageParam: 'image_url',
          outputField: 'image',
          supportsBatch: false,
          imageCountConstraint: { min: 1, max: 1 },
        },
        {
          id: 'ugc-gen-v2',
          label: 'UGC Gen v2',
          category: 'ugc',
          role: 'ugc-gen',
          creditCost: 5,
          actualCostUsd: 0.09,
          needsPriceReview: true,
          provider: 'fal',
          endpoint: '/y',
          inputShape: 'image',
          imageParam: 'image_url',
          outputField: 'image',
          supportsBatch: true,
          imageCountConstraint: { min: 1, max: 4 },
        },
      ],
    });

    renderWithProviders(<ModelsList />, { route: '/models' });

    await waitFor(() => expect(screen.getByText('Seedream Scene v1')).toBeInTheDocument());
    expect(screen.getByText('UGC Gen v2')).toBeInTheDocument();
    expect(screen.getByText('Reviewed')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('2 models')).toBeInTheDocument();
  });

  it('shows an empty state with a re-seed action when there are no models', async () => {
    global.fetch = mockFetchJson({ models: [] });
    renderWithProviders(<ModelsList />, { route: '/models' });
    await waitFor(() => expect(screen.getByText('No models yet')).toBeInTheDocument());
  });

  it('shows an error banner when the request fails', async () => {
    global.fetch = mockFetchJson({ error: { code: 'INTERNAL', message: 'Boom' } }, 500);
    renderWithProviders(<ModelsList />, { route: '/models' });
    await waitFor(() => expect(screen.getByText('Boom')).toBeInTheDocument());
  });
});
