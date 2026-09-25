const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');

async function getWishlist(req, res, next) {
  try {
    const [items] = await pool.query('SELECT * FROM wishlists WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    const plantIds = items.filter((i) => i.item_type === 'plant').map((i) => i.item_id);
    const designIds = items.filter((i) => i.item_type === 'design').map((i) => i.item_id);

    const plants = plantIds.length
      ? (await pool.query(
          `SELECT p.*, (SELECT image_url FROM plant_images WHERE plant_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_image
           FROM plants p WHERE id IN (?)`,
          [plantIds]
        ))[0]
      : [];
    const designs = designIds.length
      ? (await pool.query(
          `SELECT d.*, (SELECT image_url FROM design_images WHERE design_id = d.id AND is_primary = TRUE LIMIT 1) AS primary_image
           FROM designs d WHERE id IN (?)`,
          [designIds]
        ))[0]
      : [];

    res.json({
      items: items.map((i) => ({
        wishlistId: i.id,
        itemType: i.item_type,
        item: i.item_type === 'plant' ? plants.find((p) => p.id === i.item_id) : designs.find((d) => d.id === i.item_id),
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function addToWishlist(req, res, next) {
  try {
    const { itemType, itemId } = req.body;
    if (!['plant', 'design'].includes(itemType)) throw new AppError('Invalid item type.', 400);
    await pool.query(
      `INSERT INTO wishlists (user_id, item_type, item_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE created_at = created_at`,
      [req.user.id, itemType, itemId]
    );
    res.status(201).json({ message: 'Added to wishlist.' });
  } catch (err) {
    next(err);
  }
}

async function removeFromWishlist(req, res, next) {
  try {
    await pool.query('DELETE FROM wishlists WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Removed from wishlist.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
