import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { MemoryRouter } from 'react-router-dom';
import { Templates } from '../../src/pages/Templates.jsx';

let mockTemplates;
const createJobMutateAsync = vi.fn();

vi.mock('../../src/hooks/useTemplates.js', () => ({ useTemplates: () => mockTemplates }));
vi.mock('../../src/hooks/useJobs.js', () => ({
  useCreateJob: () => ({ mutateAsync: createJobMutateAsync, isPending: false }),
}));
vi.mock('../../src/hooks/useAppBridgeToast.js', () => ({
  useAppBridgeToast: () => ({ showApiError: vi.fn(), showSuccess: vi.fn() }),
}));
vi.mock('../../src/lib/sourceImageProductMap.js', () => ({ rememberSourceImageProduct: vi.fn() }));

// ProductPicker's real implementation fetches/syncs the catalog — irrelevant
// to this page's own logic (the UGC age-gate), so it's replaced with a
// minimal stand-in that lets a test "select" one fixed product.
vi.mock('../../src/components/generation/ProductPicker.jsx', () => ({
  ProductPicker: ({ onChangeSelected }) => (
    <button
      type="button"
      onClick={() => onChangeSelected(['product-1'], [{ shopifyProductId: 'product-1', imageUrls: ['https://cdn/product.png'] }])}
    >
      Select product
    </button>
  ),
}));

function renderTemplates() {
  return render(
    <AppProvider i18n={{}}>
      <MemoryRouter>
        <Templates />
      </MemoryRouter>
    </AppProvider>,
  );
}

beforeEach(() => {
  createJobMutateAsync.mockReset().mockResolvedValue({ job: { id: 'job-1' } });
  mockTemplates = {
    data: {
      templates: [
        { id: 'tpl-scene', label: 'Studio White Background', category: 'scene', creditCost: 2 },
        { id: 'tpl-ugc', label: 'UGC — Model Holding Product', category: 'ugc', creditCost: 3 },
      ],
    },
    isLoading: false,
    isError: false,
  };
});

describe('Templates (Template Gallery)', () => {
  it('requires age confirmation before Generate is enabled for the UGC template, and sends personaAttributes — regression for the always-422 bug', () => {
    renderTemplates();
    // Two "Use this template" buttons exist — open the UGC one specifically.
    const useButtons = screen.getAllByRole('button', { name: 'Use this template' });
    fireEvent.click(useButtons[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Select product' }));

    const generateButton = screen.getByRole('button', { name: 'Generate' });
    expect(generateButton).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('checkbox', { name: /confirm this depicts an adult/i }));
    expect(generateButton).not.toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(generateButton);

    expect(createJobMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'ugc', personaAttributes: { ageRange: 'adult' } }),
    );
  });

  it('does not show an age checkbox, and never sends personaAttributes, for a non-UGC template', () => {
    renderTemplates();
    const useButtons = screen.getAllByRole('button', { name: 'Use this template' });
    fireEvent.click(useButtons[0]);

    expect(screen.queryByRole('checkbox', { name: /confirm this depicts an adult/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select product' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(createJobMutateAsync).toHaveBeenCalledWith(expect.not.objectContaining({ personaAttributes: expect.anything() }));
  });
});
