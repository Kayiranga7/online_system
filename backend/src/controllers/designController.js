const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');

async function listDesigns(req, res, next) {
  try {
    const { search, categoryId, style, minPrice, maxPrice, page = 1, limit = 12 } = req.query;
    const conditions = ['d.is_active = TRUE'];
    const params = [];

    if (search) {
      // Per-word substring match, words ANDed together (see listPlants in
      // plantController for rationale).
      const words = String(search).trim().split(/\s+/).filter(Boolean);
      if (words.length) {
        conditions.push('(' + words.map(() => '(d.name LIKE ? OR d.description LIKE ?)').join(' AND ') + ')');
        for (const w of words) {
          const like = `%${w.replace(/[\\%_]/g, '\\$&')}%`;
          params.push(like, like);
        }
      }
    }
    if (categoryId) { conditions.push('d.category_id = ?'); params.push(categoryId); }
    if (style) { conditions.push('d.style = ?'); params.push(style); }
    if (minPrice) { conditions.push('d.price >= ?'); params.push(minPrice); }
    if (maxPrice) { conditions.push('d.price <= ?'); params.push(maxPrice); }

    const offset = (Number(page) - 1) * Number(limit);
    const [rows] = await pool.query(
      `SELECT d.*, (SELECT image_url FROM design_images WHERE design_id = d.id AND is_primary = TRUE LIMIT 1) AS primary_image
       FROM designs d WHERE ${conditions.join(' AND ')} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM designs d WHERE ${conditions.join(' AND ')}`, params);

    res.json({ designs: rows, pagination: { page: Number(page), limit: Number(limit), total } });
  } catch (err) {
    next(err);
  }
}

async function getDesign(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM designs WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new AppError('Design not found.', 404);

    const [images] = await pool.query('SELECT * FROM design_images WHERE design_id = ? ORDER BY sort_order', [req.params.id]);
    const [plants] = await pool.query(
      `SELECT p.id, p.name, p.price, dp.quantity FROM design_plants dp JOIN plants p ON p.id = dp.plant_id WHERE dp.design_id = ?`,
      [req.params.id]
    );
    const [reviews] = await pool.query(
      `SELECT r.*, u.full_name FROM reviews r JOIN users u ON u.id = r.customer_id
       WHERE r.item_type = 'design' AND r.item_id = ? ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ design: rows[0], images, includedPlants: plants, reviews });
  } catch (err) {
    next(err);
  }
}

async function createDesign(req, res, next) {
  try {
    const { name, categoryId, description, price, style, minAreaSqm, estimatedInstallDays, plants } = req.body;
    const [result] = await pool.query(
      `INSERT INTO designs (name, category_id, description, price, style, min_area_sqm, estimated_install_days, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, categoryId, description, price, style || 'other', minAreaSqm, estimatedInstallDays, req.user.id]
    );

    if (Array.isArray(plants) && plants.length) {
      const values = plants.map((p) => [result.insertId, p.plantId, p.quantity || 1]);
      await pool.query('INSERT INTO design_plants (design_id, plant_id, quantity) VALUES ?', [values]);
    }

    await recordAudit({ userId: req.user.id, action: 'DESIGN_CREATED', entityType: 'design', entityId: result.insertId, req });
    res.status(201).json({ id: result.insertId, message: 'Design created successfully.' });
  } catch (err) {
    next(err);
  }
}

async function updatePlantDesign(req, res, next) {
  try {
    const fields = ['name', 'category_id', 'description', 'price', 'style', 'min_area_sqm', 'estimated_install_days', 'is_active'];
    const camelToSnake = {
      categoryId: 'category_id', minAreaSqm: 'min_area_sqm', estimatedInstallDays: 'estimated_install_days', isActive: 'is_active',
    };
    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(req.body)) {
      const column = camelToSnake[key] || key;
      if (fields.includes(column)) {
        updates.push(`${column} = ?`);
        params.push(value);
      }
    }
    if (!updates.length) throw new AppError('No valid fields to update.', 400);

    await pool.query(`UPDATE designs SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    await recordAudit({ userId: req.user.id, action: 'DESIGN_UPDATED', entityType: 'design', entityId: req.params.id, req });
    res.json({ message: 'Design updated successfully.' });
  } catch (err) {
    next(err);
  }
}

async function deleteDesign(req, res, next) {
  try {
    await pool.query('UPDATE designs SET is_active = FALSE WHERE id = ?', [req.params.id]);
    await recordAudit({ userId: req.user.id, action: 'DESIGN_DEACTIVATED', entityType: 'design', entityId: req.params.id, req });
    res.json({ message: 'Design removed from catalog.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/designs/:id/images - Admin only: attach an image and/or AR model
// ---------------------------------------------------------------------
async function addDesignImage(req, res, next) {
  try {
    const { imageUrl, arModelUrl, isPrimary } = req.body;
    if (!imageUrl && !arModelUrl) throw new AppError('Provide an imageUrl or arModelUrl.', 400);

    if (isPrimary) {
      await pool.query('UPDATE design_images SET is_primary = FALSE WHERE design_id = ?', [req.params.id]);
    }

    const [result] = await pool.query(
      `INSERT INTO design_images (design_id, image_url, ar_model_url, is_primary) VALUES (?, ?, ?, ?)`,
      [req.params.id, imageUrl || `/placeholder/${req.params.id}.jpg`, arModelUrl || null, !!isPrimary]
    );

    await recordAudit({ userId: req.user.id, action: 'DESIGN_IMAGE_ADDED', entityType: 'design', entityId: req.params.id, req });
    res.status(201).json({ id: result.insertId, message: 'Media attached to design.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listDesigns, getDesign, createDesign, updatePlantDesign, deleteDesign, addDesignImage };
