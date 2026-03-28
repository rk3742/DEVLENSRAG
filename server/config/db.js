const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               parseInt(process.env.DB_PORT, 10) || 3306,
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME || 'devlens_ai',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+00:00',
  // Prevent stale connections
  enableKeepAlive:    true,
  keepAliveInitialDelay: 10000,
});

/**
 * Test database connectivity on startup.
 * Throws if MySQL is unreachable.
 */
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    logger.info('✓ MySQL connection pool established');
  } catch (err) {
    logger.error('✗ MySQL connection failed', { error: err.message });
    throw err;
  }
}

module.exports = { pool, testConnection };
