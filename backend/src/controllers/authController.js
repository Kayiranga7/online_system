const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../config/database');
const { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } = require('../utils/jwt');
const { AppError } = require('../middleware/errorHandler');
const { sendEmail } = require('../services/emailService');
const { recordAudit } = require('../services/auditService');
const { verifyAccessToken: verifyAuth0AccessToken, fetchUserInfo: fetchAuth0UserInfo } = require('../services/auth0Service');
const logger = require('../config/logger');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

const { refreshCookieOptions } = require('../config/session');

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
    twoFactorEnabled: !!row.two_factor_enabled,
    avatarUrl: row.avatar_url,
    language: row.language || 'en',
  };
}

async function issueTokens(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await pool.query(
    `UPDATE users SET refresh_token_hash = ?, refresh_token_expires = (NOW() + INTERVAL 7 DAY) WHERE id = ?`,
    [hashToken(refreshToken), user.id]
  );
  res.cookie('refreshToken', refreshToken, refreshCookieOptions());
  return accessToken;
}

// ---------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------
async function register(req, res, next) {
  try {
    const { fullName, email, phoneNumber, dateOfBirth, district, institutionType, password } = req.body;
    // district is mandatory for everyone registering through self-service (all are customers here;
    // Admin/Manager/Employee accounts are created via the admin/manager creation endpoints instead).
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const [districtRow] = await pool.query('SELECT id FROM districts WHERE id = ?', [district]);
    if (!districtRow.length) {
      throw new AppError('Invalid district selected.', 400);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const [result] = await pool.query(
      `INSERT INTO users
        (full_name, email, phone_number, date_of_birth, password_hash, role, institution_type,
         district_id, email_verification_token, email_verification_expires, status)
       VALUES (?, ?, ?, ?, ?, 'customer', ?, ?, ?, NOW() + INTERVAL 24 HOUR, 'active')`,
      [fullName, email, phoneNumber, dateOfBirth, passwordHash, institutionType, district, verificationToken]
    );

    const link = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
    await sendEmail(email, 'verify_email', { name: fullName, link });
    await recordAudit({ userId: result.insertId, action: 'USER_REGISTERED', entityType: 'user', entityId: result.insertId, req });

    res.status(201).json({
      message: 'Account created. Please check your email to verify your address before logging in.',
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/auth/verify-email?token=...
// ---------------------------------------------------------------------
async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) throw new AppError('Verification link is invalid or has expired.', 400);

    // Match on a still-valid, unexpired token as before.
    const [rows] = await pool.query(
      `SELECT id FROM users WHERE email_verification_token = ? AND email_verification_expires > NOW()`,
      [token]
    );

    if (!rows.length) {
      // The token didn't match - but if this exact link was already used a
      // moment ago (e.g. the request was sent twice, or an email scanner
      // pre-fetched the link before the person clicked it), the account may
      // already be verified. Treat that as success instead of an error so
      // the same link is safe to hit more than once.
      const [already] = await pool.query(
        `SELECT id FROM users WHERE email_verification_last_token = ? AND email_verified = TRUE`,
        [token]
      );
      if (already.length) {
        return res.json({ message: 'Email verified successfully. You can now log in.' });
      }
      throw new AppError('Verification link is invalid or has expired.', 400);
    }

    // Keep a record of the token that verified this account (separate from
    // the live token) so a repeat hit on the same link above still succeeds,
    // while the live token is cleared so it can't be used to "re-verify" or
    // reused for anything else.
    await pool.query(
      `UPDATE users SET email_verified = TRUE, email_verification_token = NULL,
        email_verification_expires = NULL, email_verification_last_token = ? WHERE id = ?`,
      [token, rows[0].id]
    );
    await recordAudit({ userId: rows[0].id, action: 'EMAIL_VERIFIED', entityType: 'user', entityId: rows[0].id, req });
    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/resend-verification
// Recovery path for expired/invalid verification links (e.g. the 24-hour
// window passed, or an email security scanner "clicked" the link before
// the person did, consuming the single-use token). Without this, an
// unverified account was a dead end - can't log in (blocked below in
// login()) and can't re-register (email already exists).
// ---------------------------------------------------------------------
async function resendVerificationEmail(req, res, next) {
  try {
    const { email } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    // Always return the same response whether or not the email exists, or is
    // already verified, to avoid leaking account existence/status.
    if (rows.length && !rows[0].email_verified) {
      const user = rows[0];
      const verificationToken = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `UPDATE users SET email_verification_token = ?, email_verification_expires = NOW() + INTERVAL 24 HOUR WHERE id = ?`,
        [verificationToken, user.id]
      );
      const link = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
      await sendEmail(email, 'verify_email', { name: user.full_name, link });
      await recordAudit({ userId: user.id, action: 'VERIFICATION_EMAIL_RESENT', entityType: 'user', entityId: user.id, req });
    }
    res.json({ message: 'If that email is registered and not yet verified, a new verification link has been sent.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------
async function login(req, res, next) {
  try {
    const { email, password, twoFactorCode } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
    const user = rows[0];

    // Constant-ish response timing: always run a bcrypt compare even if user not found,
    // to reduce account-enumeration via timing differences.
    const dummyHash = '$2b$12$0123456789012345678901uVHwO3/.6jvyXqecnNwxnP3OnK.S1G';
    const validPassword = await bcrypt.compare(password, user?.password_hash || dummyHash);

    if (!user || !validPassword) {
      if (user) {
        await pool.query(
          `UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = IF(failed_login_attempts + 1 >= ?, NOW() + INTERVAL ? MINUTE, locked_until)
           WHERE id = ?`,
          [MAX_FAILED_ATTEMPTS, LOCK_DURATION_MINUTES, user.id]
        );
        await recordAudit({ userId: user.id, action: 'LOGIN_FAILED', entityType: 'user', entityId: user.id, req });
      }
      throw new AppError('Invalid email or password.', 401);
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      throw new AppError(`Account temporarily locked due to failed attempts. Try again in ${minutesLeft} minute(s).`, 423);
    }

    if (user.status !== 'active') {
      throw new AppError(
        user.status === 'pending'
          ? 'Your account is pending approval by a Manager/Admin.'
          : 'Your account is not active. Please contact support.',
        403
      );
    }

    if (!user.email_verified) {
      throw new AppError('Please verify your email address before logging in.', 403);
    }

    if (user.two_factor_enabled) {
      if (!twoFactorCode) {
        return res.status(206).json({ requiresTwoFactor: true, message: 'Enter your 2FA code to continue.' });
      }
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 1,
      });
      if (!verified) {
        throw new AppError('Invalid two-factor authentication code.', 401);
      }
    }

    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = ? WHERE id = ?`,
      [req.ip, user.id]
    );

    const accessToken = await issueTokens(res, user);
    await recordAudit({ userId: user.id, action: 'LOGIN_SUCCESS', entityType: 'user', entityId: user.id, req });

    res.json({ accessToken, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/google
// body: { idToken, district?, institutionType? } - district/institutionType
// required only on first-time signup via Google.
// ---------------------------------------------------------------------
async function googleLogin(req, res, next) {
  try {
    const { idToken, district, institutionType } = req.body;
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified } = payload;

    let [rows] = await pool.query('SELECT * FROM users WHERE google_id = ? OR email = ?', [googleId, email]);
    let user = rows[0];

    if (!user) {
      // First-time Google sign-in requires district & institutionType to be supplied by the client
      // after prompting the user (per spec: "User must manually select district & institution type").
      if (!district || !institutionType) {
        return res.status(206).json({
          requiresProfileCompletion: true,
          profile: { name, email, picture },
          message: 'Please select your district and institution type to finish signing up.',
        });
      }
      const [result] = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role, institution_type, district_id,
           google_id, avatar_url, email_verified, status)
         VALUES (?, ?, NULL, 'customer', ?, ?, ?, ?, ?, 'active')`,
        [name, email, institutionType, district, googleId, picture, !!email_verified]
      );
      [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = rows[0];
      await recordAudit({ userId: user.id, action: 'USER_REGISTERED_GOOGLE', entityType: 'user', entityId: user.id, req });
    } else if (!user.google_id) {
      // Existing email/password account signing in with Google for the first time - link it.
      await pool.query('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
    }

    if (user.status !== 'active') {
      throw new AppError('Your account is not active. Please contact support.', 403);
    }

    // Per spec, email verification is still required even via Google, though Google-verified
    // emails are trusted automatically above via email_verified flag.
    if (!user.email_verified) {
      throw new AppError('Please verify your email address before logging in.', 403);
    }

    const accessToken = await issueTokens(res, user);
    await recordAudit({ userId: user.id, action: 'LOGIN_SUCCESS_GOOGLE', entityType: 'user', entityId: user.id, req });
    res.json({ accessToken, user: publicUser(user) });
  } catch (err) {
    logger.error('Google login failed', { error: err.message });
    next(new AppError('Google sign-in failed. Please try again.', 401));
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/auth0
// body: { accessToken, district?, institutionType?, twoFactorCode? }
//
// Auth0 is an additional way in, not a replacement: this endpoint verifies the
// token, maps it to a row in `users`, then issues the app's own access/refresh
// pair exactly like password login. Everything downstream (roles, KYC, order
// gating) keeps working because nothing about the session changes.
// ---------------------------------------------------------------------
async function auth0Login(req, res, next) {
  try {
    const { accessToken: auth0AccessToken, district, institutionType, twoFactorCode } = req.body;

    const claims = await verifyAuth0AccessToken(auth0AccessToken);
    const profile = await fetchAuth0UserInfo(auth0AccessToken);
    if (profile.sub !== claims.sub) {
      throw new AppError('Auth0 returned a profile for a different account.', 401);
    }

    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
    if (!email) {
      throw new AppError('Your Auth0 account does not share an email address. Please sign in with your password instead.', 400);
    }

    const [linkedRows] = await pool.query(
      'SELECT * FROM users WHERE auth0_id = ? AND deleted_at IS NULL',
      [profile.sub]
    );
    let user = linkedRows[0];

    if (!user) {
      const [byEmail] = await pool.query('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]);
      const existing = byEmail[0];

      if (existing) {
        // Attach this Auth0 identity to the account already using the address.
        // Both sides must have proven ownership of it: Auth0 says the address is
        // verified, and the local account verified it at signup. Skipping the
        // second check would let anyone create an Auth0 account with someone
        // else's address and take over the matching local account.
        if (!profile.email_verified) {
          throw new AppError('Your Auth0 email address is not verified. Verify it with Auth0 and try again.', 403);
        }
        if (!existing.email_verified) {
          throw new AppError('An account with this email already exists but its email is not verified. Verify it, or sign in with your password.', 403);
        }
        if (existing.auth0_id && existing.auth0_id !== profile.sub) {
          throw new AppError('This email is already linked to a different Auth0 account.', 409);
        }

        await pool.query('UPDATE users SET auth0_id = ? WHERE id = ?', [profile.sub, existing.id]);
        user = { ...existing, auth0_id: profile.sub };
        await recordAudit({
          userId: existing.id,
          action: 'AUTH0_ACCOUNT_LINKED',
          entityType: 'user',
          entityId: existing.id,
          req,
        });
      }
    }

    if (!user) {
      // First Auth0 sign-in. District (delivery routing) and institution type
      // (business accounts require KYC) are app concepts Auth0 knows nothing
      // about, so they are collected once by the client before the row is made.
      if (!district || !institutionType) {
        return res.status(206).json({
          requiresProfileCompletion: true,
          profile: {
            name: profile.name || profile.nickname || email.split('@')[0],
            email,
            picture: profile.picture || null,
          },
          message: 'Please select your district and institution type to finish signing up.',
        });
      }

      const [districtRow] = await pool.query('SELECT id FROM districts WHERE id = ?', [district]);
      if (!districtRow.length) throw new AppError('Invalid district selected.', 400);

      const fullName = profile.name || profile.nickname || email.split('@')[0];
      const [result] = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role, institution_type, district_id,
           auth0_id, avatar_url, email_verified, status)
         VALUES (?, ?, NULL, 'customer', ?, ?, ?, ?, ?, 'active')`,
        [fullName, email, institutionType, district, profile.sub, profile.picture || null, !!profile.email_verified]
      );

      const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = rows[0];
      await recordAudit({
        userId: user.id,
        action: 'USER_REGISTERED_AUTH0',
        entityType: 'user',
        entityId: user.id,
        req,
      });
    }

    if (user.status !== 'active') {
      throw new AppError('Your account is not active. Please contact support.', 403);
    }

    if (!user.email_verified) {
      throw new AppError('Please verify your email address before logging in.', 403);
    }

    // The password lockout is a deliberate brake on brute force; a second way in
    // must not walk past it, or an attacker could keep trying passwords and then
    // switch to Auth0 while the account is locked.
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      throw new AppError(`Account temporarily locked due to failed attempts. Try again in ${minutesLeft} minute(s).`, 423);
    }

    // An account protected by the app's own TOTP still needs that code: Auth0
    // may not have prompted for a second factor, so accepting the token alone
    // would silently downgrade the account's protection.
    if (user.two_factor_enabled) {
      if (!twoFactorCode) {
        return res.status(206).json({ requiresTwoFactor: true, message: 'Enter your 2FA code to continue.' });
      }
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 1,
      });
      if (!verified) {
        throw new AppError('Invalid two-factor authentication code.', 401);
      }
    }

    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = ? WHERE id = ?`,
      [req.ip, user.id]
    );

    const accessToken = await issueTokens(res, user);
    await recordAudit({ userId: user.id, action: 'LOGIN_SUCCESS_AUTH0', entityType: 'user', entityId: user.id, req });

    res.json({ accessToken, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/refresh - rotates refresh token, issues new access token
// ---------------------------------------------------------------------
async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) throw new AppError('No refresh token provided.', 401);

    const decoded = verifyRefreshToken(token);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [decoded.sub]);
    const user = rows[0];

    if (!user || user.refresh_token_hash !== hashToken(token) || new Date(user.refresh_token_expires) < new Date()) {
      throw new AppError('Refresh token is invalid or expired. Please log in again.', 401);
    }

    const accessToken = await issueTokens(res, user); // rotation: old hash is overwritten
    res.json({ accessToken, user: publicUser(user) });
  } catch (err) {
    next(new AppError('Session expired. Please log in again.', 401));
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------
async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const decoded = verifyRefreshToken(token);
        await pool.query('UPDATE users SET refresh_token_hash = NULL, refresh_token_expires = NULL WHERE id = ?', [decoded.sub]);
        await recordAudit({ userId: decoded.sub, action: 'LOGOUT', entityType: 'user', entityId: decoded.sub, req });
      } catch {
        // token already invalid - nothing to revoke
      }
    }
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    // Always return the same response regardless of whether the email exists,
    // to avoid leaking which addresses are registered.
    if (rows.length) {
      const user = rows[0];
      const resetToken = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `UPDATE users SET password_reset_token = ?, password_reset_expires = NOW() + INTERVAL 1 HOUR WHERE id = ?`,
        [resetToken, user.id]
      );
      const link = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
      await sendEmail(email, 'password_reset', { name: user.full_name, link });
      await recordAudit({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: user.id, req });
    }
    res.json({ message: 'If that email is registered, a password reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const [rows] = await pool.query(
      `SELECT id FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW()`,
      [token]
    );
    if (!rows.length) throw new AppError('Reset link is invalid or has expired.', 400);

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      `UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL,
         refresh_token_hash = NULL, refresh_token_expires = NULL WHERE id = ?`,
      [passwordHash, rows[0].id]
    );
    await recordAudit({ userId: rows[0].id, action: 'PASSWORD_RESET_COMPLETED', entityType: 'user', entityId: rows[0].id, req });
    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// PATCH /api/auth/update-password (authenticated - change password from Profile)
// ---------------------------------------------------------------------
async function updatePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    if (!user) throw new AppError('User not found.', 404);

    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) throw new AppError('Current password is incorrect.', 401);

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      `UPDATE users SET password_hash = ?, refresh_token_hash = NULL, refresh_token_expires = NULL WHERE id = ?`,
      [passwordHash, user.id]
    );

    // Existing refresh token was just invalidated above, so issue a fresh one
    // to keep the user signed in on this device after changing their password.
    const accessToken = await issueTokens(res, user);
    await recordAudit({ userId: user.id, action: 'PASSWORD_UPDATED', entityType: 'user', entityId: user.id, req });
    res.json({ message: 'Password updated successfully.', accessToken });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// 2FA: setup, enable, disable
// ---------------------------------------------------------------------
async function setupTwoFactor(req, res, next) {
  try {
    const secret = speakeasy.generateSecret({
      name: `${process.env.TWO_FACTOR_APP_NAME || 'IMIZI'} (${req.user.email})`,
    });
    await pool.query('UPDATE users SET two_factor_secret = ? WHERE id = ?', [secret.base32, req.user.id]);
    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qrCode: qrCodeDataUrl, manualEntryKey: secret.base32 });
  } catch (err) {
    next(err);
  }
}

async function enableTwoFactor(req, res, next) {
  try {
    const { code } = req.body;
    const [rows] = await pool.query('SELECT two_factor_secret FROM users WHERE id = ?', [req.user.id]);
    const verified = speakeasy.totp.verify({ secret: rows[0].two_factor_secret, encoding: 'base32', token: code, window: 1 });
    if (!verified) throw new AppError('Invalid verification code.', 400);

    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    const hashedBackupCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));
    await pool.query('UPDATE users SET two_factor_enabled = TRUE, two_factor_backup_codes = ? WHERE id = ?', [
      JSON.stringify(hashedBackupCodes),
      req.user.id,
    ]);
    await recordAudit({ userId: req.user.id, action: 'TWO_FACTOR_ENABLED', entityType: 'user', entityId: req.user.id, req });
    res.json({ message: '2FA enabled successfully.', backupCodes });
  } catch (err) {
    next(err);
  }
}

