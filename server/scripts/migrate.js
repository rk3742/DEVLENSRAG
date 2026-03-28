require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

async function runMigrations() {
  logger.info('Starting automatic database migrations...');
  
  const connectionString = process.env.MYSQL_URL || process.env.DATABASE_URL;

  const connectionOptions = connectionString 
    ? { ...mysql.parseConnectionUrl(connectionString), multipleStatements: true }
    : {
        host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT, 10) || 3306,
        user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
        password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
        database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'devlens_ai',
        multipleStatements: true
      };

  const connection = await mysql.createConnection(connectionOptions);

  try {
    const migrationsDir = path.join(__dirname, '../migrations');
    
    // Read all SQL files in the migrations directory
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Run them in numerical order

    if (files.length === 0) {
      logger.info('No migration files found.');
      return;
    }

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      let sql = fs.readFileSync(filePath, 'utf8');

      // Strip out "CREATE DATABASE" and "USE database" commands
      // Railway (and most cloud providers) restrict CREATE DATABASE privileges.
      sql = sql.replace(/CREATE DATABASE IF NOT EXISTS.*?;/is, '');
      sql = sql.replace(/USE .*?;/i, '');

      logger.info(`Running migration: ${file}`);
      
      // Execute all statements inside the SQL file
      await connection.query(sql);
      
      logger.info(`Successfully completed: ${file}`);
    }

    logger.info('All database migrations ran successfully! Setup complete.');

  } catch (err) {
    logger.error('CRITICAL ERROR: Failed to run database migrations', { error: err.message });
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigrations();
