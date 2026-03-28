const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

  const connectionString = process.env.MYSQL_URL || process.env.DATABASE_URL;

  let connectionOptions;
  if (connectionString) {
    const parsed = new URL(connectionString);
    connectionOptions = {
      host:               parsed.hostname,
      port:               parseInt(parsed.port, 10) || 3306,
      user:               parsed.username,
      password:           parsed.password,
      database:           parsed.pathname.replace(/^\//, ''),
      waitForConnections: true,
      connectionLimit:    20,
      queueLimit:         0,
      charset:            'utf8mb4',
      timezone:           '+00:00',
      enableKeepAlive:    true,
      keepAliveInitialDelay: 10000,
    };
  } else {
    connectionOptions = {
      host:               process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
      port:               parseInt(process.env.MYSQLPORT || process.env.DB_PORT, 10) || 3306,
      user:               process.env.MYSQLUSER || process.env.DB_USER || 'root',
      password:           process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
      database:           process.env.MYSQLDATABASE || process.env.DB_NAME || 'devlens_ai',
      waitForConnections: true,
      connectionLimit:    20,
      queueLimit:         0,
      charset:            'utf8mb4',
      timezone:           '+00:00',
      enableKeepAlive:    true,
      keepAliveInitialDelay: 10000,
    };
  }

  const pool = mysql.createPool(connectionOptions);

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
