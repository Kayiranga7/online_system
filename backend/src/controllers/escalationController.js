const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { notify, broadcastToRole } = require('../services/notificationService');

async function createEscalation(req, res, next) {
  try {
    const { relatedEntityType, relatedEntityId, subject, description } = req.body;
    const [result] = await pool.query(
      `INSERT INTO escalations (raised_by, related_entity_type, related_entity_id, subject, description)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, relatedEntityType || null, relatedEntityId || null, subject, description || null]
    );

    await recordAudit({ userId: req.user.id, action: 'ESCALATION_RAISED', entityType: 'escalation', entityId: result.insertId, req });
    broadcastToRole('admin', 'escalation_raised', { id: result.insertId, subject });
    broadcastToRole('manager', 'escalation_raised', { id: result.insertId, subject });

    res.status(201).json({ id: result.insertId, message: 'Escalation raised and routed to management.' });
  } catch (err) {
    next(err);
  }
}

async function listEscalations(req, res, next) {
  try {
    const conditions = [];
    const params = [];
    if (req.user.role === 'employee' || req.user.role === 'customer') {
      conditions.push('e.raised_by = ?');
      params.push(req.user.id);
    }
    if (req.query.status) {
      conditions.push('e.status = ?');
      params.push(req.query.status);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT e.*, u.full_name AS raised_by_name FROM escalations e JOIN users u ON u.id = e.raised_by
       ${whereClause} ORDER BY e.created_at DESC`,
      params
    );
    res.json({ escalations: rows });
  } catch (err) {
    next(err);
  }
}

async function resolveEscalation(req, res, next) {
  try {
    const { status, resolutionNotes } = req.body; // 'in_review' | 'resolved' | 'dismissed'
    const [rows] = await pool.query('SELECT * FROM escalations WHERE id = ?', [req.params.id]);
    if (!rows.length) throw new AppError('Escalation not found.', 404);

    await pool.query(
      `UPDATE escalations SET status = ?, resolved_by = ?, resolved_at = ?, resolution_notes = ? WHERE id = ?`,
      [status, req.user.id, status === 'resolved' ? new Date() : null, resolutionNotes || null, req.params.id]
    );

    await recordAudit({ userId: req.user.id, action: 'ESCALATION_UPDATED', entityType: 'escalation', entityId: req.params.id, req, details: { status } });
    await notify({
      userId: rows[0].raised_by,
      category: 'escalation',
      title: 'Escalation update',
      message: `Your escalation "${rows[0].subject}" status: ${status}.`,
    });

    res.json({ message: 'Escalation updated.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createEscalation, listEscalations, resolveEscalation };
