import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

/**
 * Adapter passed to Polaris's <AppProvider linkComponent={...}> so every
 * Polaris-rendered link (Navigation items, etc.) goes through react-router's
 * <Link> — client-side navigation, no full page reload — instead of a plain
 * <a>. Polaris calls this with a `url` prop (its LinkLikeComponent contract);
 * react-router expects `to`, hence the translation here.
 */
const PolarisRouterLink = forwardRef(function PolarisRouterLink(
  { url, external, target, ...rest },
  ref,
) {
  const isExternal = external || /^https?:\/\//.test(url || '');
  if (isExternal) {
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    return <a href={url} target={target} ref={ref} {...rest} />;
  }
  return <Link to={url} target={target} ref={ref} {...rest} />;
});

export default PolarisRouterLink;
