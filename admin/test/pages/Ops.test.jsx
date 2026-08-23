import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import Ops from '../../src/pages/Ops';
import { renderWithProviders } from '../testUtils';

function jsonResponse(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

describe('Ops', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists shops in the dropdown and grants credits to the selected one', async () => {
    let creditBalance = 10;
    global.fetch = vi.fn((url, options = {}) => {
      if (url === '/admin/api/shops' && (!options.method || options.method === 'GET')) {
        return Promise.resolve(
          jsonResponse({ shops: [{ shopDomain: 'admin-test.myshopify.com', plan: 'metered', creditBalance, verifiedEmail: null }] }),
        );
      }
      if (url === '/admin/api/shops/admin-test.myshopify.com/credits' && options.method === 'POST') {
        creditBalance += JSON.parse(options.body).amount;
        return Promise.resolve(jsonResponse({ shopDomain: 'admin-test.myshopify.com', creditBalance }));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${options.method ?? 'GET'} ${url}`));
    });

    renderWithProviders(<Ops />);

    await waitFor(() => expect(screen.getAllByText('admin-test.myshopify.com — 10 credits (metered)').length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('Credits'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Grant credits' }));

    await waitFor(() => expect(screen.getByText('admin-test.myshopify.com now has 110 credits.')).toBeInTheDocument());
    expect(screen.getAllByText('admin-test.myshopify.com — 110 credits (metered)').length).toBeGreaterThan(0);
  });

  it('shows an empty state when there are no installed shops', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ shops: [] }));
    renderWithProviders(<Ops />);
    await waitFor(() => expect(screen.getByText('No installed shops found.')).toBeInTheDocument());
  });

  it('shows an error banner when granting credits fails', async () => {
    global.fetch = vi.fn((url, options = {}) => {
      if (url === '/admin/api/shops') {
        return Promise.resolve(jsonResponse({ shops: [{ shopDomain: 'admin-test.myshopify.com', plan: 'metered', creditBalance: 10, verifiedEmail: null }] }));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'INTERNAL', message: 'Boom' } }, 500));
    });

    renderWithProviders(<Ops />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Grant credits' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Grant credits' }));

    await waitFor(() => expect(screen.getByText('Boom')).toBeInTheDocument());
  });
});
