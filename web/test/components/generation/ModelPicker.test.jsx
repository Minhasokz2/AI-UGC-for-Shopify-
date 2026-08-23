import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

function getOptionLabels() {
  return screen.getAllByRole('option').map((option) => option.textContent);
}

describe('ModelPicker', () => {
  it('renders one dropdown option per returned model when excludeCategories is not passed', () => {
    mockModels = { data: { models: [{ id: 'a', label: 'Scene model', category: 'scene', creditCost: 2 }, { id: 'b', label: 'Video model', category: 'video', creditCost: 16 }] }, isLoading: false, isError: false };
    renderPicker();

    const labels = getOptionLabels();
    expect(labels).toContain('Scene model (2 credits)');
    expect(labels).toContain('Video model (16 credits)');
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

    const labels = getOptionLabels();
    expect(labels).toContain('Scene model (2 credits)');
    expect(labels.some((label) => label.startsWith('Video model'))).toBe(false);
    expect(labels.some((label) => label.startsWith('Try-on model'))).toBe(false);
    expect(labels.some((label) => label.startsWith('Background removal'))).toBe(false);
  });

  it('selecting an option calls onSelect with the matching model, and shows its credit cost', () => {
    mockModels = { data: { models: [{ id: 'a', label: 'Scene model', category: 'scene', creditCost: 2 }] }, isLoading: false, isError: false };
    const onSelect = vi.fn();
    renderPicker({ onSelect, selectedModelId: 'a' });

    expect(screen.getByText('2 credits per generation')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose a model'), { target: { value: 'a' } });
    expect(onSelect).toHaveBeenCalledWith({ id: 'a', label: 'Scene model', category: 'scene', creditCost: 2 });
  });
});
