import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { ToastProvider } from '../src/components/ToastProvider';

/**
 * Every page needs Polaris's AppProvider (i18n context most components read
 * from) plus a Router (useNavigate/useParams) and the app's ToastProvider —
 * this bundles all three so page tests don't have to.
 */
export function renderWithProviders(ui, { route = '/' } = {}) {
  return render(
    <AppProvider i18n={enTranslations}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ToastProvider>
    </AppProvider>,
  );
}
