import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import Logout from '../../src/pages/Logout';
import { setAdminApiKey, getAdminApiKey } from '../../src/lib/apiClient';
import { renderWithProviders } from '../testUtils';

describe('Logout', () => {
  beforeEach(() => {
    setAdminApiKey('test-key');
  });

  it('clears the stored admin API key when the operator confirms sign out', () => {
    renderWithProviders(<Logout />);

    expect(getAdminApiKey()).toBe('test-key');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(getAdminApiKey()).toBe('');
  });

  it('does not clear the key when the operator cancels', () => {
    renderWithProviders(<Logout />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(getAdminApiKey()).toBe('test-key');
  });
});
