/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_NAME = process.env.DB_NAME || 'imizi_db';

async function runSqlFile(connection, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  // mysql2 needs multipleStatements enabled for files with several statements (set on the connection below)
  console.log(`Running ${path.basename(filePath)}...`);
  await connection.query(sql);
  console.log(`  done.`);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    // Ensure the database exists before anything else (001 also creates it,
    // but the tracking table below needs it to exist first).
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${DB_NAME}\``);

    // Track which migration files have been applied so the runner is
    // incremental: on an existing database it only runs the new files,
    // instead of re-running 001 (whose plain CREATE TABLE statements fail
    // on an existing schema and used to block every later migration).
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // A database that predates the tracking table already has the base
    // schema - mark 001 as applied rather than re-running it. (Seed data
    // lives in database/seeds/ and is applied by `npm run seed`, not here.)
    const [[{ baseSchemaExists }]] = await connection.query(
      `SELECT COUNT(*) AS baseSchemaExists FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'users'`,
      [DB_NAME]
    );
    if (baseSchemaExists > 0) {
      await connection.query(
        `INSERT IGNORE INTO schema_migrations (name) VALUES ('001_schema.sql')`
      );
      console.log('Existing database detected - marking 001_schema.sql as already applied.');
    }

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    const [appliedRows] = await connection.query(`SELECT name FROM schema_migrations`);
    const applied = new Set(appliedRows.map((r) => r.name));

    let ranAny = false;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipping ${file} (already applied).`);
        continue;
      }
      ranAny = true;
      try {
        await runSqlFile(connection, path.join(migrationsDir, file));
        await connection.query(`INSERT INTO schema_migrations (name) VALUES (?)`, [file]);
      } catch (err) {
        console.error(`\nMigration ${file} failed: ${err.message}`);
        console.error('Fix the issue and run "npm run migrate" again (already-applied files are skipped).');
        process.exit(1);
      }
    }

    console.log(ranAny ? 'All migrations applied successfully.' : 'No pending migrations.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
