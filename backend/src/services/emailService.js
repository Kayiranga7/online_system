const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const logger = require('../config/logger');

/**
 * Email goes out over one of two transports, selected by EMAIL_PROVIDER:
 *
 *  - `resend` - the transactional provider's HTTPS API. This is the production
 *    path: mail leaves from a domain you verified with the provider (SPF/DKIM),
 *    not from somebody's personal mailbox, and it needs no TLS trust for a
 *    locally installed mail scanner.
 *  - `smtp`   - any relay through nodemailer: a provider's SMTP relay
 *    (smtp.resend.com, smtp.postmarkapp.com, ...), a self-hosted server, or a
 *    capture tool such as Mailtrap for staging.
 *
 * With EMAIL_PROVIDER unset the transport is inferred from which credentials
 * are present (Resend wins, then SMTP). "Configured" means a real transport
 * was resolved; with no credentials at all emails are logged instead of sent,
 * so a fresh clone runs local development without setting anything up.
 */
const PROVIDERS = ['resend', 'smtp', 'mock'];

function hasSmtpCredentials() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

// Provider problems are logged once per process: sendEmail runs per message and
// repeating the same warning on every mail would bury it.
let _providerWarned = false;
function warnProviderOnce(message) {
  if (_providerWarned) return;
  _providerWarned = true;
  logger.warn(`[email] ${message}`);
}

function getProvider() {
  const explicit = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const valid = PROVIDERS.includes(explicit);
  if (explicit && !valid) {
    warnProviderOnce(`EMAIL_PROVIDER="${explicit}" is not one of ${PROVIDERS.join(' | ')} - inferring the transport from the credentials that are set.`);
  }

  for (const name of valid ? [explicit] : ['resend', 'smtp']) {
    if (name === 'mock') return 'mock';
    if (name === 'resend' && process.env.RESEND_API_KEY) return 'resend';
    if (name === 'smtp' && hasSmtpCredentials()) return 'smtp';
  }

  if (valid && explicit !== 'mock') {
    warnProviderOnce(`EMAIL_PROVIDER=${explicit} is selected but its credentials are missing - emails will be logged instead of sent.`);
  }
  return 'mock';
}

function isConfigured() {
  return getProvider() !== 'mock';
}

/**
 * Extra CA certificates for the SMTP TLS connection, from SMTP_CA_FILE (PEM,
 * comma-separated for several files).
 *
 * Node ships its own root store and deliberately ignores the OS one, so when a
 * TLS-inspecting antivirus or corporate proxy re-signs smtp.<provider> with a
 * local root, verification fails with "self-signed certificate in certificate
 * chain" even though every browser on the same machine is happy. Trusting that
 * root keeps full certificate verification - the alternative, disabling it,
 * would let anything on the network read the SMTP credentials.
 *
 * Returns null when unconfigured, so the default transport is left untouched.
 */
let _caCache;
function smtpCa() {
  if (_caCache !== undefined) return _caCache;
  const ca = [];
  const entries = String(process.env.SMTP_CA_FILE || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    // Resolve against the backend root first (so ./certs/x.pem works no matter
    // which directory the process was started from), then the cwd.
    const candidates = path.isAbsolute(entry)
      ? [entry]
      : [path.resolve(__dirname, '../../', entry), path.resolve(entry)];
    const file = candidates.find((c) => fs.existsSync(c));
    try {
      if (!file) throw new Error('file not found');
      ca.push(fs.readFileSync(file));
      logger.info(`[email] Trusting extra CA for SMTP: ${file}`);
    } catch (err) {
      logger.warn(`[email] SMTP_CA_FILE entry "${entry}" could not be read (${err.message}) - ignoring it.`);
    }
  }
  _caCache = ca.length ? ca : null;
  return _caCache;
}

let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  const ca = smtpCa();
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    // Only set `tls` when extra CAs are configured; otherwise Node's standard
    // verification (and its own root store) is used exactly as before.
    ...(ca ? { tls: { ca } } : {}),
  });
  return _transporter;
}

function fromAddress() {
  return process.env.EMAIL_FROM;
}

function replyTo() {
  return process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {};
}

const RESEND_API = 'https://api.resend.com';
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Resend's HTTPS API - POST /emails with a Bearer key. Returns the provider
 * message id, which end up in the logs alongside the queue row.
 */
