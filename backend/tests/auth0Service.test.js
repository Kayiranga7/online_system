const crypto = require('crypto');
const jwt = require('jsonwebtoken');

jest.mock('axios');
const axios = require('axios');
const { verifyAccessToken, fetchUserInfo } = require('../src/services/auth0Service');

const ENV_KEYS = ['AUTH0_DOMAIN', 'AUTH0_API_AUDIENCE'];
const ISSUER = 'https://imizi.eu.auth0.com/';
const AUDIENCE = 'https://api.imizi.rw';
const TENANT = 'imizi.eu.auth0.com';

function tenantKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
  return { privateKey, jwk };
}

function token(privateKey, overrides = {}) {
  return jwt.sign({ sub: 'auth0|64f0c0ffee' }, privateKey, {
    algorithm: 'RS256',
    keyid: 'test-kid',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: '5m',
    ...overrides,
  });
}

describe('Auth0 token verification', () => {
  const original = {};
  for (const key of ENV_KEYS) original[key] = process.env[key];

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AUTH0_DOMAIN;
    delete process.env.AUTH0_API_AUDIENCE;
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  test('refuses to verify anything when the tenant is not configured', async () => {
    await expect(verifyAccessToken('anything')).rejects.toMatchObject({ statusCode: 503 });
    await expect(fetchUserInfo('anything')).rejects.toMatchObject({ statusCode: 503 });
  });

  test('rejects a malformed token instead of trusting its contents', async () => {
    process.env.AUTH0_DOMAIN = 'imizi.eu.auth0.com';
    process.env.AUTH0_API_AUDIENCE = 'https://api.imizi.rw';

    await expect(verifyAccessToken('not-a-jwt')).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining('sign in again'),
    });
  });

  test('accepts a token signed by the tenant key for this API audience', async () => {
    process.env.AUTH0_DOMAIN = TENANT;
    process.env.AUTH0_API_AUDIENCE = AUDIENCE;
    const { privateKey, jwk } = tenantKeys();
    axios.get.mockResolvedValue({ data: { keys: [jwk] } });

    await expect(verifyAccessToken(token(privateKey))).resolves.toMatchObject({ sub: 'auth0|64f0c0ffee' });
    expect(axios.get).toHaveBeenCalledWith(`https://${TENANT}/.well-known/jwks.json`, expect.any(Object));
  });

  test('rejects a token minted for a different audience', async () => {
    process.env.AUTH0_DOMAIN = TENANT;
    process.env.AUTH0_API_AUDIENCE = AUDIENCE;
    const { privateKey, jwk } = tenantKeys();
    axios.get.mockResolvedValue({ data: { keys: [jwk] } });

    await expect(verifyAccessToken(token(privateKey, { audience: 'https://someone-else.example' })))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  test('rejects a symmetric token signed with the API audience as a secret', async () => {
    process.env.AUTH0_DOMAIN = TENANT;
    process.env.AUTH0_API_AUDIENCE = AUDIENCE;

    // Algorithm-confusion attempt: a token the attacker could mint themselves if
    // the verifier accepted HS256 and treated the public key/identifier as the
    // HMAC secret. The kid is real, so only the algorithm allow-list can stop it.
    const { jwk } = tenantKeys();
    axios.get.mockResolvedValue({ data: { keys: [jwk] } });
    const forged = jwt.sign({ sub: 'auth0|attacker' }, AUDIENCE, {
      algorithm: 'HS256',
      keyid: 'test-kid',
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    await expect(verifyAccessToken(forged)).rejects.toMatchObject({ statusCode: 401 });
  });
});
