const logger = require('../utils/logger');

/**
 * Custom application error with HTTP status code.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global Express error handler.
 * Must be registered LAST with app.use().
 */
function errorHandler(err, req, res, _next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // MySQL errors
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'Resource already exists';
  }

  if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    code = 'DB_UNAVAILABLE';
    message = 'Database connection unavailable';
  }

  // Log server errors, not client errors
  if (statusCode >= 500) {
    logger.error(`[${code}] ${message}`, {
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.warn(`[${code}] ${message}`, {
      path: req.path,
      method: req.method,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : message,
    },
  });
}

module.exports = { AppError, errorHandler };
