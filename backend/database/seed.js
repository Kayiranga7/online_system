/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    const seedsDir = path.join(__dirname, 'seeds');
    const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      console.log(`Seeding from ${file}...`);
      const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
      await connection.query(sql);
      console.log('  done.');
    }
    console.log('Database seeded successfully.');
    console.log('Demo login: customer@imizi.rw / manager@imizi.rw / employee@imizi.rw / admin@imizi.rw');
    console.log('Demo password (all accounts): Passw0rd!23');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
