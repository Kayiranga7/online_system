const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { generateOrderNumber } = require('../utils/orderNumber');
const { recordAudit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

const CANCELLABLE_STATUSES = ['pending_payment', 'paid'];

// ---------------------------------------------------------------------
// POST /api/orders - place an order from the customer's cart
// ---------------------------------------------------------------------
async function createOrder(req, res, next) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { deliveryAddress, deliveryLatitude, deliveryLongitude, requiresInstallation, institutionId, notes } = req.body;

    const [[user]] = await conn.query('SELECT district_id, institution_type, kyc_status FROM users WHERE id = ?', [req.user.id]);
    if (!user.district_id) throw new AppError('Your account has no district set. Please update your profile.', 400);

    // Business customers must have approved KYC before placing orders
    if (user.institution_type === 'business' && user.kyc_status !== 'approved') {
      throw new AppError(
        user.kyc_status === 'none' || user.kyc_status === 'pending'
          ? 'Business accounts must complete KYC verification before placing orders. Please submit your documents.'
          : user.kyc_status === 'submitted'
          ? 'Your KYC documents are under review. You will be able to place orders once approved.'
          : 'Your KYC verification was rejected. Please resubmit your documents before placing orders.',
        403
      );
    }

    const [cartRows] = await conn.query('SELECT id FROM carts WHERE user_id = ?', [req.user.id]);
    if (!cartRows.length) throw new AppError('Your cart is empty.', 400);
    const cartId = cartRows[0].id;

    const [items] = await conn.query('SELECT * FROM cart_items WHERE cart_id = ?', [cartId]);
    if (!items.length) throw new AppError('Your cart is empty.', 400);

    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const table = item.item_type === 'plant' ? 'plants' : 'designs';
      const [[product]] = await conn.query(`SELECT * FROM ${table} WHERE id = ? AND is_active = TRUE FOR UPDATE`, [item.item_id]);
      if (!product) throw new AppError(`An item in your cart is no longer available.`, 400);

      if (item.item_type === 'plant') {
        if (product.stock_quantity < item.quantity) {
          throw new AppError(`Insufficient stock for "${product.name}". Only ${product.stock_quantity} left.`, 400);
        }
        await conn.query('UPDATE plants SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.item_id]);
      }

      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;
      lineItems.push({
        itemType: item.item_type,
        itemId: item.item_id,
        name: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal,
      });
    }

    const deliveryFee = requiresInstallation ? 25 : 10;
    const taxAmount = Math.round(subtotal * 0.18 * 100) / 100; // 18% VAT, Rwanda standard rate
    const totalAmount = subtotal + deliveryFee + taxAmount;

    const [orderResult] = await conn.query(
      `INSERT INTO orders (order_number, customer_id, district_id, institution_id, status, subtotal, tax_amount,
         delivery_fee, total_amount, delivery_address, delivery_latitude, delivery_longitude, requires_installation, notes)
       VALUES (?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'TEMP', req.user.id, user.district_id, institutionId || null, subtotal, taxAmount,
        deliveryFee, totalAmount, deliveryAddress, deliveryLatitude || null, deliveryLongitude || null,
        !!requiresInstallation, notes || null,
      ]
    );
    const orderId = orderResult.insertId;
    const orderNumber = generateOrderNumber(orderId);
    await conn.query('UPDATE orders SET order_number = ? WHERE id = ?', [orderNumber, orderId]);

    for (const li of lineItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, item_type, item_id, item_name_snapshot, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, li.itemType, li.itemId, li.name, li.unitPrice, li.quantity, li.lineTotal]
      );
    }

    await conn.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
    await conn.commit();

    await recordAudit({
      userId: req.user.id,
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: orderId,
      req,
      details: { orderNumber, totalAmount },
    });

    res.status(201).json({
      order: { id: orderId, orderNumber, subtotal, taxAmount, deliveryFee, totalAmount, status: 'pending_payment' },
      message: 'Order created. Proceed to payment to confirm.',
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------
// GET /api/orders - list orders (customer: own; manager: district; admin: all)
// ---------------------------------------------------------------------
async function listOrders(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];

    if (req.user.role === 'customer') {
      conditions.push('o.customer_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      conditions.push('o.district_id = ?');
      params.push(req.user.districtId);
    } // admin: no restriction

    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [rows] = await pool.query(
      `SELECT o.*, u.full_name AS customer_name, d.name AS district_name
       FROM orders o JOIN users u ON u.id = o.customer_id LEFT JOIN districts d ON d.id = o.district_id
       ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM orders o ${whereClause}`, params);

    res.json({ orders: rows, pagination: { page: Number(page), limit: Number(limit), total } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/orders/:id
// ---------------------------------------------------------------------
async function getOrder(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, u.full_name AS customer_name, u.email AS customer_email FROM orders o
       JOIN users u ON u.id = o.customer_id WHERE o.id = ?`,
      [req.params.id]
    );
    if (!rows.length) throw new AppError('Order not found.', 404);
    const order = rows[0];

    if (req.user.role === 'customer' && order.customer_id !== req.user.id) {
      throw new AppError('You do not have access to this order.', 403);
    }
    if (req.user.role === 'manager' && order.district_id !== req.user.districtId) {
      throw new AppError('You do not have access to this order.', 403);
    }

    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
    const [tracking] = await pool.query('SELECT * FROM delivery_tracking WHERE order_id = ? ORDER BY updated_at DESC', [req.params.id]);
    const [payments] = await pool.query('SELECT id, provider, amount, status, created_at FROM payments WHERE order_id = ?', [req.params.id]);

    res.json({ order, items, tracking, payments });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/orders/:id/cancel - customer self-cancellation (rule-limited)
// ---------------------------------------------------------------------
async function cancelOrder(req, res, next) {
  try {
    const { reason } = req.body;
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new AppError('Order not found.', 404);
    const order = rows[0];

    if (req.user.role === 'customer' && order.customer_id !== req.user.id) {
      throw new AppError('You do not have access to this order.', 403);
    }
    if (!CANCELLABLE_STATUSES.includes(order.status) && req.user.role === 'customer') {
      throw new AppError('This order can no longer be cancelled as it is already being processed.', 400);
    }

    // restock plant items if cancelling
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.id]);
    for (const item of items) {
      if (item.item_type === 'plant') {
        await pool.query('UPDATE plants SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.item_id]);
      }
    }

    await pool.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?`,
      [reason || null, req.params.id]
    );
    await recordAudit({ userId: req.user.id, action: 'ORDER_CANCELLED', entityType: 'order', entityId: req.params.id, req });

    await notify({
      userId: order.customer_id,
      category: 'order_update',
      title: 'Order cancelled',
      message: `Your order ${order.order_number} has been cancelled.`,
      relatedEntityType: 'order',
      relatedEntityId: order.id,
    });

    res.json({ message: 'Order cancelled successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// PATCH /api/orders/:id/status - Manager/Employee/Admin progress the order
// ---------------------------------------------------------------------
const VALID_TRANSITIONS = {
  paid: ['processing', 'cancelled'],
  processing: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['delivered', 'installed'],
  delivered: ['completed'],
  installed: ['completed'],
};

async function updateOrderStatus(req, res, next) {
  try {
    const { status, note } = req.body;
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new AppError('Order not found.', 404);
    const order = rows[0];

    if (req.user.role === 'manager' && order.district_id !== req.user.districtId) {
      throw new AppError('You can only manage orders in your district.', 403);
    }

    const allowedNext = VALID_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      throw new AppError(`Cannot transition order from "${order.status}" to "${status}".`, 400);
    }

    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

    // delivery_tracking has its own narrower ENUM (it logs physical fulfillment events,
    // not every order workflow state - e.g. 'processing'/'assigned' aren't physical events).
    // Only insert a tracking row when the new order status maps to one of those events.
    const trackingStatusMap = {
      in_progress: 'out_for_delivery',
      delivered: 'delivered',
      installed: 'installation_complete',
    };
    const trackingStatus = trackingStatusMap[status];
    if (trackingStatus) {
      await pool.query(
        `INSERT INTO delivery_tracking (order_id, status, assigned_employee_id, notes) VALUES (?, ?, ?, ?)`,
        [req.params.id, trackingStatus, req.user.role === 'employee' ? req.user.id : null, note || null]
      );
    }

    await recordAudit({
      userId: req.user.id,
      action: 'ORDER_STATUS_UPDATED',
      entityType: 'order',
      entityId: req.params.id,
      req,
      details: { status },
    });

    await notify({
      userId: order.customer_id,
      category: 'order_update',
      title: 'Order update',
      message: `Your order ${order.order_number} is now "${status.replace('_', ' ')}".`,
      relatedEntityType: 'order',
      relatedEntityId: order.id,
    });

    res.json({ message: 'Order status updated.', status });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, listOrders, getOrder, cancelOrder, updateOrderStatus };
