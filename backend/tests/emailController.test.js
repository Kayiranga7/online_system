jest.mock('../src/config/database', () => ({ pool: { query: jest.fn() } }));

const { pool } = require('../src/config/database');
const { listEmails } = require('../src/controllers/emailController');

function invoke(query = {}) {
  const req = { query };
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { promise: listEmails(req, res, next), res, next };
}

describe('Admin email delivery log', () => {
  beforeEach(() => jest.clearAllMocks());

  test('counts failures over the whole table even while the list is filtered to sent', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 11, to_email: 'ada@example.com', status: 'sent' }]])
      .mockResolvedValueOnce([[{ total: 8 }]])
      .mockResolvedValueOnce([[{ status: 'sent', count: 8 }, { status: 'failed', count: 3 }]]);

    const { promise, res, next } = invoke({ status: 'sent' });
    await promise;

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      summary: { queued: 0, sent: 8, failed: 3, total: 11 },
      pagination: { page: 1, limit: 20, total: 8 },
    }));
    // The list itself is still filtered - only the counts are not.
    expect(pool.query.mock.calls[0][0]).toContain('WHERE status = ?');
    expect(pool.query.mock.calls[2][0]).not.toContain('WHERE');
  });

  test('search narrows to recipient or subject, and template filters exactly', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const { promise } = invoke({ search: 'ada', template: 'password_reset' });
    await promise;

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('to_email LIKE ? OR subject LIKE ?');
    expect(sql).toContain('template = ?');
    expect(params).toEqual(['password_reset', '%ada%', '%ada%', 20, 0]);
  });

  test('never selects the payload column (live tokens live there)', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const { promise } = invoke();
    await promise;

    const sql = pool.query.mock.calls[0][0];
    expect(sql).not.toMatch(/payload/i);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
  });

  test('clamps an oversized limit and floors an out-of-range page', async () => {
    pool.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]]);

    const { promise, res } = invoke({ limit: '5000', page: '0' });
    await promise;

    expect(pool.query.mock.calls[0][1]).toEqual([100, 0]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      pagination: { page: 1, limit: 100, total: 0 },
    }));
  });

  test('an unknown status is rejected instead of silently listing everything', async () => {
    const { promise, res } = invoke({ status: 'bogus' });
    await promise;

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('bogus') }));
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('database errors are passed to the error handler', async () => {
    const failure = new Error('connection lost');
    pool.query.mockRejectedValueOnce(failure);

    const { promise, next } = invoke();
    await promise;

    expect(next).toHaveBeenCalledWith(failure);
  });
});
