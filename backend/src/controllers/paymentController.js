const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { notify, broadcastToRole } = require('../services/notificationService');
const momoService = require('../services/momoService');
const logger = require('../config/logger');

// ---------------------------------------------------------------------
// POST /api/payments/momo/pay
// Initiates a real MTN MoMo Request-to-Pay (sandbox or production).
// The customer receives a USSD prompt on their phone; the frontend then
// polls /api/payments/momo/status/:referenceId until SUCCESSFUL/FAILED.
// ---------------------------------------------------------------------
async function payWithMomo(req, res, next) {
  try {
    const { orderId, phoneNumber } = req.body;
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [orderId, req.user.id]);
    if (!rows.length) throw new AppError('Order not found.', 404);
    const order = rows[0];
    if (order.status !== 'pending_payment') throw new AppError('Order already paid or not payable.', 400);

    if (!process.env.MTN_MOMO_SUBSCRIPTION_KEY || process.env.MTN_MOMO_SUBSCRIPTION_KEY === 'mock_key') {
      // Never turn missing production payment credentials into a successful charge.
      const simulationEnvironment = ['development', 'test'].includes(process.env.NODE_ENV);
      if (!simulationEnvironment || process.env.PAYMENTS_SIMULATION_ENABLED !== 'true') {
        throw new AppError('MTN MoMo is not configured.', 503);
      }
      // Local simulations must be explicitly enabled in a non-production environment.
      const mockId = `SIMULATED-MOMO-${Date.now()}`;
      await pool.query(
        `INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, status, raw_response)
         VALUES (?, 'mtn_mobile_money', ?, ?, ?, 'succeeded', ?)`,
        [orderId, mockId, order.total_amount, order.currency, JSON.stringify({ simulated: true, phoneNumber })]
      );
      await pool.query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [orderId]);
      await recordAudit({ userId: req.user.id, action: 'PAYMENT_MOMO_SIMULATED', entityType: 'order', entityId: orderId, req });
      return res.json({ simulated: true, message: 'MTN MoMo credentials not configured - payment simulated successfully.', provider: 'mtn_mobile_money' });
    }

    const { referenceId } = await momoService.requestToPay({
      amount: order.total_amount,
      currency: order.currency || 'RWF',
      phoneNumber,
      orderNumber: order.order_number,
    });

    await pool.query(
      `INSERT INTO payments (order_id, provider, provider_payment_id, amount, currency, status, raw_response)
       VALUES (?, 'mtn_mobile_money', ?, ?, ?, 'pending', ?)`,
      [orderId, referenceId, order.total_amount, order.currency, JSON.stringify({ phoneNumber })]
    );

    res.json({ simulated: false, referenceId, message: 'Payment request sent. Approve it on your phone, then check status.' });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    logger.error('MTN MoMo request-to-pay failed', { error: err.response?.data || err.message });
    next(new AppError('Could not initiate MTN Mobile Money payment.', 502));
  }
}

// ---------------------------------------------------------------------
// GET /api/payments/momo/status/:referenceId - poll a pending MoMo payment
// ---------------------------------------------------------------------
async function getMomoStatus(req, res, next) {
  try {
    const { referenceId } = req.params;
    const [rows] = await pool.query(
      `SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE p.provider_payment_id = ? AND o.customer_id = ?`,
      [referenceId, req.user.id]
    );
    if (!rows.length) throw new AppError('Payment not found.', 404);
    const payment = rows[0];

    if (referenceId.startsWith('SIMULATED-')) {
      return res.json({ status: 'SUCCESSFUL', simulated: true });
    }

    const result = await momoService.getTransactionStatus(referenceId);
    const statusMap = { SUCCESSFUL: 'succeeded', FAILED: 'failed', PENDING: 'pending' };
    const newStatus = statusMap[result.status] || 'pending';

    await pool.query(`UPDATE payments SET status = ?, raw_response = ? WHERE provider_payment_id = ?`, [
      newStatus, JSON.stringify(result), referenceId,
    ]);

    if (newStatus === 'succeeded') {
      await pool.query(`UPDATE orders SET status = 'paid' WHERE id = ?`, [payment.order_id]);
      const [[order]] = await pool.query('SELECT customer_id, order_number, total_amount FROM orders WHERE id = ?', [payment.order_id]);
      const [[customer]] = await pool.query('SELECT email, full_name FROM users WHERE id = ?', [order.customer_id]);

      await notify({
        userId: order.customer_id,
        category: 'payment',
        title: 'Payment received',
        message: `Payment for order ${order.order_number} was successful via MTN Mobile Money.`,
        channel: 'both',
        email: {
          to: customer.email,
          template: 'order_confirmation',
          payload: { name: customer.full_name, orderNumber: order.order_number, total: order.total_amount },
        },
      });
      broadcastToRole('manager', 'new_paid_order', { orderId: payment.order_id, orderNumber: order.order_number });
    }

    res.json({ status: result.status });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    logger.error('MTN MoMo status check failed', { error: err.response?.data || err.message });
    next(new AppError('Could not check payment status.', 502));
  }
}

module.exports = {
  payWithMomo,
  getMomoStatus,
};
