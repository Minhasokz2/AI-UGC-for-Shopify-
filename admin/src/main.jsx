import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import '@shopify/polaris/build/esm/styles.css';
import PolarisRouterLink from './components/PolarisRouterLink';
import App from './App';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider i18n={enTranslations} linkComponent={PolarisRouterLink}>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
