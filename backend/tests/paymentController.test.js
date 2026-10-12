jest.mock('../src/config/database', () => ({ pool: { query: jest.fn() } }));
jest.mock('../src/services/auditService', () => ({ recordAudit: jest.fn() }));
jest.mock('../src/services/notificationService', () => ({ notify: jest.fn(), broadcastToRole: jest.fn() }));
jest.mock('../src/services/momoService', () => ({ requestToPay: jest.fn(), getTransactionStatus: jest.fn() }));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), info: jest.fn() }));

const { pool } = require('../src/config/database');
const { payWithMomo } = require('../src/controllers/paymentController');

function invokePayment() {
  const req = { body: { orderId: 7, phoneNumber: '+250788123456' }, user: { id: 3 }, ip: '127.0.0.1' };
  const res = { json: jest.fn() };
  const next = jest.fn();
  return { promise: payWithMomo(req, res, next), res, next };
}

describe('MoMo payment simulation safety', () => {
  const originalEnv = { NODE_ENV: process.env.NODE_ENV, PAYMENTS_SIMULATION_ENABLED: process.env.PAYMENTS_SIMULATION_ENABLED, MTN_MOMO_SUBSCRIPTION_KEY: process.env.MTN_MOMO_SUBSCRIPTION_KEY };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MTN_MOMO_SUBSCRIPTION_KEY;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('production rejects missing provider credentials even when simulation is enabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENTS_SIMULATION_ENABLED = 'true';
    pool.query.mockResolvedValueOnce([[{ id: 7, status: 'pending_payment', total_amount: 100, currency: 'RWF' }]]);

    const { promise, next, res } = invokePayment();
    await promise;

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    expect(res.json).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('non-production rejects missing credentials unless simulation is explicitly enabled', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENTS_SIMULATION_ENABLED = 'false';
    pool.query.mockResolvedValueOnce([[{ id: 7, status: 'pending_payment', total_amount: 100, currency: 'RWF' }]]);

    const { promise, next, res } = invokePayment();
    await promise;

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    expect(res.json).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('staging-like environments never simulate payments', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.PAYMENTS_SIMULATION_ENABLED = 'true';
    pool.query.mockResolvedValueOnce([[{ id: 7, status: 'pending_payment', total_amount: 100, currency: 'RWF' }]]);

    const { promise, next, res } = invokePayment();
    await promise;

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    expect(res.json).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('explicit non-production simulation marks the payment and order paid', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PAYMENTS_SIMULATION_ENABLED = 'true';
    pool.query.mockResolvedValueOnce([[{ id: 7, status: 'pending_payment', total_amount: 100, currency: 'RWF' }]]);

    const { promise, next, res } = invokePayment();
    await promise;

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ simulated: true }));
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[1][0]).toContain("'succeeded'");
    expect(pool.query.mock.calls[2][0]).toContain("status = 'paid'");
  });
});
