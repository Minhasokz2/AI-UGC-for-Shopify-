import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AppProvider as PolarisProvider } from '@shopify/polaris';
import { GoogleSignInGate } from './components/auth/GoogleSignInGate.jsx';
import { RootEffects } from './components/layout/RootEffects.jsx';
import { createQueryClient } from './lib/queryClient.js';
import { router } from './routes.jsx';

const queryClient = createQueryClient();

export function App() {
  return (
    <PolarisProvider i18n={{}}>
      <QueryClientProvider client={queryClient}>
        <GoogleSignInGate>
          <RootEffects />
          <RouterProvider router={router} />
        </GoogleSignInGate>
      </QueryClientProvider>
    </PolarisProvider>
  );
}
