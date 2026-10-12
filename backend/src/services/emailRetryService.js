const { pool } = require('../config/database');
const logger = require('../config/logger');
const { retryQueuedEmail, isConfigured, hasTemplate } = require('./emailService');

/**
 * Templates whose payload carries a single-use link. A retry only helps while
 * that link is still live, and a link that has expired and one that was already
 * used are equally dead to the recipient - so this checks the token against the
 * users table (the same condition the verify/reset endpoints apply) instead of
 * assuming a lifetime from the row's age.
 */
const EXPIRING_LINK_TEMPLATES = {
  verify_email: { tokenColumn: 'email_verification_token', expiresColumn: 'email_verification_expires' },
  password_reset: { tokenColumn: 'password_reset_token', expiresColumn: 'password_reset_expires' },
};

// Every other template (order confirmations, KYC, task and transfer notices) has
// no single-use link, so a late copy is still worth delivering.
const RETRYABLE_STATUSES = ['failed', 'queued'];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Machine-readable codes so the UI can translate the common reasons; `reason`
// stays as the human-readable fallback for anything new.
const SKIP = {
  payload: (detail) => ({ code: 'payload_unusable', reason: detail }),
  unknownTemplate: (name) => ({ code: 'unknown_template', reason: `template "${name}" no longer exists in code` }),
  noToken: () => ({ code: 'no_link_token', reason: 'no link token in the stored payload' }),
  dead: () => ({ code: 'link_expired_or_used', reason: 'link expired or already used' }),
  wrongRecipient: () => ({ code: 'link_recipient_changed', reason: 'link now belongs to a different address' }),
};

function parsePayload(row) {
  if (!row.payload) return null;
  if (typeof row.payload === 'object') return row.payload;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function tokenFromLink(link) {
  try {
    return new URL(link).searchParams.get('token');
  } catch {
    return null;
  }
}

/**
 * Decides whether one queue row can be re-sent.
 * Returns { retryable: true, payload } or { retryable: false, code, reason } -
 * never throws for a bad row, so one unreadable payload cannot stop a batch.
 */
async function classifyRow(row) {
  const payload = parsePayload(row);
  if (!payload) return { retryable: false, ...SKIP.payload('payload missing or unreadable') };
  if (!hasTemplate(row.template)) return { retryable: false, ...SKIP.unknownTemplate(row.template) };

  const linkRule = EXPIRING_LINK_TEMPLATES[row.template];
  if (!linkRule) return { retryable: true, payload };

  const token = payload.link ? tokenFromLink(payload.link) : null;
  if (!token) return { retryable: false, ...SKIP.noToken() };

  // Column names come from the fixed map above, never from request input.
  const [rows] = await pool.query(
    `SELECT u.email AS user_email FROM users u
     WHERE u.${linkRule.tokenColumn} = ? AND u.${linkRule.expiresColumn} > NOW() AND u.deleted_at IS NULL`,
    [token]
  );
  if (!rows.length) return { retryable: false, ...SKIP.dead() };
  if (String(rows[0].user_email || '').toLowerCase() !== String(row.to_email).toLowerCase()) {
    return { retryable: false, ...SKIP.wrongRecipient() };
  }
  return { retryable: true, payload };
}

/**
 * Refuses to retry when no transport is configured: in that mode delivery is a
 * no-op, and flipping those rows to 'sent' would quietly destroy the only record
 * that a customer never got their verification or reset link.
 */
function assertProviderConfigured() {
  if (isConfigured()) return;
  const err = new Error('No email provider is configured, so nothing can be re-sent. Set RESEND_API_KEY (or the SMTP_* credentials) and try again.');
  err.statusCode = 503;
  err.isOperational = true;
  throw err;
}

/**
 * Re-sends failed (or still-queued) emails and reports what happened, including
 * why anything was left alone. The admin endpoint and the requeue script both go
 * through here so they behave identically.
 */
async function retryQueuedEmails({ ids = null, limit = DEFAULT_LIMIT, dryRun = false } = {}) {
  // A dry run sends nothing, so it must work before a provider is configured -
  // that is exactly when you want to see what a retry would do.
  if (!dryRun) assertProviderConfigured();

  const batchSize = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const params = [];
  let where = `status IN (${RETRYABLE_STATUSES.map(() => '?').join(', ')})`;
  params.push(...RETRYABLE_STATUSES);
  if (ids && ids.length) {
    where += ` AND id IN (${ids.map(() => '?').join(', ')})`;
    params.push(...ids);
  }

  const [rows] = await pool.query(
    `SELECT id, to_email, template, payload, status, attempts, error_message FROM email_queue
     WHERE ${where} ORDER BY created_at ASC, id ASC LIMIT ?`,
    [...params, batchSize]
  );

  const report = { dryRun, providerReady: isConfigured(), candidates: rows.length, eligible: 0, sent: 0, failed: 0, skipped: [], errors: [] };

  for (const row of rows) {
    const verdict = await classifyRow(row);
    if (!verdict.retryable) {
      report.skipped.push({ id: row.id, to_email: row.to_email, template: row.template, code: verdict.code, reason: verdict.reason });
      continue;
    }
    report.eligible += 1;
    if (dryRun) continue;

    try {
      await retryQueuedEmail(row, verdict.payload);
      report.sent += 1;
    } catch (err) {
      report.failed += 1;
      report.errors.push({ id: row.id, error: err.message });
    }
  }

  logger.info(`[email] Retry ${dryRun ? 'plan' : 'run'}: ${report.eligible} eligible, ${report.sent} sent, ${report.failed} failed, ${report.skipped.length} skipped of ${report.candidates} candidates.`);
  return report;
}

module.exports = { retryQueuedEmails, classifyRow, assertProviderConfigured, RETRYABLE_STATUSES, MAX_LIMIT, DEFAULT_LIMIT, EXPIRING_LINK_TEMPLATES };
