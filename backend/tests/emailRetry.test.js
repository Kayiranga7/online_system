jest.mock('../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/services/auditService', () => ({ recordAudit: jest.fn() }));

const { pool } = require('../src/config/database');
const { recordAudit } = require('../src/services/auditService');

// The transport is stubbed so no provider call is ever made.
const fetchMock = jest.fn();
global.fetch = fetchMock;

const { classifyRow, retryQueuedEmails } = require('../src/services/emailRetryService');
const { retryFailed, retryRow } = require('../src/controllers/emailController');

const VERIFY_TOKEN = 'a'.repeat(64);
const verifyRow = (over = {}) => ({
  id: 9,
  to_email: 'buyer@imizi.rw',
  template: 'verify_email',
  status: 'failed',
  payload: JSON.stringify({ name: 'Buyer', link: `http://localhost:5173/verify-email?token=${VERIFY_TOKEN}` }),
  ...over,
});

function okFetch(id = 'msg_1') {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id }) });
}

function response() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

const withProvider = () => {
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = 're_test';
  process.env.EMAIL_FROM = 'IMIZI <no-reply@imizi.rw>';
  delete process.env.SMTP_HOST;
};
const withoutProvider = () => {
  process.env.EMAIL_PROVIDER = 'resend';
  process.env.RESEND_API_KEY = '';
  delete process.env.SMTP_HOST;
};

// resetAllMocks (not clearAllMocks) - the latter leaves unused
// mockResolvedValueOnce entries queued up and they leak into the next test.
describe('Retry policy for queued email', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    withProvider();
  });

  test('a verification link that is still live in the users table is retryable', async () => {
    pool.query.mockResolvedValueOnce([[{ user_email: 'buyer@imizi.rw' }]]);
    const verdict = await classifyRow(verifyRow());

    expect(verdict.retryable).toBe(true);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('email_verification_token = ?');
    expect(sql).toContain('email_verification_expires > NOW()');
    expect(params).toEqual([VERIFY_TOKEN]);
  });

  test('an expired or already-used link is skipped rather than re-sent', async () => {
    pool.query.mockResolvedValueOnce([[]]); // no live token row
    const verdict = await classifyRow(verifyRow());

    expect(verdict).toMatchObject({ retryable: false, code: 'link_expired_or_used' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a reset link that now belongs to another address is skipped', async () => {
    pool.query.mockResolvedValueOnce([[{ user_email: 'someone.else@imizi.rw' }]]);
    const verdict = await classifyRow(verifyRow({ template: 'password_reset', payload: JSON.stringify({ link: 'http://x/reset-password?token=t' }) }));

    expect(verdict).toMatchObject({ retryable: false, code: 'link_recipient_changed' });
  });

  test('templates without a link are always retryable', async () => {
    const verdict = await classifyRow({ id: 3, to_email: 'buyer@imizi.rw', template: 'order_confirmation', payload: JSON.stringify({ name: 'B', orderNumber: 'ORD-1', total: 100 }) });

    expect(verdict.retryable).toBe(true);
    expect(pool.query).not.toHaveBeenCalled(); // no token lookup needed
  });

  test('an unreadable payload or unknown template is skipped, never thrown', async () => {
    expect(await classifyRow({ id: 1, to_email: 'x@y.z', template: 'verify_email', payload: '{not json' })).toMatchObject({ code: 'payload_unusable' });
    expect(await classifyRow({ id: 2, to_email: 'x@y.z', template: 'removed_template', payload: '{}' })).toMatchObject({ code: 'unknown_template' });
    expect(await classifyRow({ id: 4, to_email: 'x@y.z', template: 'verify_email', payload: JSON.stringify({ name: 'B' }) })).toMatchObject({ code: 'no_link_token' });
  });
});

