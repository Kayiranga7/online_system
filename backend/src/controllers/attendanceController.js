const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { notify } = require('../services/notificationService');

async function createShift(req, res, next) {
  try {
    const { employeeId, shiftDate, startTime, endTime } = req.body;
    const [result] = await pool.query(
      'INSERT INTO shift_schedules (employee_id, shift_date, start_time, end_time, created_by) VALUES (?, ?, ?, ?, ?)',
      [employeeId, shiftDate, startTime, endTime, req.user.id]
    );
    await notify({
      userId: employeeId,
      category: 'shift_reminder',
      title: 'New shift scheduled',
      message: `You have a shift on ${shiftDate} from ${startTime} to ${endTime}.`,
    });
    await recordAudit({ userId: req.user.id, action: 'SHIFT_CREATED', entityType: 'shift', entityId: result.insertId, req });
    res.status(201).json({ id: result.insertId, message: 'Shift scheduled.' });
  } catch (err) {
    next(err);
  }
}

async function listShifts(req, res, next) {
  try {
    const conditions = [];
    const params = [];
    if (req.user.role === 'employee') {
      conditions.push('s.employee_id = ?');
      params.push(req.user.id);
    }
    if (req.query.from) {
      conditions.push('s.shift_date >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      conditions.push('s.shift_date <= ?');
      params.push(req.query.to);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT s.*, u.full_name AS employee_name FROM shift_schedules s JOIN users u ON u.id = s.employee_id
       ${whereClause} ORDER BY s.shift_date, s.start_time`,
      params
    );
    res.json({ shifts: rows });
  } catch (err) {
    next(err);
  }
}

async function checkIn(req, res, next) {
  try {
    const { latitude, longitude, shiftId } = req.body;
    const [result] = await pool.query(
      `INSERT INTO attendance (employee_id, shift_id, check_in_at, check_in_lat, check_in_lng, status)
       VALUES (?, ?, NOW(), ?, ?, 'present')`,
      [req.user.id, shiftId || null, latitude || null, longitude || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Checked in successfully.' });
  } catch (err) {
    next(err);
  }
}

async function checkOut(req, res, next) {
  try {
    await pool.query('UPDATE attendance SET check_out_at = NOW() WHERE id = ? AND employee_id = ?', [
      req.params.attendanceId,
      req.user.id,
    ]);
    res.json({ message: 'Checked out successfully.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createShift, listShifts, checkIn, checkOut };
