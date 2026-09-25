const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

async function createInstitution(req, res, next) {
  try {
    const { name, type, address, sizeSqm } = req.body;
    const [[user]] = await pool.query('SELECT district_id FROM users WHERE id = ?', [req.user.id]);
    if (!user.district_id) throw new AppError('Your account has no district set.', 400);

    const [result] = await pool.query(
      `INSERT INTO institutions (name, type, owner_customer_id, district_id, address, size_sqm, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_approval')`,
      [name, type, req.user.id, user.district_id, address || null, sizeSqm || null]
    );

    await recordAudit({ userId: req.user.id, action: 'INSTITUTION_CREATED', entityType: 'institution', entityId: result.insertId, req });
    res.status(201).json({ id: result.insertId, message: 'Institution submitted for approval.' });
  } catch (err) {
    next(err);
  }
}

async function listInstitutions(req, res, next) {
  try {
    const conditions = [];
    const params = [];

    if (req.user.role === 'customer') {
      conditions.push('i.owner_customer_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      conditions.push('i.district_id = ?');
      params.push(req.user.districtId);
    }
    if (req.query.status) {
      conditions.push('i.status = ?');
      params.push(req.query.status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT i.*, u.full_name AS owner_name, d.name AS district_name FROM institutions i
       JOIN users u ON u.id = i.owner_customer_id LEFT JOIN districts d ON d.id = i.district_id
       ${whereClause} ORDER BY i.created_at DESC`,
      params
    );
    res.json({ institutions: rows });
  } catch (err) {
    next(err);
  }
}

async function approveInstitution(req, res, next) {
  try {
    const { id } = req.params;
    const { approve } = req.body; // boolean
    const [rows] = await pool.query('SELECT * FROM institutions WHERE id = ?', [id]);
    if (!rows.length) throw new AppError('Institution not found.', 404);
    const institution = rows[0];

    if (req.user.role === 'manager' && institution.district_id !== req.user.districtId) {
      throw new AppError('You can only approve institutions in your district.', 403);
    }

    const newStatus = approve ? 'active' : 'suspended';
    await pool.query('UPDATE institutions SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?', [
      newStatus,
      req.user.id,
      id,
    ]);

    await recordAudit({ userId: req.user.id, action: 'INSTITUTION_REVIEWED', entityType: 'institution', entityId: id, req, details: { approve } });
    await notify({
      userId: institution.owner_customer_id,
      category: 'system_alert',
      title: approve ? 'Institution approved' : 'Institution rejected',
      message: `Your institution "${institution.name}" has been ${approve ? 'approved' : 'rejected'}.`,
    });

    res.json({ message: `Institution ${approve ? 'approved' : 'rejected'}.` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createInstitution, listInstitutions, approveInstitution };
