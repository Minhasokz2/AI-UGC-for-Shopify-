import { useEffect, useRef } from 'react';
import { useAppBridgeToast } from './useAppBridgeToast.js';
import { useShopStatus } from './useShopStatus.js';
import { LOW_CREDITS_THRESHOLD, LOW_CREDITS_REARM_MULTIPLIER } from '../lib/constants.js';

/**
 * Mount exactly ONCE, inside a RootEffects-style component rendered in the
 * top-level App (below the Google Sign-In gate, above the route tree) —
 * never inside a page component, so it isn't remounted per-navigation.
 *
 * Fires a low-credits toast once when creditBalance <= LOW_CREDITS_THRESHOLD,
 * and only re-arms (can fire again) once the balance climbs back above
 * 2 * LOW_CREDITS_THRESHOLD — so a top-up followed by a later dip warns
 * again, but hovering near the threshold doesn't spam.
 */
export function useLowCreditsToast() {
  const { data } = useShopStatus();
  const { showError } = useAppBridgeToast();
  const firedRef = useRef(false);

  const creditBalance = data?.creditBalance;

  useEffect(() => {
    if (typeof creditBalance !== 'number') return;

    const rearmThreshold = LOW_CREDITS_THRESHOLD * LOW_CREDITS_REARM_MULTIPLIER;

    if (!firedRef.current && creditBalance <= LOW_CREDITS_THRESHOLD) {
      firedRef.current = true;
      showError(
        `You're running low on credits (${creditBalance} left). Top up to keep generating.`,
      );
    } else if (firedRef.current && creditBalance > rearmThreshold) {
      firedRef.current = false;
    }
  }, [creditBalance, showError]);
}
