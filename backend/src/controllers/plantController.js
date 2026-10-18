const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { stripPlaceholderImages } = require('../utils/media');

// ---------------------------------------------------------------------
// GET /api/plants - search & filter catalog
// ---------------------------------------------------------------------
async function listPlants(req, res, next) {
  try {
    const { search, categoryId, sunlight, water, minPrice, maxPrice, careDifficulty, page = 1, limit = 12, sort = 'newest' } = req.query;
    const conditions = ['p.is_active = TRUE'];
    const params = [];

    if (search) {
      // Per-word substring match, words ANDed together: "pal" finds "palm tree",
      // and multi-word queries narrow results instead of widening them (the
      // previous MATCH ... AGAINST in NATURAL LANGUAGE mode OR-matched whole
      // words, ignored prefixes and ignored words shorter than the token size).
      const words = String(search).trim().split(/\s+/).filter(Boolean);
      if (words.length) {
        conditions.push(
          '(' + words.map(() => '(p.name LIKE ? OR p.scientific_name LIKE ? OR p.description LIKE ?)').join(' AND ') + ')'
        );
        for (const w of words) {
          const like = `%${w.replace(/[\\%_]/g, '\\$&')}%`;
          params.push(like, like, like);
        }
      }
    }
    if (categoryId) {
      conditions.push('p.category_id = ?');
      params.push(categoryId);
    }
    if (sunlight) {
      conditions.push('p.sunlight_needs = ?');
      params.push(sunlight);
    }
    if (water) {
      conditions.push('p.water_needs = ?');
      params.push(water);
    }
    if (careDifficulty) {
      conditions.push('p.care_difficulty = ?');
      params.push(careDifficulty);
    }
    if (minPrice) {
      conditions.push('p.price >= ?');
      params.push(minPrice);
    }
    if (maxPrice) {
      conditions.push('p.price <= ?');
      params.push(maxPrice);
    }

    const sortMap = {
      newest: 'p.created_at DESC',
      price_asc: 'p.price ASC',
      price_desc: 'p.price DESC',
      rating: 'p.average_rating DESC',
    };
    const orderBy = sortMap[sort] || sortMap.newest;
    const offset = (Number(page) - 1) * Number(limit);

    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name,
        (SELECT image_url FROM plant_images WHERE plant_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_image
       FROM plants p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM plants p WHERE ${conditions.join(' AND ')}`,
      params
    );

    res.json({ plants: stripPlaceholderImages(rows), pagination: { page: Number(page), limit: Number(limit), total } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/plants/:id
// ---------------------------------------------------------------------
async function getPlant(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name FROM plants p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) throw new AppError('Plant not found.', 404);

    const [images] = await pool.query('SELECT * FROM plant_images WHERE plant_id = ? ORDER BY sort_order', [req.params.id]);
    const [reviews] = await pool.query(
      `SELECT r.*, u.full_name FROM reviews r JOIN users u ON u.id = r.customer_id
       WHERE r.item_type = 'plant' AND r.item_id = ? ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ plant: stripPlaceholderImages(rows[0]), images: stripPlaceholderImages(images), reviews });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/plants - Admin only: create plant
// ---------------------------------------------------------------------
async function createPlant(req, res, next) {
  try {
    const {
      name, scientificName, categoryId, description, price, stockQuantity,
      sunlightNeeds, waterNeeds, climateSuitability, matureHeightCm, careDifficulty,
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO plants (name, scientific_name, category_id, description, price, stock_quantity,
         sunlight_needs, water_needs, climate_suitability, mature_height_cm, care_difficulty, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, scientificName, categoryId, description, price, stockQuantity || 0,
        sunlightNeeds, waterNeeds, climateSuitability, matureHeightCm, careDifficulty || 'easy', req.user.id]
    );

    await recordAudit({ userId: req.user.id, action: 'PLANT_CREATED', entityType: 'plant', entityId: result.insertId, req });
    res.status(201).json({ id: result.insertId, message: 'Plant created successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// PUT /api/plants/:id - Admin only
// ---------------------------------------------------------------------
async function updatePlant(req, res, next) {
  try {
    const fields = [
      'name', 'scientific_name', 'category_id', 'description', 'price', 'stock_quantity',
      'sunlight_needs', 'water_needs', 'climate_suitability', 'mature_height_cm', 'care_difficulty', 'is_active',
    ];
    const camelToSnake = {
      scientificName: 'scientific_name', categoryId: 'category_id', stockQuantity: 'stock_quantity',
      sunlightNeeds: 'sunlight_needs', waterNeeds: 'water_needs', climateSuitability: 'climate_suitability',
      matureHeightCm: 'mature_height_cm', careDifficulty: 'care_difficulty', isActive: 'is_active',
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

    await pool.query(`UPDATE plants SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    await recordAudit({ userId: req.user.id, action: 'PLANT_UPDATED', entityType: 'plant', entityId: req.params.id, req });
    res.json({ message: 'Plant updated successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// DELETE /api/plants/:id - Admin only (soft delete via is_active)
// ---------------------------------------------------------------------
async function deletePlant(req, res, next) {
  try {
    await pool.query('UPDATE plants SET is_active = FALSE WHERE id = ?', [req.params.id]);
    await recordAudit({ userId: req.user.id, action: 'PLANT_DEACTIVATED', entityType: 'plant', entityId: req.params.id, req });
    res.json({ message: 'Plant removed from catalog.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/plants/recommendations - simple rule-based AI recommendation
// engine: matches plant climate_suitability/sunlight/water against the
// customer's district + stored preferences. This is v1 logic; designed
// to be swapped for a real ML/embedding-based recommender later.
// ---------------------------------------------------------------------
async function getRecommendations(req, res, next) {
  try {
    const [[prefs]] = await pool.query('SELECT * FROM customer_preferences WHERE user_id = ?', [req.user.id]);
    const [[user]] = await pool.query(
      `SELECT u.district_id, d.name AS district_name, d.province FROM users u
       LEFT JOIN districts d ON d.id = u.district_id WHERE u.id = ?`,
      [req.user.id]
    );

    // Rwanda climate heuristic: highland provinces favor highland-tagged plants; default tropical.
    const climateTag = user?.province?.includes('Western') || user?.province?.includes('Northern') ? 'highland' : 'tropical';

    const conditions = ['p.is_active = TRUE'];
    const params = [];
    conditions.push('(p.climate_suitability LIKE ? OR p.climate_suitability LIKE ?)');
    params.push(`%${climateTag}%`, '%tropical%');

    if (prefs?.preferred_sunlight) {
      conditions.push('p.sunlight_needs = ?');
      params.push(prefs.preferred_sunlight);
    }
    if (prefs?.preferred_water_needs) {
      conditions.push('p.water_needs = ?');
      params.push(prefs.preferred_water_needs);
    }
    if (prefs?.budget_max) {
      conditions.push('p.price <= ?');
      params.push(prefs.budget_max);
    }

    const [rows] = await pool.query(
      `SELECT p.*, (SELECT image_url FROM plant_images WHERE plant_id = p.id AND is_primary = TRUE LIMIT 1) AS primary_image
       FROM plants p WHERE ${conditions.join(' AND ')}
       ORDER BY p.average_rating DESC, p.created_at DESC LIMIT 8`,
      params
    );

    res.json({ recommendations: stripPlaceholderImages(rows), basedOn: { district: user?.district_name, climateTag, preferences: prefs || null } });
  } catch (err) {
    next(err);
  }
}

async function savePreferences(req, res, next) {
  try {
    const { preferredStyles, preferredSunlight, preferredWaterNeeds, budgetMax } = req.body;
    await pool.query(
      `INSERT INTO customer_preferences (user_id, preferred_styles, preferred_sunlight, preferred_water_needs, budget_max)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE preferred_styles = ?, preferred_sunlight = ?, preferred_water_needs = ?, budget_max = ?`,
      [
        req.user.id, JSON.stringify(preferredStyles || []), preferredSunlight, preferredWaterNeeds, budgetMax,
        JSON.stringify(preferredStyles || []), preferredSunlight, preferredWaterNeeds, budgetMax,
      ]
    );
    res.json({ message: 'Preferences saved.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/plants/:id/images - Admin only: attach an image and/or AR model
// ---------------------------------------------------------------------
async function addPlantImage(req, res, next) {
  try {
    const { imageUrl, arModelUrl, isPrimary } = req.body;
    if (!imageUrl && !arModelUrl) throw new AppError('Provide an imageUrl or arModelUrl.', 400);

    if (isPrimary) {
      await pool.query('UPDATE plant_images SET is_primary = FALSE WHERE plant_id = ?', [req.params.id]);
    }

    const [result] = await pool.query(
      `INSERT INTO plant_images (plant_id, image_url, ar_model_url, is_primary) VALUES (?, ?, ?, ?)`,
      // imageUrl is optional (a plant may have only a 3D model), in which case
      // the column stays NULL and the client shows its bundled placeholder.
      [req.params.id, imageUrl || null, arModelUrl || null, !!isPrimary]
    );

    await recordAudit({ userId: req.user.id, action: 'PLANT_IMAGE_ADDED', entityType: 'plant', entityId: req.params.id, req });
    res.status(201).json({ id: result.insertId, message: 'Media attached to plant.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPlants, getPlant, createPlant, updatePlant, deletePlant, getRecommendations, savePreferences, addPlantImage,
};
