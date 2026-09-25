/* eslint-disable no-console */
/**
 * IMIZI Fake Users Generator
 *
 * Generates realistic fake users directly into MySQL.
 *
 * Usage:
 *   node database/seed-users.js [count] [--role ROLE]
 *
 * Examples:
 *   node database/seed-users.js 100                # 100 users, random roles
 *   node database/seed-users.js 50 --role customer # 50 customers only
 *   node database/seed-users.js 20 --role admin    # 20 admins only
 *
 * Roles: admin | manager | employee | customer
 * Count defaults to 50, max 500.
 * Demo password for all generated users: Passw0rd!23
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// ─── Data Pools ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael',
  'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan',
  'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles',
  'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret',
  'Mark', 'Sandra', 'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul',
  'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle', 'Kenneth', 'Dorothy',
  'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Timothy',
  'Deborah', 'Aisha', 'Jean', 'Pierre', 'Emmanuel', 'Claude', 'Innocent',
  'Grace', 'Diane', 'Clement', 'Samuel', 'Patrick', 'Agnes', 'Mugabo',
  'Uwimana', 'Nshimiyimana', 'Bizimana', 'Hakizimana', 'Niyonzima', 'Uwimana',
  'Ndayisaba', 'Girubuntu', 'Nkurunziza', 'Manzi', 'Habimana', 'Niyongira',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green',
  'Mugisha', 'Nkurunziza', 'Habimana', 'Uwimana', 'Bizimana', 'Niyongira',
  'Manzi', 'Ndayisaba', 'Girubuntu', 'Nshimiyimana', 'Hakizimana', 'Niyonzima',
  'Rugamba', 'Munyaneza', 'Nsengimana', 'Ndikumana', 'Iradukunda', 'Kubwimana',
];

const RWANDAN_DISTRICTS = [
  { name: 'Gasabo', province: 'Kigali City' },
  { name: 'Kicukiro', province: 'Kigali City' },
  { name: 'Nyarugenge', province: 'Kigali City' },
  { name: 'Musanze', province: 'Northern Province' },
  { name: 'Huye', province: 'Southern Province' },
  { name: 'Rubavu', province: 'Western Province' },
  { name: 'Rwamagana', province: 'Eastern Province' },
];

const PHONE_PREFIXES = ['+250788', '+250789', '+250790', '+250791', '+250792'];

const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

const SPECIALTIES = [
  'Landscaping & Installation',
  'Irrigation Systems',
  'Tree Care & Pruning',
  'Garden Maintenance',
  'Soil & Composting',
  'Outdoor Lighting',
  'Water Features',
  'Plant Health Care',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomDate(start, end) {
  const t = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(t);
}

function generateUsername(first, last) {
  const strategies = [
    () => `${first.toLowerCase()}${last.toLowerCase()}`,
    () => `${first.toLowerCase()}_${last.toLowerCase()}`,
    () => `${first.toLowerCase()}${Math.floor(Math.random() * 999)}`,
    () => `${first[0].toLowerCase()}${last.toLowerCase()}${Math.floor(Math.random() * 99)}`,
    () => `${first.toLowerCase()}.${last.toLowerCase()}`,
  ];
  return pick(strategies)();
}

function generateEmail(first, last) {
  return `${first.toLowerCase().replace(/[^a-z]/g, '')}${Math.floor(Math.random() * 999)}@${pick(EMAIL_DOMAINS)}`;
}

function generatePhone() {
  return `${pick(PHONE_PREFIXES)}${randomDigits(4)}`;
}

function generateDOB() {
  // Ages 18-65
  const minYear = new Date().getFullYear() - 65;
  const maxYear = new Date().getFullYear() - 18;
  const year = minYear + Math.floor(Math.random() * (maxYear - minYear + 1));
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const count = Math.min(Math.max(parseInt(args[0]) || 50, 1), 500);
  const roleFlagIdx = args.indexOf('--role');
  const fixedRole = roleFlagIdx !== -1 ? args[roleFlagIdx + 1] : null;
  const VALID_ROLES = ['admin', 'manager', 'employee', 'customer'];
  if (fixedRole && !VALID_ROLES.includes(fixedRole)) {
    console.error(`Invalid role '${fixedRole}'. Valid roles: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash('Passw0rd!23', 12);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'imizi_db',
    multipleStatements: true,
  });

  try {
    // Check how many districts exist
    const [districtRows] = await connection.query('SELECT id FROM districts');
    if (districtRows.length === 0) {
      console.error('No districts found. Run the base seed first: node database/seed.js');
      process.exit(1);
    }
    const districtIds = districtRows.map((r) => r.id);

    let created = 0;
    let skipped = 0;

    // Role distribution: 70% customer, 15% employee, 10% manager, 5% admin
    const roleWeights = [
      { role: 'customer', weight: 70 },
      { role: 'employee', weight: 15 },
      { role: 'manager', weight: 10 },
      { role: 'admin', weight: 5 },
    ];

    function pickRole() {
      if (fixedRole) return fixedRole;
      const roll = Math.random() * 100;
      let cumulative = 0;
      for (const rw of roleWeights) {
        cumulative += rw.weight;
        if (roll < cumulative) return rw.role;
      }
      return 'customer';
    }

    // Batch insert for speed (groups of 50)
    const BATCH_SIZE = 50;
    const batches = Math.ceil(count / BATCH_SIZE);

    for (let b = 0; b < batches; b++) {
      const batchCount = Math.min(BATCH_SIZE, count - b * BATCH_SIZE);
      const values = [];

      for (let i = 0; i < batchCount; i++) {
        const firstName = pick(FIRST_NAMES);
        const lastName = pick(LAST_NAMES);
        const role = pickRole();
        const districtId = role === 'admin' ? null : pick(districtIds);
        const institutionType = role === 'customer' ? (Math.random() < 0.3 ? 'business' : 'personal') : null;
        const createdAt = randomDate(new Date('2024-01-01'), new Date());

        values.push([
          `${firstName} ${lastName}`,                          // full_name
          generateEmail(firstName, lastName),                   // email
          generatePhone(),                                      // phone_number
          generateDOB(),                                        // date_of_birth
          passwordHash,                                         // password_hash
          role,                                                 // role
          institutionType,                                      // institution_type
          districtId,                                           // district_id
          true,                                                 // email_verified
          'active',                                             // status
          null,                                                 // approved_by (set later)
          null,                                                 // approved_at
          createdAt,                                            // created_at
        ]);
      }

      const placeholders = values.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',\n');
      const flat = values.flat();

      try {
        await connection.query(
          `INSERT INTO users
            (full_name, email, phone_number, date_of_birth, password_hash,
             role, institution_type, district_id, email_verified, status,
             approved_by, approved_at, created_at)
           VALUES ${placeholders}`,
          flat
        );
        created += batchCount;
        process.stdout.write(`\r  Generated ${created}/${count} users...`);
      } catch (err) {
        // Duplicate email — count skipped (batch may partially fail)
        if (err.code === 'ER_DUP_ENTRY') {
          skipped += batchCount;
        } else {
          throw err;
        }
      }
    }

    console.log(`\n  ✅ Done! Created: ${created}, Skipped (duplicates): ${skipped}`);

    // Show summary
    const [roleCounts] = await connection.query(
      `SELECT role, COUNT(*) AS cnt FROM users WHERE deleted_at IS NULL GROUP BY role ORDER BY FIELD(role,'admin','manager','employee','customer')`
    );
    console.log('\n  Users by role:');
    for (const row of roleCounts) {
      console.log(`    ${row.role}: ${row.cnt}`);
    }

    const [totalRow] = await connection.query('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL');
    console.log(`\n  Total users in database: ${totalRow[0].total}`);
    console.log('\n  Demo login: any email above with password: Passw0rd!23');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
