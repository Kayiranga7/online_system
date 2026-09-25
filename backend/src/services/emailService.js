const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const logger = require('../config/logger');

/**
 * "Configured" means real credentials are present - not which host is used.
 * Mailtrap, SES, SendGrid, Gmail SMTP, etc. are all valid real backends;
 * the only thing that should trigger mock mode is genuinely missing
 * SMTP_USER/SMTP_PASSWORD (e.g. a fresh clone of the repo with no .env
 * filled in yet for local development).
 */
function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  return _transporter;
}

/**
 * Verifies SMTP credentials at startup so misconfiguration surfaces
 * immediately rather than on first send. Never blocks server startup -
 * an unreachable SMTP host just logs a warning and the app continues
 * (emails will fail individually and get logged per-send instead).
 */
async function verifyEmailConfig() {
  if (!isConfigured()) {
    logger.info('[email] No SMTP credentials configured - emails will be logged instead of sent. See .env.example.');
    return;
  }
  try {
    await Promise.race([
      getTransporter().verify(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out after 6s')), 6000)),
    ]);
    logger.info(`[email] SMTP connection verified (${process.env.SMTP_HOST}).`);
  } catch (err) {
    logger.error(`[email] SMTP verification failed (continuing startup anyway) - check SMTP_HOST/SMTP_USER/SMTP_PASSWORD: ${err.message}`);
  }
}

const templates = {
  verify_email: ({ name, link }) => ({
    subject: 'Verify your IMIZI account',
    html: `<p>Hi ${name},</p>
           <p>Welcome to IMIZI Garden Studio. Please verify your email address to activate your account:</p>
           <p><a href="${link}">Verify my email</a></p>
           <p>This link expires in 24 hours.</p>`,
  }),
  password_reset: ({ name, link }) => ({
    subject: 'Reset your IMIZI password',
    html: `<p>Hi ${name},</p>
           <p>We received a request to reset your password. Click below to set a new one:</p>
           <p><a href="${link}">Reset my password</a></p>
           <p>If you didn't request this, you can safely ignore this email. This link expires in 1 hour.</p>`,
  }),
  order_confirmation: ({ name, orderNumber, total }) => ({
    subject: `Order ${orderNumber} confirmed`,
    html: `<p>Hi ${name},</p>
           <p>Your order <strong>${orderNumber}</strong> has been confirmed. Total: <strong>$${total}</strong>.</p>
           <p>You can track your order status from your IMIZI dashboard.</p>`,
  }),
  employee_approved: ({ name }) => ({
    subject: 'Your IMIZI employee account has been approved',
    html: `<p>Hi ${name},</p><p>Your employee account has been approved. You can now log in and view your assigned tasks.</p>`,
  }),
  task_assigned: ({ name, taskTitle }) => ({
    subject: 'New task assigned to you',
    html: `<p>Hi ${name},</p><p>You have been assigned a new task: <strong>${taskTitle}</strong>. Please check your dashboard for details.</p>`,
  }),
  transfer_decision: ({ name, decision }) => ({
    subject: `Your transfer request was ${decision}`,
    html: `<p>Hi ${name},</p><p>Your transfer request has been <strong>${decision}</strong>. Check your dashboard for details.</p>`,
  }),
  kyc_submitted: ({ name, documentType }) => ({
    subject: 'KYC documents received — IMIZI',
    html: `<p>Hi ${name},</p>
           <p>We've received your KYC document (<strong>${documentType}</strong>). Our team will review it shortly.</n           You'll receive an email once your verification is complete.</p>
           <p>Thank you for your patience.</p>
           <p>— The IMIZI Team</p>`,
  }),
  kyc_approved: ({ name }) => ({
    subject: 'KYC verified — you can now place orders 🎉',
    html: `<p>Hi ${name},</p>
           <p>Great news! Your business account has been <strong>verified</strong>.</p>
           <p>You can now browse our catalogue and place orders as a business customer.</p>
           <p><a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/plants" style="display:inline-block;padding:10px 24px;background:#16a34a;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Browse plants</a></p>
           <p>— The IMIZI Team</p>`,
  }),
  kyc_rejected: ({ name, reason }) => ({
    subject: 'KYC verification requires action — IMIZI',
    html: `<p>Hi ${name},</p>
           <p>Unfortunately, your KYC verification could not be approved.</p>
           <p><strong>Reason:</strong> ${reason}</p>
           <p>Please log in, review the feedback, and resubmit your documents so we can get you verified.</p>
           <p><a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/kyc" style="display:inline-block;padding:10px 24px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Resubmit documents</a></p>
           <p>— The IMIZI Team</p>`,
  }),
};

/**
 * Queues an email in the email_queue table (so sending survives process
 * restarts and can be retried/audited), then attempts immediate delivery.
 * Falls back to logging when SMTP isn't configured, so local dev keeps
 * working without requiring real credentials.
 */
async function sendEmail(toEmail, template, payload) {
  const build = templates[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  const { subject, html } = build(payload);

  const [result] = await pool.query(
    `INSERT INTO email_queue (to_email, subject, template, payload, status) VALUES (?, ?, ?, ?, 'queued')`,
    [toEmail, subject, template, JSON.stringify(payload)]
  );
  const queueId = result.insertId;

  try {
    if (!isConfigured()) {
      logger.info(`[email:mock] SMTP not configured - would send "${subject}" to ${toEmail}`);
    } else {
      await getTransporter().sendMail({ from: process.env.EMAIL_FROM, to: toEmail, subject, html });
    }
    await pool.query(`UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = ?`, [queueId]);
  } catch (err) {
    logger.error('Email send failed', { toEmail, template, error: err.message });
    await pool.query(
      `UPDATE email_queue SET status = 'failed', attempts = attempts + 1, error_message = ? WHERE id = ?`,
      [err.message, queueId]
    );
  }
}

module.exports = { sendEmail, verifyEmailConfig, isConfigured };
