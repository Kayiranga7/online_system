const { verifyAccessToken } = require('../utils/jwt');
const { pool } = require('../config/database');
const logger = require('../config/logger');

/**
 * authenticate: verifies the JWT access token and attaches req.user.
 * Does NOT hit the database on every request (keeps auth fast) -
 * the JWT payload itself carries id/role/district, which is sufficient
 * for most authorization checks. Routes needing fresh user state
 * (e.g. checking `status`) should re-fetch explicitly.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      districtId: payload.districtId,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token.' });
  }
}

/**
 * authorize(...roles): restricts a route to specific roles.
 * Usage: router.get('/admin-only', authenticate, authorize('admin'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/**
 * requireActiveAccount: re-checks the DB to ensure the account hasn't
 * been suspended/rejected since the access token was issued. Use on
 * sensitive write operations (orders, payments, task assignment).
 */
async function requireActiveAccount(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT status FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
    if (!rows.length || rows[0].status !== 'active') {
      return res.status(403).json({ error: 'Account is not active.' });
    }
    next();
  } catch (err) {
    logger.error('requireActiveAccount failed', { error: err.message });
    res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * scopeToDistrict: for Managers, restricts data access to their own
 * district unless they are Admin. Attaches req.districtFilter that
 * controllers should apply to their WHERE clauses.
 */
function scopeToDistrict(req, res, next) {
  if (req.user.role === 'admin') {
    req.districtFilter = null; // no restriction
  } else {
    req.districtFilter = req.user.districtId;
  }
  next();
}

module.exports = { authenticate, authorize, requireActiveAccount, scopeToDistrict };