async function disableTwoFactor(req, res, next) {
  try {
    await pool.query(
      'UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, two_factor_backup_codes = NULL WHERE id = ?',
      [req.user.id]
    );
    await recordAudit({ userId: req.user.id, action: 'TWO_FACTOR_DISABLED', entityType: 'user', entityId: req.user.id, req });
    res.json({ message: '2FA disabled.' });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// PATCH /api/auth/me - update own profile (full name, phone number)
// ---------------------------------------------------------------------
async function updateMe(req, res, next) {
  try {
    // Field-dynamic update: only the fields present in the body are written,
    // so partial PATCHes (e.g. { language } from the language switcher) never
    // clobber the other profile columns.
    const { fullName, phoneNumber, language } = req.body;
    const updates = [];
    const params = [];
    if (fullName) {
      updates.push('full_name = ?');
      params.push(fullName);
    }
    if (phoneNumber !== undefined) {
      updates.push('phone_number = ?');
      params.push(phoneNumber || null);
    }
    if (language !== undefined) {
      updates.push('language = ?');
      params.push(language);
    }
    if (updates.length) {
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...params, req.user.id]);
      await recordAudit({ userId: req.user.id, action: 'PROFILE_UPDATED', entityType: 'user', entityId: req.user.id, req });
    }

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: 'Profile updated successfully.', user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------
async function me(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
    if (!rows.length) throw new AppError('User not found.', 404);
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  verifyEmail,
  resendVerificationEmail,
  login,
  googleLogin,
  auth0Login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  updatePassword,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  me,
  updateMe,
};
