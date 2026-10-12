const { pool } = require('../config/database');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/auditService');
const { retryQueuedEmail } = require('../services/emailService');
const { retryQueuedEmails, classifyRow, assertProviderConfigured, RETRYABLE_STATUSES } = require('../services/emailRetryService');

const MAX_LIMIT = 100;
const STATUSES = ['queued', 'sent', 'failed'];

/**
 * GET /api/emails - delivery log for the email_queue table (Admin only).
 *
 * Sending happens in the background, so a failed verification or reset email is
 * otherwise only visible in the log file. This exposes the same rows the queue
 * writes: what was sent, to whom, and for failures the provider's error message.
 *
 * `payload` is deliberately not selected - it holds live verification/reset
 * links, and therefore tokens, which a list view has no reason to expose.
 */
async function listEmails(req, res, next) {
  try {
    const { status, template, search, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ error: `Unknown status "${status}". Expected one of: ${STATUSES.join(', ')}.` });
      }
      conditions.push('status = ?');
      params.push(status);
    }
    if (template) {
      conditions.push('template = ?');
      params.push(template);
    }
    if (search) {
      conditions.push('(to_email LIKE ? OR subject LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [emails] = await pool.query(
      `SELECT id, to_email, subject, template, status, attempts, error_message, created_at, sent_at
       FROM email_queue${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM email_queue${where}`, params);

    // Deliberately counted over the whole table rather than the filtered page: a
    // failure has to stay visible while the list is filtered down to 'sent'.
    const [rowsByStatus] = await pool.query('SELECT status, COUNT(*) AS count FROM email_queue GROUP BY status');
    const summary = { queued: 0, sent: 0, failed: 0, total: 0 };
    for (const row of rowsByStatus) {
      summary[row.status] = row.count;
      summary.total += row.count;
    }

    res.json({
      emails,
      pagination: { page: pageNum, limit: limitNum, total },
      summary,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails/retry - re-send failed (or still-queued) emails (Admin only).
 *
 * Body: { ids?: number[], limit?: number, dryRun?: boolean }. With dryRun the
 * same plan is returned without sending anything, so the UI and the requeue
 * script can show what would happen - and which links are already dead - first.
 */
async function retryFailed(req, res, next) {
  try {
    const { ids = null, limit, dryRun = false } = req.body || {};
    const report = await retryQueuedEmails({ ids, limit, dryRun: Boolean(dryRun) });

    if (!report.dryRun) {
      await recordAudit({
        userId: req.user.id,
        action: 'EMAILS_RETRIED',
        entityType: 'email_queue',
        details: { ids: ids || 'all-failed', sent: report.sent, failed: report.failed, skipped: report.skipped.length },
        req,
      });
    }
    res.json(report);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/emails/:id/retry - re-send one queued or failed email (Admin only).
 * A row that already went out is refused rather than sent twice; a stale link is
 * reported as a conflict with the reason, since that is the expected outcome for
 * an old verification or reset email.
 */
async function retryRow(req, res, next) {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      'SELECT id, to_email, template, payload, status FROM email_queue WHERE id = ?',
      [id]
    );
    if (!rows.length) throw new AppError('That email is not in the queue.', 404);

    const row = rows[0];
    if (!RETRYABLE_STATUSES.includes(row.status)) {
      throw new AppError(`Only failed or queued emails can be retried - this one is "${row.status}".`, 409);
    }

    const verdict = await classifyRow(row);
    if (!verdict.retryable) throw new AppError(verdict.reason, 409, { code: verdict.code });

    assertProviderConfigured();
    try {
      const result = await retryQueuedEmail(row, verdict.payload);
      await recordAudit({
        userId: req.user.id,
        action: 'EMAIL_RETRIED',
        entityType: 'email_queue',
        entityId: id,
        details: { to: row.to_email, template: row.template },
        req,
      });
      res.json({ id, status: 'sent', subject: result.subject });
    } catch (err) {
      // The provider rejected it again: distinguish that from our own bugs.
      throw new AppError(`Re-send failed: ${err.message}`, 502);
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { listEmails, retryFailed, retryRow };
