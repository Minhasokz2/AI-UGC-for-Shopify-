import { useState, useCallback } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Frame, Navigation, TopBar, Toast } from '@shopify/polaris';
import { getAdminApiKey, clearAdminApiKey } from '../lib/apiClient';
import { useToast } from './ToastProvider';

/**
 * Chrome for every authenticated route: Polaris's own Frame + Navigation +
 * TopBar + Toast (legitimate here — this SPA is standalone, not embedded in
 * the Shopify admin iframe, so it owns its own app frame rather than
 * borrowing App Bridge's).
 *
 * Also doubles as the auth gate: no stored API key -> bounce to /login
 * before rendering any protected page.
 */
function ProtectedShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast, dismissToast } = useToast();
  const [mobileNavActive, setMobileNavActive] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const toggleMobileNav = useCallback(() => setMobileNavActive((active) => !active), []);
  const toggleUserMenu = useCallback(() => setUserMenuOpen((open) => !open), []);

  const handleSignOut = useCallback(() => {
    clearAdminApiKey();
    navigate('/login', { replace: true });
  }, [navigate]);

  const apiKey = getAdminApiKey();
  if (!apiKey) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const isSelected = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const navigationMarkup = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        title="AI UGC Generator Admin"
        items={[
          { url: '/templates', label: 'Templates', selected: isSelected('/templates') },
          { url: '/models', label: 'Models', selected: isSelected('/models') },
          { url: '/margin-calculator', label: 'Margin calculator', selected: isSelected('/margin-calculator') },
          { url: '/ops', label: 'Ops', selected: isSelected('/ops') },
        ]}
      />
    </Navigation>
  );

  const userMenuMarkup = (
    <TopBar.UserMenu
      actions={[{ items: [{ content: 'Sign out', onAction: handleSignOut }] }]}
      name="Admin"
      detail="AI UGC Generator"
      initials="A"
      open={userMenuOpen}
      onToggle={toggleUserMenu}
    />
  );

  const topBarMarkup = (
    <TopBar showNavigationToggle onNavigationToggle={toggleMobileNav} userMenu={userMenuMarkup} />
  );

  const toastMarkup = toast ? (
    <Toast content={toast.content} error={toast.error} onDismiss={dismissToast} />
  ) : null;

  return (
    <Frame
      topBar={topBarMarkup}
      navigation={navigationMarkup}
      showMobileNavigation={mobileNavActive}
      onNavigationDismiss={toggleMobileNav}
    >
      {toastMarkup}
      <Outlet />
    </Frame>
  );
}

export default ProtectedShell;
