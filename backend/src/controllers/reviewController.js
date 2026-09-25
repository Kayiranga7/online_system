const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

async function recalculateRating(itemType, itemId) {
  const [[agg]] = await pool.query(
    'SELECT AVG(rating) AS avgRating, COUNT(*) AS cnt FROM reviews WHERE item_type = ? AND item_id = ?',
    [itemType, itemId]
  );
  const table = itemType === 'plant' ? 'plants' : 'designs';
  await pool.query(`UPDATE ${table} SET average_rating = ?, review_count = ? WHERE id = ?`, [
    Number(agg.avgRating || 0).toFixed(2),
    agg.cnt,
    itemId,
  ]);
}

async function createReview(req, res, next) {
  try {
    const { itemType, itemId, orderId, rating, comment } = req.body;
    if (!['plant', 'design'].includes(itemType)) throw new AppError('Invalid item type.', 400);
    if (rating < 1 || rating > 5) throw new AppError('Rating must be between 1 and 5.', 400);

    let isVerified = false;
    if (orderId) {
      const [orderItems] = await pool.query(
        `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.order_id = ? AND oi.item_type = ? AND oi.item_id = ? AND o.customer_id = ?
           AND o.status IN ('delivered','installed','completed')`,
        [orderId, itemType, itemId, req.user.id]
      );
      isVerified = orderItems.length > 0;
    }

    await pool.query(
      `INSERT INTO reviews (customer_id, item_type, item_id, order_id, rating, comment, is_verified_purchase)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, itemType, itemId, orderId || null, rating, comment || null, isVerified]
    );

    await recalculateRating(itemType, itemId);
    res.status(201).json({ message: 'Review submitted.', isVerifiedPurchase: isVerified });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return next(new AppError('You have already reviewed this item for this order.', 409));
    }
    next(err);
  }
}

async function deleteReview(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM reviews WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new AppError('Review not found.', 404);
    const review = rows[0];

    if (req.user.role === 'customer' && review.customer_id !== req.user.id) {
      throw new AppError('You can only delete your own reviews.', 403);
    }

    await pool.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);
    await recalculateRating(review.item_type, review.item_id);
    res.json({ message: 'Review deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createReview, deleteReview };
