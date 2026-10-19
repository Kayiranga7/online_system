jest.mock('../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/auditService', () => ({ recordAudit: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('../src/services/auth0Service', () => ({
  verifyAccessToken: jest.fn(),
  fetchUserInfo: jest.fn(),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const { pool } = require('../src/config/database');
const { verifyAccessToken, fetchUserInfo } = require('../src/services/auth0Service');
const { auth0Login } = require('../src/controllers/authController');

const SUB = 'auth0|64f0c0ffee';

function response() {
  const res = { json: jest.fn(), cookie: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function request(body = {}) {
  return { body: { accessToken: 'auth0-access-token', ...body }, ip: '127.0.0.1' };
}

function existingUser(overrides = {}) {
  return {
    id: 5,
    full_name: 'Existing Customer',
    email: 'customer@example.com',
    role: 'customer',
    institution_type: 'personal',
    district_id: 1,
    status: 'active',
    email_verified: 1,
    two_factor_enabled: 0,
    ...overrides,
  };
}

describe('POST /api/auth/auth0', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    verifyAccessToken.mockResolvedValue({ sub: SUB });
    fetchUserInfo.mockResolvedValue({
      sub: SUB,
      email: 'Customer@Example.com',
      email_verified: true,
      name: 'Existing Customer',
    });
  });

  test('links a verified existing account and issues the app session', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // lookup by auth0_id
      .mockResolvedValueOnce([[existingUser()]]) // lookup by email
      .mockResolvedValueOnce([{}]) // link auth0_id
      .mockResolvedValueOnce([{}]) // last login
      .mockResolvedValueOnce([{}]); // refresh token hash

    const res = response();
    const next = jest.fn();
    await auth0Login(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(pool.query.mock.calls[2][0]).toContain('SET auth0_id = ?');
    expect(pool.query.mock.calls[2][1]).toEqual([SUB, 5]);
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: expect.any(String),
        user: expect.objectContaining({ id: 5, email: 'customer@example.com' }),
      })
    );
  });

  test('refuses to link an existing account when Auth0 has not verified the email', async () => {
    fetchUserInfo.mockResolvedValue({
      sub: SUB,
      email: 'customer@example.com',
      email_verified: false,
    });
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[existingUser()]]);

    const res = response();
    const next = jest.fn();
    await auth0Login(request(), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('requires district and institution type on first sign-in without creating a row', async () => {
    pool.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

    const res = response();
    const next = jest.fn();
    await auth0Login(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ requiresProfileCompletion: true })
    );
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO users'))).toBe(false);
  });

  test('creates a passwordless customer row when the profile is completed', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // lookup by auth0_id
      .mockResolvedValueOnce([[]]) // lookup by email
      .mockResolvedValueOnce([[{ id: 3 }]]) // district exists
      .mockResolvedValueOnce([{ insertId: 42 }]) // insert
      .mockResolvedValueOnce([[existingUser({ id: 42, district_id: 3 })]]) // re-read
      .mockResolvedValueOnce([{}]) // last login
      .mockResolvedValueOnce([{}]); // refresh token hash

    const res = response();
    const next = jest.fn();
    await auth0Login(request({ district: 3, institutionType: 'personal' }), res, next);

    expect(next).not.toHaveBeenCalled();
    const insert = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO users'));
    expect(insert[0]).toContain('auth0_id');
    expect(insert[0]).toContain('NULL');
    expect(insert[1]).toEqual(['Existing Customer', 'customer@example.com', 'personal', 3, SUB, null, true]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.objectContaining({ id: 42 }) }));
  });

  test('still requires the local 2FA code for an account that has it enabled', async () => {
    pool.query.mockResolvedValueOnce([[existingUser({ auth0_id: SUB, two_factor_enabled: 1, two_factor_secret: 'SECRET' })]]);

    const res = response();
    const next = jest.fn();
    await auth0Login(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requiresTwoFactor: true }));
    expect(res.cookie).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('honours the password lockout on an otherwise valid Auth0 login', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    pool.query.mockResolvedValueOnce([[existingUser({ auth0_id: SUB, locked_until: lockedUntil })]]);

    const res = response();
    const next = jest.fn();
    await auth0Login(request(), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 423 }));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('rejects a profile whose subject does not match the verified token', async () => {
    fetchUserInfo.mockResolvedValue({ sub: 'auth0|someone-else', email: 'x@example.com', email_verified: true });

    const res = response();
    const next = jest.fn();
    await auth0Login(request(), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(pool.query).not.toHaveBeenCalled();
  });
});
