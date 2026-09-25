const rateLimit = require('express-rate-limit');

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Stricter limit for auth endpoints (login/register/password reset)
// to mitigate credential stuffing and brute force attacks.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
});

// Very strict limit for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please try again later.' },
});

module.exports = { apiLimiter, authLimiter, paymentLimiter };
