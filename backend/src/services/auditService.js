const { pool } = require('../config/database');
const logger = require('../config/logger');

/**
 * Records an audit trail entry. Called fire-and-forget from controllers
 * after meaningful state changes (login, order placed, task assigned,
 * employee approved, etc). Never throws - audit logging must not break
 * the primary request flow.
 */
async function recordAudit({ userId = null, action, entityType = null, entityId = null, details = null, req = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        req?.ip || null,
        req?.headers?.['user-agent'] || null,
      ]
    );
  } catch (err) {
    logger.error('Failed to record audit log', { action, error: err.message });
  }
}

module.exports = { recordAudit };
