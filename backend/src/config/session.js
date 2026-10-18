/**
 * Attributes for the httpOnly refresh-token cookie.
 *
 * The refresh cookie is what keeps a user signed in across a reload, so its
 * attributes have to match how the app and the API are hosted:
 *   - same site (one origin, or app.example.com + api.example.com) -> lax
 *   - different sites (app.vercel.app + api.onrender.com)           -> none
 *
 * `sameSite: 'none'` is ignored by browsers unless the cookie is also `secure`.
 * `lax` is the default rather than `strict` because a strict cookie is withheld
 * on the first load after arriving from another site - e.g. a verify-email link.
 *
 * Read at call time (not module load) so tests and late env loading see the
 * current configuration.
 */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function refreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
    sameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
    maxAge: SEVEN_DAYS_MS,
    path: '/api/auth',
  };
}

module.exports = { refreshCookieOptions, SEVEN_DAYS_MS };
