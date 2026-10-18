/**
 * CORS origin resolution.
 *
 * CLIENT_URL accepts a comma-separated list so a staging URL and the real one
 * can share a backend without a code change, e.g.
 *   CLIENT_URL=https://imizi.vercel.app,https://imizi.rw
 *
 * Origins are compared exactly. A browser sends `Origin` without a trailing
 * slash, so trailing slashes are stripped here rather than silently failing
 * every preflight.
 */
function allowedOrigins() {
  return (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

// No Origin header means same-origin, a server-to-server call or curl; those
// are not browser-enforced CORS requests and must not be rejected.
function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  callback(null, allowedOrigins().includes(origin.replace(/\/+$/, '')));
}

module.exports = { allowedOrigins, corsOrigin };
