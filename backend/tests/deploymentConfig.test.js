const { allowedOrigins, corsOrigin } = require('../src/config/cors');
const { refreshCookieOptions } = require('../src/config/session');

const allows = (origin) =>
  new Promise((resolve) => corsOrigin(origin, (err, ok) => resolve({ err, ok })));

describe('CORS origins', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('accepts a comma-separated list and strips trailing slashes', () => {
    process.env.CLIENT_URL = 'https://imizi.vercel.app/, https://imizi.rw';
    expect(allowedOrigins()).toEqual(['https://imizi.vercel.app', 'https://imizi.rw']);
  });

  it('falls back to the local dev origin when unset', () => {
    delete process.env.CLIENT_URL;
    expect(allowedOrigins()).toEqual(['http://localhost:5173']);
  });

  it('allows a listed origin and rejects an unlisted one', async () => {
    process.env.CLIENT_URL = 'https://imizi.rw';
    await expect(allows('https://imizi.rw')).resolves.toMatchObject({ ok: true });
    await expect(allows('https://imizi.vercel.app')).resolves.toMatchObject({ ok: false });
  });

  it('matches despite a trailing slash on the request origin', async () => {
    process.env.CLIENT_URL = 'https://imizi.rw';
    await expect(allows('https://imizi.rw/')).resolves.toMatchObject({ ok: true });
  });

  it('allows requests without an Origin header (curl, server-to-server)', async () => {
    process.env.CLIENT_URL = 'https://imizi.rw';
    await expect(allows(undefined)).resolves.toMatchObject({ ok: true });
  });
});

describe('refresh cookie attributes', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('is httpOnly and scoped to the auth endpoints', () => {
    const opts = refreshCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe('/api/auth');
  });

  it('is secure by default in production but not in development', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECURE;
    expect(refreshCookieOptions().secure).toBe(true);

    process.env.NODE_ENV = 'development';
    expect(refreshCookieOptions().secure).toBe(false);
  });

  it('defaults to lax, which survives arriving from an email link', () => {
    delete process.env.COOKIE_SAMESITE;
    expect(refreshCookieOptions().sameSite).toBe('lax');
  });

  it('can be set to none for a cross-site deployment', () => {
    process.env.COOKIE_SAMESITE = 'None';
    process.env.COOKIE_SECURE = 'true';
    const opts = refreshCookieOptions();
    expect(opts.sameSite).toBe('none');
    expect(opts.secure).toBe(true);
  });

  it('honours an explicit COOKIE_SECURE=false (plain-HTTP hosting)', () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SECURE = 'false';
    expect(refreshCookieOptions().secure).toBe(false);
  });
});
