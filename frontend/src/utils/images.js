import catalogPlaceholder from '../assets/catalog-placeholder.svg';
import { assetUrl } from '../services/config';

/** Bundled stand-in shown when a catalogue item has no uploaded photo. */
export const CATALOG_PLACEHOLDER = catalogPlaceholder;

/**
 * Resolves a stored image value into something an <img> can load.
 *
 * Three cases have to be handled, because an older backend may still be
 * deployed alongside a newer frontend:
 *  - empty / NULL          -> the bundled placeholder (no request at all)
 *  - "/placeholder/x.jpg"  -> the bundled placeholder; this invented path was
 *                             stored for rows that had no image and nothing
 *                             ever served it, so requesting it only produced
 *                             a 404 in the console
 *  - anything else         -> made absolute against the API origin, so uploads
 *                             on a split deployment don't load from the CDN
 */
export function resolveImageUrl(url, fallback = CATALOG_PLACEHOLDER) {
  if (typeof url !== 'string' || !url.trim()) return fallback;
  if (/^(?:\/api)?\/placeholder\//i.test(url)) return fallback;
  return assetUrl(url);
}
