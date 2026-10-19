/**
 * Auth0 tenant configuration.
 *
 * AUTH0_DOMAIN is the tenant domain without a protocol
 * (`imizi.eu.auth0.com`), and AUTH0_API_AUDIENCE is the identifier of the
 * custom API registered in Auth0 - NOT the SPA client id. Tokens are issued
 * for that audience, so it is what the backend validates them against.
 *
 * Read through a function rather than at module load so tests and late
 * `dotenv` loading see the current environment.
 */
function stripProtocol(value) {
  return (value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function auth0Config() {
  const domain = stripProtocol(process.env.AUTH0_DOMAIN);
  const audience = (process.env.AUTH0_API_AUDIENCE || '').trim();

  return {
    domain,
    audience,
    // Auth0 issues `iss` with a trailing slash; jsonwebtoken compares it exactly.
    issuer: domain ? `https://${domain}/` : '',
    jwksUri: domain ? `https://${domain}/.well-known/jwks.json` : '',
    userInfoUrl: domain ? `https://${domain}/userinfo` : '',
    // Both halves are required: without an audience the token would be verified
    // for "whoever it was issued to", which accepts tokens minted for any app in
    // the same tenant.
    enabled: Boolean(domain && audience),
  };
}

module.exports = { auth0Config };
