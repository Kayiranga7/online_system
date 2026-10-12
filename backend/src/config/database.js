const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: 0,
  decimalNumbers: true, // return DECIMAL columns as JS numbers, not strings
  timezone: 'Z',
});
console.log('[db] Connection target:', {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  databaseConfigured: Boolean(process.env.DB_NAME),
  userConfigured: Boolean(process.env.DB_USER),
  passwordConfigured: Boolean(process.env.DB_PASSWORD),
});
// Quick startup check so failures surface immediately instead of on first request
async function verifyConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[db] MySQL connection pool established.');
  } catch (err) {
    console.error('[db] Failed to connect to MySQL:', {
      message: err.message || '(empty error message)',
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
    });

    throw err;
  }
}

module.exports = { pool, verifyConnection };
