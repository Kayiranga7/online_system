const mockVerifyIdToken = jest.fn();

jest.mock('../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/auditService', () => ({ recordAudit: jest.fn() }));
jest.mock('../src/services/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('google-auth-library', () => ({
  // authController builds one client at import time; every call goes through it.
  OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const { pool } = require('../src/config/database');
const { googleLogin } = require('../src/controllers/authController');

const GOOGLE_ID = '1101234567890';

function response() {
  const res = { json: jest.fn(), cookie: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function request(body = {}) {
  return { body: { idToken: 'google-id-token', ...body }, ip: '127.0.0.1' };
}

function existingUser(overrides = {}) {
  return {
    id: 11,
    full_name: 'Test Gardener',
    email: 'gardener@example.com',
    role: 'customer',
    institution_type: 'personal',
    district_id: 2,
    google_id: null,
    status: 'active',
    email_verified: 1,
    ...overrides,
  };
}

function tokenPayload(overrides = {}) {
  return {
    sub: GOOGLE_ID,
    email: 'gardener@example.com',
    email_verified: true,
    name: 'Test Gardener',
    picture: 'https://lh3.googleusercontent.com/a/pic.png',
    ...overrides,
  };
}

describe('POST /api/auth/google', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client';
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => tokenPayload() });
  });

  test('verifies the token against the configured Google client id', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = response();
    await googleLogin(request(), res, jest.fn());

    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: 'test-google-client',
    });
  });

  test('asks a first-time user for district and account type without creating a row', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const res = response();
    const next = jest.fn();
    await googleLogin(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresProfileCompletion: true,
        profile: expect.objectContaining({ email: 'gardener@example.com' }),
      })
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO users'))).toBe(false);
  });

  test('creates a passwordless customer when the profile is completed', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // lookup by google_id / email
      .mockResolvedValueOnce([{ insertId: 23 }]) // insert
      .mockResolvedValueOnce([[existingUser({ id: 23, google_id: GOOGLE_ID })]]) // re-read
      .mockResolvedValueOnce([{}]); // refresh token hash

    const res = response();
    const next = jest.fn();
    await googleLogin(request({ district: 2, institutionType: 'business' }), res, next);

    expect(next).not.toHaveBeenCalled();
    const insert = pool.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO users'));
    expect(insert[0]).toContain('google_id');
    expect(insert[0]).toContain('NULL');
    expect(insert[1]).toEqual([
      'Test Gardener',
      'gardener@example.com',
      'business',
      2,
      GOOGLE_ID,
      'https://lh3.googleusercontent.com/a/pic.png',
      true,
    ]);
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: expect.any(String),
        user: expect.objectContaining({ id: 23, email: 'gardener@example.com' }),
      })
    );
  });

  test('links an existing email/password account to the Google subject', async () => {
    pool.query
      .mockResolvedValueOnce([[existingUser()]]) // lookup by email
      .mockResolvedValueOnce([{}]) // link google_id
      .mockResolvedValueOnce([{}]); // refresh token hash

    const res = response();
    const next = jest.fn();
    await googleLogin(request(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(pool.query.mock.calls[1][0]).toContain('SET google_id = ?');
    expect(pool.query.mock.calls[1][1]).toEqual([GOOGLE_ID, 11]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accessToken: expect.any(String) }));
  });

  test('refuses to link an existing account when Google has not verified the email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => tokenPayload({ email_verified: false }),
    });
    pool.query.mockResolvedValueOnce([[existingUser()]]);

    const res = response();
    const next = jest.fn();
    await googleLogin(request(), res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'Google has not verified this email address, so it cannot be linked to your account.',
      })
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('does not create an account from an unverified Google address', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => tokenPayload({ email_verified: false }),
    });
    pool.query.mockResolvedValueOnce([[]]);

    const res = response();
    const next = jest.fn();
    await googleLogin(request({ district: 2, institutionType: 'personal' }), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO users'))).toBe(false);
  });

  test('surfaces the unverified-email refusal instead of a generic failure', async () => {
    pool.query.mockResolvedValueOnce([[existingUser({ email_verified: 0 })]]);

    const res = response();
    const next = jest.fn();
    await googleLogin(request(), res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'Please verify your email address before logging in.',
      })
    );
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('refuses a suspended account', async () => {
    pool.query.mockResolvedValueOnce([[existingUser({ google_id: GOOGLE_ID, status: 'suspended' })]]);

    const res = response();
    const next = jest.fn();
    await googleLogin(request(), res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  test('turns a token that fails verification into a 401', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Wrong recipient'));

    const res = response();
    const next = jest.fn();
    await googleLogin(request(), res, next);

    expect(pool.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
