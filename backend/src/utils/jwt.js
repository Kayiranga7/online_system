const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Access tokens are short-lived and carry role/permissions claims.
 * Refresh tokens are long-lived, opaque-ish, and rotated on every use;
 * only their SHA-256 hash is stored in the DB (users.refresh_token_hash)
 * so a leaked database dump can't be replayed directly as a token.
 */

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      districtId: user.district_id || null,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, tokenVersion: user.token_version || 0 },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
