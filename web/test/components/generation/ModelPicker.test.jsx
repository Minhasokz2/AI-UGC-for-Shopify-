import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProvider } from '@shopify/polaris';
import { ModelPicker } from '../../../src/components/generation/ModelPicker.jsx';

let mockModels;

vi.mock('../../../src/hooks/useModels.js', () => ({ useModels: () => mockModels }));

function renderPicker(props = {}) {
  return render(
    <AppProvider i18n={{}}>
      <ModelPicker onSelect={() => {}} {...props} />
    </AppProvider>,
  );
}

describe('ModelPicker', () => {
  it('shows every returned model when excludeCategories is not passed', () => {
    mockModels = { data: { models: [{ id: 'a', label: 'Scene model', category: 'scene', creditCost: 2 }, { id: 'b', label: 'Video model', category: 'video', creditCost: 16 }] }, isLoading: false, isError: false };
    renderPicker();

    expect(screen.getByText('Scene model')).toBeInTheDocument();
    expect(screen.getByText('Video model')).toBeInTheDocument();
  });

  it('filters out categories in excludeCategories — regression for Custom Prompt Studio showing video/try_on/background_removal models it can\'t actually run', () => {
    mockModels = {
      data: {
        models: [
          { id: 'a', label: 'Scene model', category: 'scene', creditCost: 2 },
          { id: 'b', label: 'Video model', category: 'video', creditCost: 16 },
          { id: 'c', label: 'Try-on model', category: 'try_on', creditCost: 5 },
          { id: 'd', label: 'Background removal', category: 'background_removal', creditCost: 1 },
        ],
      },
      isLoading: false,
      isError: false,
    };
    renderPicker({ excludeCategories: ['background_removal', 'video', 'try_on'] });

    expect(screen.getByText('Scene model')).toBeInTheDocument();
    expect(screen.queryByText('Video model')).not.toBeInTheDocument();
    expect(screen.queryByText('Try-on model')).not.toBeInTheDocument();
    expect(screen.queryByText('Background removal')).not.toBeInTheDocument();
  });
});
