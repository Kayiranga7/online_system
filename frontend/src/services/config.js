/**
 * Single source of truth for where the API and the realtime gateway live.
 *
 * VITE_API_URL is inlined at build time, so it must be set in the environment
 * of the build that produces the deployed bundle - changing it after `vite
 * build` has no effect.
 *
 * Accepts any of these shapes and normalizes to one origin:
 *   https://api.example.com
 *   https://api.example.com/
 *   https://api.example.com/api
 * Leaving it unset keeps the same-origin behaviour used locally, where Vite
 * proxies /api and /socket.io to the backend.
 */
const raw = (import.meta.env.VITE_API_URL || '').trim();

export const API_ORIGIN = raw.replace(/\/+$/, '').replace(/\/api$/, '');

export const API_BASE_URL = `${API_ORIGIN}/api`;

// Socket.IO attaches to the API host, not the static site's host: on a split
// deployment the frontend is served by a CDN that has no /socket.io route.
export const SOCKET_URL = API_ORIGIN || window.location.origin;

/**
 * The API returns storage paths like `/uploads/plants/abc.jpg`, which are
 * root-relative to the API host. On a split deployment those must be pointed at
 * the API explicitly, otherwise the browser asks the static host for them and
 * every uploaded image 404s. Absolute and inline URLs pass through untouched.
 */
export function assetUrl(path) {
  if (!path) return path;
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
