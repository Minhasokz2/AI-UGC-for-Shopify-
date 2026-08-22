/**
 * Best-effort client-side memory of which Shopify product a given
 * sourceImageUrl came from, so the Job Detail / Review page can default
 * the publish target without the merchant re-picking it. No backend field
 * tracks this relationship, so this is deliberately just a convenience —
 * it can come back empty (private window, cleared storage, another
 * device) and callers must always let the merchant override the pick.
 */
const STORAGE_KEY = 'motionart:sourceImageProductMap';

function readMap() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function rememberSourceImageProduct(sourceImageUrl, shopifyProductId) {
  if (!sourceImageUrl || !shopifyProductId) return;
  try {
    const map = readMap();
    map[sourceImageUrl] = shopifyProductId;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore — best-effort convenience only
  }
}

export function getRememberedProductId(sourceImageUrl) {
  if (!sourceImageUrl) return undefined;
  return readMap()[sourceImageUrl];
}