async function sendViaResend({ to, subject, html }) {
  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromAddress(), to: [to], subject, html, ...replyTo() }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend API ${res.status}: ${data.message || data.error || res.statusText}`);
  return data.id;
}

async function sendViaSmtp({ to, subject, html }) {
  const info = await getTransporter().sendMail({
    from: fromAddress(), to, subject, html,
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
  });
  return info.messageId;
}

function deliver({ to, subject, html }) {
  return getProvider() === 'resend'
    ? sendViaResend({ to, subject, html })
    : sendViaSmtp({ to, subject, html });
}

/**
 * Confirms the API key works and says whether a sending domain is verified.
 * Resend accepts one key for every workspace, so the key alone is not enough to
 * send: an empty domain list is the first thing people trip over after moving
 * off SMTP.
 */
async function verifyResend() {
  const res = await fetch(`${RESEND_API}/domains`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend API ${res.status}: ${data.message || data.error || res.statusText}`);

  // Domain status runs not_started -> pending -> verified -> failed, and a domain
  // can also land on partially_verified if only some of its records resolve, so
  // report where each domain actually stands rather than a bare pass/fail.
  const domains = data.data || [];
  const names = (list) => list.map((d) => d.name).join(', ');
  const verified = domains.filter((d) => d.status === 'verified');
  const partial = domains.filter((d) => d.status === 'partially_verified');
  if (verified.length) {
    logger.info(`[email] Resend accepted the API key - verified sending domain(s): ${names(verified)}`);
  } else if (partial.length) {
    logger.warn(`[email] Resend domain(s) only partially verified (${names(partial)}) - publish the outstanding SPF/DKIM records before sending to real users.`);
  } else if (domains.length) {
    logger.warn(`[email] No verified sending domain yet (${domains.map((d) => `${d.name}: ${d.status}`).join(', ')}) - publish its SPF/DKIM records, then set EMAIL_FROM to an address on it.`);
  } else {
    logger.warn('[email] Resend accepted the API key but no sending domain has been added - add one, publish its SPF/DKIM records, then set EMAIL_FROM to an address on it.');
  }

  if (/@resend\.dev/i.test(fromAddress() || '')) {
    logger.warn('[email] EMAIL_FROM is still onboarding@resend.dev, which only delivers to your own Resend account address - switch it to an address on a verified domain before real users sign up.');
  }
}

/**
 * Verifies the configured transport at startup so misconfiguration surfaces
 * immediately rather than on first send. Never blocks server startup - an
 * unreachable relay or rejected key just logs a warning and the app continues
 * (emails then fail individually and are recorded per-send instead).
 */
async function verifyEmailConfig() {
  const provider = getProvider();
  if (provider === 'mock') {
    logger.info('[email] No email provider configured - emails will be logged instead of sent. See .env.example.');
    return;
  }
  try {
    if (provider === 'resend') {
      await verifyResend();
    } else {
      await Promise.race([
        getTransporter().verify(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timed out after 6s')), 6000)),
      ]);
      logger.info(`[email] SMTP connection verified (${process.env.SMTP_HOST}).`);
    }
  } catch (err) {
    const credentialHint = provider === 'resend'
      ? 'RESEND_API_KEY / EMAIL_FROM'
      : 'SMTP_HOST / SMTP_USER / SMTP_PASSWORD';
    const caHint = provider === 'smtp' && /certificate/i.test(err.message) && !smtpCa()
      ? ' - the TLS certificate chain was rejected. Node ignores the OS trust store; if an antivirus/proxy is scanning TLS, point SMTP_CA_FILE at its root CA in PEM form instead of disabling verification.'
      : '';
    logger.error(`[email] ${provider} verification failed (continuing startup anyway) - check ${credentialHint}: ${err.message}${caHint}`);
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
 * restarts and can be retried/audited), then attempts immediate delivery
 * through whichever transport EMAIL_PROVIDER resolves to. Falls back to
 * logging when nothing is configured, so local dev keeps working without
 * requiring real credentials.
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
      logger.info(`[email:mock] No email provider configured - would send "${subject}" to ${toEmail}`);
    } else {
      await deliver({ to: toEmail, subject, html });
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

/**
 * Re-sends an email that is already in the queue, updating that row instead of
 * inserting another one so the delivery history stays in a single place.
 * `attempts` keeps its existing meaning - the number of failed deliveries - so a
 * row that succeeded on a retry reads as "sent, after 1 failure".
 *
 * Throws if delivery fails again, after recording the provider's message.
 */
async function retryQueuedEmail(row, payload) {
  const build = templates[row.template];
  if (!build) throw new Error(`Unknown email template: ${row.template}`);
  const { subject, html } = build(payload);

  try {
    await deliver({ to: row.to_email, subject, html });
    await pool.query(
      `UPDATE email_queue SET status = 'sent', sent_at = NOW(), error_message = NULL WHERE id = ?`,
      [row.id]
    );
  } catch (err) {
    await pool.query(
      `UPDATE email_queue SET status = 'failed', attempts = attempts + 1, error_message = ? WHERE id = ?`,
      [err.message, row.id]
    );
    throw err;
  }

  return { id: row.id, subject };
}

// Lets the retry path reject rows whose template no longer exists in code
// (only reachable if a template was renamed or removed after the row was queued).
function hasTemplate(name) {
  return Object.prototype.hasOwnProperty.call(templates, name);
}

module.exports = { sendEmail, retryQueuedEmail, verifyEmailConfig, isConfigured, hasTemplate };
