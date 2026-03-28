const winston = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// ── Custom log format ──────────────────────────────────────────
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  if (stack) return `${timestamp} [${level}]: ${message}\n${stack}${metaStr}`;
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

const prodFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...(stack && { stack }),
    ...meta,
  });
});

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  ),
  defaultMeta: { service: 'devlens-ai' },
  transports: [
    // Console — always
    new winston.transports.Console({
      format: combine(
        ...(isProduction ? [prodFormat] : [colorize(), devFormat]),
      ),
    }),
    // File — errors only
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      format: prodFormat,
    }),
    // File — combined
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      format: prodFormat,
    }),
  ],
  // Don't crash on logger errors
  exitOnError: false,
});

module.exports = logger;
