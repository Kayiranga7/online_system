const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { auth0Config } = require('../config/auth0');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

/**
 * Auth0 signs access tokens with RS256 and rotates the signing keys. The public
 * halves are published as a JWKS document, cached here: fetching it on every
 * request would add a network round-trip to every sign-in and would let Auth0's
 * rate limiter decide whether people can log in.
 *
 * Deliberately no `jwks-rsa`/`jose`: that package now pulls in an ESM-only
 * dependency, which neither Jest's CommonJS runtime nor Node 18-20's require()
 * can load. Node's own crypto.createPublicKey() accepts a JWK directly.
 */
const JWKS_TTL_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 5000;

let cache = { uri: null, keys: new Map(), fetchedAt: 0 };

async function refreshKeys(jwksUri) {
  let response;
  try {
    response = await axios.get(jwksUri, { timeout: HTTP_TIMEOUT_MS });
  } catch (err) {
    logger.warn('Auth0 JWKS fetch failed', { status: err.response?.status, error: err.message });
    throw new AppError('Could not reach Auth0 to verify your session. Please try again.', 502);
  }

  const keys = new Map();
  for (const jwk of response.data?.keys || []) {
    if (jwk.kid && jwk.kty === 'RSA') keys.set(jwk.kid, jwk);
  }
  cache = { uri: jwksUri, keys, fetchedAt: Date.now() };
  return keys;
}

async function signingKeyFor(header, jwksUri) {
  if (!header.kid) throw new Error('Token header has no key id (kid).');

  const isFresh = cache.uri === jwksUri && Date.now() - cache.fetchedAt < JWKS_TTL_MS;
  const jwk = isFresh ? cache.keys.get(header.kid) : null;
  if (jwk) return crypto.createPublicKey({ key: jwk, format: 'jwk' });

  // Unknown kid: either the cache is stale or Auth0 rotated the key. Refresh
  // once, then fail rather than looping on the same missing key.
  const keys = await refreshKeys(jwksUri);
  const rotated = keys.get(header.kid);
  if (!rotated) throw new Error(`No Auth0 signing key matches kid ${header.kid}.`);
  return crypto.createPublicKey({ key: rotated, format: 'jwk' });
}

/**
 * Verifies an Auth0 access token for this API and returns its claims.
 *
 * Rejects anything that is not an RS256 token issued by this tenant for this
 * API audience - in particular an ID token (audience = client id) and a token
 * minted for another application in the same tenant.
 */
async function verifyAccessToken(token) {
  const { enabled, issuer, audience, jwksUri } = auth0Config();
  if (!enabled) {
    throw new AppError('Auth0 sign-in is not configured on this server.', 503);
  }
  if (!token || typeof token !== 'string') {
    throw new AppError('An Auth0 access token is required.', 401);
  }

  try {
    return await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, done) => {
          signingKeyFor(header, jwksUri).then((key) => done(null, key), done);
        },
        { algorithms: ['RS256'], issuer, audience },
        (err, payload) => (err ? reject(err) : resolve(payload))
      );
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn('Auth0 token verification failed', { error: err.message });
    throw new AppError('Auth0 session is invalid or has expired. Please sign in again.', 401);
  }
}

/**
 * Email, name and email_verified are not part of an Auth0 access token for a
 * custom API unless a Post Login Action adds them. The userinfo endpoint is
 * authenticated by the access token itself, so it gives the profile without
 * requiring the tenant to be configured with custom claims.
 */
async function fetchUserInfo(accessToken) {
  const { enabled, userInfoUrl } = auth0Config();
  if (!enabled) {
    throw new AppError('Auth0 sign-in is not configured on this server.', 503);
  }

  let response;
  try {
    response = await axios.get(userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: HTTP_TIMEOUT_MS,
    });
  } catch (err) {
    const status = err.response?.status;
    logger.warn('Auth0 userinfo lookup failed', { status, error: err.message });
    if (status === 401 || status === 403) {
      throw new AppError('Auth0 rejected the session. Please sign in again.', 401);
    }
    throw new AppError('Could not confirm your profile with Auth0. Please try again.', 502);
  }

  const profile = response.data || {};
  if (!profile.sub) {
    throw new AppError('Auth0 did not return a user identifier.', 502);
  }
  return profile;
}

module.exports = { verifyAccessToken, fetchUserInfo };
