const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { sendEmail } = require('../services/emailService');
const { notify } = require('../services/notificationService');
const { recordAudit } = require('../services/auditService');

const BCRYPT_ROUNDS = 12;

function publicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phoneNumber: row.phone_number,
    role: row.role,
    institutionType: row.institution_type,
    districtId: row.district_id,
    status: row.status,
    emailVerified: !!row.email_verified,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------
// POST /api/users/managers - Admin only: create a Manager account
// ---------------------------------------------------------------------
async function createManager(req, res, next) {
  try {
    const { fullName, email, phoneNumber, district, password } = req.body;
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) throw new AppError('A user with this email already exists.', 409);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role, district_id,
         email_verification_token, email_verification_expires, status, approved_by, approved_at)
       VALUES (?, ?, ?, ?, 'manager', ?, ?, NOW() + INTERVAL 24 HOUR, 'active', ?, NOW())`,
      [fullName, email, phoneNumber, passwordHash, district, verificationToken, req.user.id]
    );

    const link = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
    await sendEmail(email, 'verify_email', { name: fullName, link });
    await recordAudit({ userId: req.user.id, action: 'MANAGER_CREATED', entityType: 'user', entityId: result.insertId, req });

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/users/employees - Manager (or Admin): add an employee,
// pending Manager approval per the workflow (auto-approved if creator is the approving manager).
// ---------------------------------------------------------------------
async function createEmployee(req, res, next) {
  try {
    const { fullName, email, phoneNumber, district, password, specialty } = req.body;
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) throw new AppError('A user with this email already exists.', 409);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const targetDistrict = req.user.role === 'manager' ? req.user.districtId : district;

    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone_number, password_hash, role, district_id,
         email_verification_token, email_verification_expires, status, approved_by, approved_at)
       VALUES (?, ?, ?, ?, 'employee', ?, ?, NOW() + INTERVAL 24 HOUR, 'active', ?, NOW())`,
      [fullName, email, phoneNumber, passwordHash, targetDistrict, verificationToken, req.user.id]
    );

    await pool.query(
      `INSERT INTO employee_profiles (user_id, manager_id, specialty, hire_date) VALUES (?, ?, ?, CURDATE())`,
      [result.insertId, req.user.role === 'manager' ? req.user.id : null, specialty || null]
    );

    const link = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
    await sendEmail(email, 'verify_email', { name: fullName, link });
    await sendEmail(email, 'employee_approved', { name: fullName });
    await recordAudit({ userId: req.user.id, action: 'EMPLOYEE_CREATED', entityType: 'user', entityId: result.insertId, req });

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/users - list users with role/district filters (Admin: all, Manager: own district)
// ---------------------------------------------------------------------
async function listUsers(req, res, next) {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const conditions = ['u.deleted_at IS NULL'];
    const params = [];

    if (role) {
      conditions.push('u.role = ?');
      params.push(role);
    }
    if (status) {
      conditions.push('u.status = ?');
      params.push(status);
    }
    if (req.districtFilter) {
      conditions.push('u.district_id = ?');
      params.push(req.districtFilter);
    }
    if (search) {
      conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const offset = (Number(page) - 1) * Number(limit);
    const [rows] = await pool.query(
      `SELECT u.*, d.name AS district_name FROM users u
       LEFT JOIN districts d ON d.id = u.district_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u WHERE ${conditions.join(' AND ')}`,
      params
    );

    res.json({
      users: rows.map((r) => ({ ...publicUser(r), districtName: r.district_name })),
      pagination: { page: Number(page), limit: Number(limit), total },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// PATCH /api/users/:id/status - suspend/reactivate a user (Admin/Manager scoped)
// ---------------------------------------------------------------------
async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active' | 'suspended'
    if (!['active', 'suspended'].includes(status)) {
      throw new AppError('Status must be active or suspended.', 400);
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) throw new AppError('User not found.', 404);
    const target = rows[0];

    if (req.user.role === 'manager' && (target.role === 'admin' || target.role === 'manager')) {
      throw new AppError('Managers cannot change status of admins or other managers.', 403);
    }
    if (req.user.role === 'manager' && target.district_id !== req.user.districtId) {
      throw new AppError('Managers can only manage users in their own district.', 403);
    }

    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    await recordAudit({ userId: req.user.id, action: `USER_${status.toUpperCase()}`, entityType: 'user', entityId: id, req });
    await notify({
      userId: id,
      category: 'system_alert',
      title: `Account ${status}`,
      message: `Your account has been ${status} by an administrator.`,
    });

    res.json({ message: `User ${status} successfully.` });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/users/districts - public-ish list for registration dropdown
// ---------------------------------------------------------------------
async function listDistricts(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, name, province FROM districts ORDER BY name');
    res.json({ districts: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { createManager, createEmployee, listUsers, updateUserStatus, listDistricts };
