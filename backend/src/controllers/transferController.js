const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

async function createTransferRequest(req, res, next) {
  try {
    const { requestType, requestedDistrictId, requestedInstitutionId, reason } = req.body;
    const [[employee]] = await pool.query('SELECT district_id FROM users WHERE id = ?', [req.user.id]);

    const [result] = await pool.query(
      `INSERT INTO transfer_requests (employee_id, request_type, current_district_id, requested_district_id,
         requested_institution_id, reason) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, requestType, employee.district_id, requestedDistrictId || null, requestedInstitutionId || null, reason || null]
    );

    await recordAudit({ userId: req.user.id, action: 'TRANSFER_REQUESTED', entityType: 'transfer_request', entityId: result.insertId, req });
    res.status(201).json({ id: result.insertId, message: 'Transfer request submitted for review.' });
  } catch (err) {
    next(err);
  }
}

async function listTransferRequests(req, res, next) {
  try {
    const conditions = [];
    const params = [];

    if (req.user.role === 'employee') {
      conditions.push('tr.employee_id = ?');
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      conditions.push('tr.current_district_id = ?');
      params.push(req.user.districtId);
    }
    if (req.query.status) {
      conditions.push('tr.status = ?');
      params.push(req.query.status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT tr.*, u.full_name AS employee_name, d1.name AS current_district_name, d2.name AS requested_district_name
       FROM transfer_requests tr JOIN users u ON u.id = tr.employee_id
       LEFT JOIN districts d1 ON d1.id = tr.current_district_id LEFT JOIN districts d2 ON d2.id = tr.requested_district_id
       ${whereClause} ORDER BY tr.created_at DESC`,
      params
    );
    res.json({ transferRequests: rows });
  } catch (err) {
    next(err);
  }
}

async function getTransferRequest(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT tr.*, u.full_name AS employee_name, m.full_name AS reviewed_by_name,
              d1.name AS current_district_name, d2.name AS requested_district_name
       FROM transfer_requests tr JOIN users u ON u.id = tr.employee_id
       LEFT JOIN users m ON m.id = tr.reviewed_by
       LEFT JOIN districts d1 ON d1.id = tr.current_district_id LEFT JOIN districts d2 ON d2.id = tr.requested_district_id
       WHERE tr.id = ?`,
      [req.params.id]
    );
    if (!rows.length) throw new AppError('Transfer request not found.', 404);
    const request = rows[0];

    if (req.user.role === 'employee' && request.employee_id !== req.user.id) {
      throw new AppError('You do not have permission to view this transfer request.', 403);
    }
    if (req.user.role === 'manager' && request.current_district_id !== req.user.districtId) {
      throw new AppError('You do not have permission to view this transfer request.', 403);
    }

    res.json({ transferRequest: request });
  } catch (err) {
    next(err);
  }
}

async function reviewTransferRequest(req, res, next) {
  try {
    const { approve, reviewNotes } = req.body;
    const [rows] = await pool.query('SELECT * FROM transfer_requests WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new AppError('Transfer request not found.', 404);
    const request = rows[0];

    const decision = approve ? 'approved' : 'rejected';
    await pool.query(
      'UPDATE transfer_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?',
      [decision, req.user.id, reviewNotes || null, req.params.id]
    );

    if (approve && request.request_type === 'district' && request.requested_district_id) {
      await pool.query('UPDATE users SET district_id = ? WHERE id = ?', [request.requested_district_id, request.employee_id]);
      await pool.query('UPDATE employee_profiles SET manager_id = NULL WHERE user_id = ?', [request.employee_id]);
    }

    await recordAudit({
      userId: req.user.id,
      action: 'TRANSFER_REVIEWED',
      entityType: 'transfer_request',
      entityId: req.params.id,
      req,
      details: { decision },
    });

    await notify({
      userId: request.employee_id,
      category: 'transfer_request',
      title: `Transfer request ${decision}`,
      message: `Your transfer request has been ${decision}.`,
      channel: 'both',
    });

    res.json({ message: `Transfer request ${decision}.` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createTransferRequest, listTransferRequests, getTransferRequest, reviewTransferRequest };
