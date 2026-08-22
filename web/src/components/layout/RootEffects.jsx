import { useLowCreditsToast } from '../../hooks/useLowCreditsToast.js';

/**
 * Mounts app-wide side-effect hooks exactly once. Render this below the
 * Google Sign-In gate and above the route tree in App — never inside a
 * page component (that would remount it per navigation).
 */
export function RootEffects() {
  useLowCreditsToast();
  return null;
}
