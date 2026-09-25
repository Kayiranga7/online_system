const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

async function getOrCreateCart(userId) {
  const [rows] = await pool.query('SELECT id FROM carts WHERE user_id = ?', [userId]);
  if (rows.length) return rows[0].id;
  const [result] = await pool.query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
  return result.insertId;
}

async function hydrateCartItems(cartId) {
  const [items] = await pool.query('SELECT * FROM cart_items WHERE cart_id = ?', [cartId]);
  const plantIds = items.filter((i) => i.item_type === 'plant').map((i) => i.item_id);
  const designIds = items.filter((i) => i.item_type === 'design').map((i) => i.item_id);

  const plants = plantIds.length
    ? (await pool.query('SELECT id, name, price, stock_quantity FROM plants WHERE id IN (?)', [plantIds]))[0]
    : [];
  const designs = designIds.length
    ? (await pool.query('SELECT id, name, price FROM designs WHERE id IN (?)', [designIds]))[0]
    : [];

  return items.map((item) => {
    const source = item.item_type === 'plant' ? plants.find((p) => p.id === item.item_id) : designs.find((d) => d.id === item.item_id);
    return {
      id: item.id,
      itemType: item.item_type,
      itemId: item.item_id,
      quantity: item.quantity,
      name: source?.name || '(item no longer available)',
      unitPrice: source?.price || 0,
      lineTotal: (source?.price || 0) * item.quantity,
      stockQuantity: source?.stock_quantity,
    };
  });
}

async function getCart(req, res, next) {
  try {
    const cartId = await getOrCreateCart(req.user.id);
    const items = await hydrateCartItems(cartId);
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    res.json({ items, subtotal });
  } catch (err) {
    next(err);
  }
}

async function addToCart(req, res, next) {
  try {
    const { itemType, itemId, quantity = 1 } = req.body;
    if (!['plant', 'design'].includes(itemType)) throw new AppError('Invalid item type.', 400);

    const table = itemType === 'plant' ? 'plants' : 'designs';
    const [exists] = await pool.query(`SELECT id FROM ${table} WHERE id = ? AND is_active = TRUE`, [itemId]);
    if (!exists.length) throw new AppError(`${itemType} not found.`, 404);

    const cartId = await getOrCreateCart(req.user.id);
    await pool.query(
      `INSERT INTO cart_items (cart_id, item_type, item_id, quantity) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
      [cartId, itemType, itemId, quantity, quantity]
    );

    const items = await hydrateCartItems(cartId);
    res.status(201).json({ message: 'Added to cart.', items });
  } catch (err) {
    next(err);
  }
}

async function updateCartItem(req, res, next) {
  try {
    const { quantity } = req.body;
    if (quantity < 1) throw new AppError('Quantity must be at least 1.', 400);
    const cartId = await getOrCreateCart(req.user.id);
    await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?', [quantity, req.params.itemId, cartId]);
    res.json({ message: 'Cart updated.' });
  } catch (err) {
    next(err);
  }
}

async function removeCartItem(req, res, next) {
  try {
    const cartId = await getOrCreateCart(req.user.id);
    await pool.query('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [req.params.itemId, cartId]);
    res.json({ message: 'Item removed from cart.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCart, addToCart, updateCartItem, removeCartItem };
