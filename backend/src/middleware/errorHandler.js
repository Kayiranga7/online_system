const logger = require('../config/logger');

class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found.` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  logger.error(err.message, {
    statusCode,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
  });

  // MySQL duplicate entry
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'A record with this value already exists.' });
  }

  const payload = { error: err.isOperational ? err.message : 'Internal server error.' };
  if (err.details) payload.details = err.details;
  if (process.env.NODE_ENV !== 'production' && !err.isOperational) {
    payload.stack = err.stack;
  }
  res.status(statusCode).json(payload);
}

module.exports = { AppError, notFoundHandler, errorHandler };