describe('retryQueuedEmails', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    withProvider();
  });

  test('re-sends eligible rows and reports skipped ones with a reason', async () => {
    pool.query
      .mockResolvedValueOnce([[verifyRow({ id: 9 }), verifyRow({ id: 8, template: 'order_confirmation', payload: JSON.stringify({ orderNumber: 'ORD-1' }) })]]) // candidates
      .mockResolvedValueOnce([[]]) // id 9: token dead
      .mockResolvedValueOnce([{}]); // id 8: UPDATE after a successful send
    okFetch('msg_8');

    const report = await retryQueuedEmails({});

    expect(report).toMatchObject({ candidates: 2, eligible: 1, sent: 1, failed: 0 });
    expect(report.skipped).toEqual([expect.objectContaining({ id: 9, code: 'link_expired_or_used' })]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const update = pool.query.mock.calls.find(([sql]) => /SET status = 'sent'/.test(sql));
    expect(update[1]).toEqual([8]);
  });

  test('a dry run classifies everything but sends nothing and updates no rows', async () => {
    pool.query
      .mockResolvedValueOnce([[verifyRow({ id: 8, template: 'order_confirmation', payload: JSON.stringify({ orderNumber: 'ORD-1' }) })]])
      .mockResolvedValueOnce([[]]);

    const report = await retryQueuedEmails({ dryRun: true });

    expect(report).toMatchObject({ dryRun: true, candidates: 1, eligible: 1, sent: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pool.query.mock.calls.some(([sql]) => /SET status/.test(sql))).toBe(false);
  });

  test('a still-failing provider is recorded on the row, keeping attempts as failure count', async () => {
    pool.query
      .mockResolvedValueOnce([[verifyRow({ id: 6, template: 'order_confirmation', payload: JSON.stringify({ orderNumber: 'ORD-2' }) })]])
      .mockResolvedValueOnce([{}]);
    fetchMock.mockResolvedValue({ ok: false, status: 422, statusText: 'Unprocessable', json: async () => ({ message: 'Domain not verified' }) });

    const report = await retryQueuedEmails({});

    expect(report).toMatchObject({ sent: 0, failed: 1 });
    expect(report.errors[0].error).toContain('Resend API 422: Domain not verified');
    const update = pool.query.mock.calls.find(([sql]) => /SET status = 'failed'/.test(sql));
    expect(update[0]).toContain('attempts = attempts + 1');
    expect(update[1]).toEqual(['Resend API 422: Domain not verified', 6]);
  });

  test('refuses to send with no provider configured, so rows are never falsely marked sent', async () => {
    withoutProvider();
    await expect(retryQueuedEmails({})).rejects.toMatchObject({ statusCode: 503 });
    expect(pool.query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a dry run still plans without a provider, and says the provider is missing', async () => {
    withoutProvider();
    pool.query.mockResolvedValueOnce([[]]);

    const report = await retryQueuedEmails({ dryRun: true });

    expect(report).toMatchObject({ dryRun: true, providerReady: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('scopes to the requested ids and caps the batch', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    await retryQueuedEmails({ ids: [8, 9], limit: 500 });

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('id IN (?, ?)');
    expect(params).toEqual(['failed', 'queued', 8, 9, 50]); // limit clamped to MAX_LIMIT
  });
});

describe('Admin retry endpoints', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    withProvider();
  });

  test('bulk retry reports the plan and audits a real run, but not a dry run', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    const dryRes = response();
    await retryFailed({ body: { dryRun: true }, user: { id: 1 } }, dryRes, jest.fn());
    expect(dryRes.json).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(recordAudit).not.toHaveBeenCalled();

    pool.query.mockResolvedValueOnce([[]]);
    const applyRes = response();
    await retryFailed({ body: {}, user: { id: 1 } }, applyRes, jest.fn());
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAILS_RETRIED', userId: 1 }));
  });

  test('a single retry refuses a row that already went out', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 5, to_email: 'a@b.c', template: 'verify_email', status: 'sent', payload: '{}' }]]);
    const next = jest.fn();

    await retryRow({ params: { id: '5' }, user: { id: 1 } }, response(), next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a single retry reports a dead link as a conflict, with a translatable code', async () => {
    pool.query
      .mockResolvedValueOnce([[verifyRow({ id: 9 })]])
      .mockResolvedValueOnce([[]]); // token dead
    const res = response();
    const next = jest.fn();

    await retryRow({ params: { id: '9' }, user: { id: 1 } }, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409, details: { code: 'link_expired_or_used' } }));
  });

  test('a single retry sends, updates the row and returns the subject', async () => {
    pool.query
      .mockResolvedValueOnce([[verifyRow({ id: 8, template: 'order_confirmation', payload: JSON.stringify({ name: 'B', orderNumber: 'ORD-2418', total: 500 }) })]])
      .mockResolvedValueOnce([{}]); // UPDATE ... status = 'sent'
    okFetch('msg_8');

    const res = response();
    await retryRow({ params: { id: '8' }, user: { id: 1 } }, res, jest.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ id: 8, status: 'sent', subject: 'Order ORD-2418 confirmed' });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_RETRIED', entityId: 8, userId: 1 }));
  });

  test('a missing row is a 404 and a provider failure is a 502', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    const missing = jest.fn();
    await retryRow({ params: { id: '404' }, user: { id: 1 } }, response(), missing);
    expect(missing).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));

    pool.query
      .mockResolvedValueOnce([[verifyRow({ id: 7, template: 'order_confirmation', payload: JSON.stringify({ orderNumber: 'ORD-3' }) })]])
      .mockResolvedValueOnce([{}]);
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({ message: 'boom' }) });
    const providerFail = jest.fn();
    await retryRow({ params: { id: '7' }, user: { id: 1 } }, response(), providerFail);
    expect(providerFail).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 502 }));
  });
});
