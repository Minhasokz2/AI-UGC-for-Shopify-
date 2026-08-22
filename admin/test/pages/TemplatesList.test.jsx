import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import TemplatesList from '../../src/pages/TemplatesList';
import { renderWithProviders } from '../testUtils';

function mockFetchJson(body, status = 200) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

describe('TemplatesList', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders a row per template from the mocked API response', async () => {
    global.fetch = mockFetchJson({
      templates: [
        { id: 'studio-scene', label: 'Studio Scene', category: 'scene', modelRole: 'scene-gen', creditCost: 3 },
        { id: 'ugc-review', label: 'UGC Review', category: 'ugc', modelRole: 'ugc-gen', creditCost: 5 },
      ],
    });

    renderWithProviders(<TemplatesList />, { route: '/templates' });

    await waitFor(() => expect(screen.getByText('Studio Scene')).toBeInTheDocument());
    expect(screen.getByText('UGC Review')).toBeInTheDocument();
    expect(screen.getByText('2 templates')).toBeInTheDocument();

    // The request went to the right endpoint with no category filter.
    expect(global.fetch).toHaveBeenCalledWith('/admin/api/templates', expect.any(Object));
  });

  it('shows an empty state when there are no templates', async () => {
    global.fetch = mockFetchJson({ templates: [] });
    renderWithProviders(<TemplatesList />, { route: '/templates' });
    await waitFor(() => expect(screen.getByText('No templates yet')).toBeInTheDocument());
  });

  it('shows an error banner when the request fails', async () => {
    global.fetch = mockFetchJson({ error: { code: 'INTERNAL', message: 'Boom' } }, 500);
    renderWithProviders(<TemplatesList />, { route: '/templates' });
    await waitFor(() => expect(screen.getByText('Boom')).toBeInTheDocument());
  });
});
