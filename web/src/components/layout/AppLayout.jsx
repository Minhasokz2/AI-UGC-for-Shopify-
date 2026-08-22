import { NavMenu } from '@shopify/app-bridge-react';
import { Outlet, Link } from 'react-router-dom';

/**
 * Top-level nav. Shopify admin already provides the app chrome (top bar,
 * side nav host) — we do NOT use Polaris's <Frame>/<Navigation>/<TopBar>,
 * only App Bridge's <NavMenu>, which renders a <ui-nav-menu> the admin
 * shell reads to build its own nav UI.
 *
 * 7 top-level items per spec. The 5 generation modes live one level under
 * /generate, not in the top nav.
 */
export function AppLayout() {
  return (
    <>
      <NavMenu>
        <Link to="/" rel="home">
          Home
        </Link>
        <Link to="/generate">Generate</Link>
        <Link to="/jobs">Job History</Link>
        <Link to="/optimizer">Image Optimizer</Link>
        <Link to="/settings/brand">Brand Settings</Link>
        <Link to="/billing">Billing</Link>
        <Link to="/referrals">Referrals</Link>
      </NavMenu>
      <Outlet />
    </>
  );
}
