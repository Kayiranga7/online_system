/* eslint-disable no-console */
/**
 * IMIZI Fake Orders & Reviews Generator
 *
 * Generates realistic orders, order items, payments, and reviews
 * for existing customers in the IMIZI database.
 *
 * Usage:  node database/seed-orders.js [orderCount]
 *         orderCount defaults to 50, max 500
 *
 * Prerequisites:
 *   - Run database/seed.js first (creates districts, plants, designs, users)
 *   - Run database/seed-users.js to create more customers if needed
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// ─── Data Pools ──────────────────────────────────────────────────────────────

const REVIEW_COMMENTS = [
  'Excellent quality! Very happy with my purchase.',
  'The plant arrived in perfect condition. Highly recommend!',
  'Beautiful design, exactly as pictured.',
  'Great value for money. Will order again.',
  'The installation team was professional and efficient.',
  'Amazing customer service. Fast delivery too!',
  'This plant has transformed my living room. Love it!',
  'Good quality but delivery took a bit longer than expected.',
  'Perfect for my garden. The kids love it!',
  'Stunning design. My neighbors keep asking about it.',
  'The care instructions were very helpful. Plant is thriving!',
  'Solid product. Would definitely buy from IMIZI again.',
  'The tropical garden design exceeded my expectations.',
  'Quick setup and the plants look healthy. 5 stars!',
  'Fair price for the quality you get. No complaints.',
  'The irrigation system works perfectly. Saved me so much time.',
  'Beautiful hibiscus! Already blooming after just one week.',
  'The snake plant is perfect for my office. Low maintenance and looks great.',
  'Lavender smells amazing. My garden is now the envy of the block.',
  'Professional installation. The team knew exactly what they were doing.',
];

const DELIVERY_ADDRESSES = [
  'KG 7 Ave, Kigali, Gasabo District',
  'KK 15 Rd, Kicukiro, Kigali',
  'KN 3 Rd, Nyarugenge, Kigali',
  'Musanze Town, Northern Province',
  'Huye Main Road, Southern Province',
  'Rubavu Lakeside, Western Province',
  'Rwamagana Center, Eastern Province',
  'KG 11 St, Kimironko, Gasabo',
  'KK 5 Rd, Kanombe, Kicukiro',
  'KN 7 St, Nyamirambo, Nyarugenge',
];

const PAYMENT_PROVIDERS = ['mtn_mobile_money'];

const ORDER_STATUSES = [
  { status: 'completed', weight: 35 },
  { status: 'delivered', weight: 15 },
  { status: 'in_progress', weight: 10 },
  { status: 'processing', weight: 10 },
  { status: 'paid', weight: 15 },
  { status: 'pending_payment', weight: 10 },
  { status: 'cancelled', weight: 5 },
];

const CURRENCIES = ['RWF'];

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

function generateOrderNumber(date) {
  const year = date.getFullYear();
  const seq = randomDigits(6);
  return `IMZ-${year}-${seq}`;
}

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const roll = Math.random() * total;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (roll < cumulative) return item.status;
  }
  return items[0].status;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const orderCount = Math.min(Math.max(parseInt(process.argv[2]) || 50, 1), 500);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'imizi_db',
    multipleStatements: true,
  });

  try {
    // Fetch existing data
    const [customers] = await connection.query(
      "SELECT id, district_id FROM users WHERE role = 'customer' AND deleted_at IS NULL AND status = 'active'"
    );
    if (customers.length === 0) {
      console.error('No customers found. Run seed-users.js first.');
      process.exit(1);
    }

    const [plants] = await connection.query(
      'SELECT id, name, price FROM plants WHERE is_active = TRUE'
    );
    const [designs] = await connection.query(
      'SELECT id, name, price FROM designs WHERE is_active = TRUE'
    );
    const [districts] = await connection.query('SELECT id FROM districts');

    console.log(`  Found ${customers.length} customers, ${plants.length} plants, ${designs.length} designs`);

    let ordersCreated = 0;
    let itemsCreated = 0;
    let paymentsCreated = 0;
    let reviewsCreated = 0;
    let skipped = 0;

    // Batch insert helper
    async function batchInsert(table, columns, rows) {
      if (rows.length === 0) return 0;
      const placeholders = rows.map(() => `(${columns.map(() => '?').join(',')})`).join(',\n');
      const flat = rows.flat();
      try {
        await connection.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`, flat);
        return rows.length;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return 0;
        throw err;
      }
    }

    // Generate orders
    for (let i = 0; i < orderCount; i++) {
      const customer = pick(customers);
      const districtId = customer.district_id || pick(districts).id;
      const orderDate = randomDate(new Date('2024-06-01'), new Date());
      const status = pickWeighted(ORDER_STATUSES);
      const currency = pick(CURRENCIES);
      const exchangeRate = currency === 'RWF' ? 1300 : 1;

      // Generate 1-4 items per order
      const itemCount = Math.floor(Math.random() * 4) + 1;
      const orderItems = [];
      let subtotal = 0;

      for (let j = 0; j < itemCount; j++) {
        const isDesign = Math.random() < 0.3; // 30% chance of design
        const catalog = isDesign ? designs : plants;
        if (catalog.length === 0) continue;
        const item = pick(catalog);
        const quantity = Math.floor(Math.random() * 5) + 1;
        const unitPrice = Number(item.price);
        const lineTotal = unitPrice * quantity;
        subtotal += lineTotal;

        orderItems.push({
          item_type: isDesign ? 'design' : 'plant',
          item_id: item.id,
          item_name_snapshot: item.name,
          unit_price: unitPrice,
          quantity,
          line_total: lineTotal,
        });
      }

      if (orderItems.length === 0) continue;

      const taxRate = 0.18; // 18% VAT (Rwanda)
      const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
      const deliveryFee = Math.round((Math.random() * 20 + 5) * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount + deliveryFee) * 100) / 100;

      const orderNumber = generateOrderNumber(orderDate);
      const deliveryAddress = pick(DELIVERY_ADDRESSES);
      const requiresInstallation = Math.random() < 0.4;

      // Insert order
      try {
        const [orderResult] = await connection.query(
          `INSERT INTO orders
            (order_number, customer_id, district_id, status, subtotal, tax_amount,
             delivery_fee, total_amount, currency, delivery_address,
             requires_installation, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderNumber, customer.id, districtId, status,
            subtotal, taxAmount, deliveryFee, totalAmount,
            currency, deliveryAddress, requiresInstallation,
            orderDate, orderDate,
          ]
        );

        const orderId = orderResult.insertId;
        ordersCreated++;

        // Insert order items
        const itemRows = orderItems.map((item) => [
          orderId,
          item.item_type,
          item.item_id,
          item.item_name_snapshot,
          item.unit_price,
          item.quantity,
          item.line_total,
        ]);

        await batchInsert('order_items',
          ['order_id', 'item_type', 'item_id', 'item_name_snapshot', 'unit_price', 'quantity', 'line_total'],
          itemRows
        );
        itemsCreated += itemRows.length;

        // Insert payment (for non-cancelled orders)
        if (status !== 'pending_payment' && status !== 'cancelled') {
          const paymentStatus = status === 'refunded' ? 'refunded' : 'succeeded';
          const provider = pick(PAYMENT_PROVIDERS);
          const paymentDate = new Date(orderDate.getTime() + Math.random() * 3600000);

          await batchInsert('payments',
            ['order_id', 'provider', 'amount', 'currency', 'status', 'created_at'],
            [[orderId, provider, totalAmount, currency, paymentStatus, paymentDate]]
          );
          paymentsCreated++;
        }

        // Insert review (for completed orders, ~60% chance)
        if (status === 'completed' && Math.random() < 0.6) {
          const reviewedItem = pick(orderItems);
          const rating = Math.floor(Math.random() * 3) + 3; // 3-5 stars
          const comment = pick(REVIEW_COMMENTS);
          const reviewDate = new Date(orderDate.getTime() + Math.random() * 7 * 86400000 + 86400000);

          try {
            await batchInsert('reviews',
              ['customer_id', 'item_type', 'item_id', 'order_id', 'rating', 'comment', 'is_verified_purchase', 'created_at'],
              [[customer.id, reviewedItem.item_type, reviewedItem.item_id, orderId, rating, comment, true, reviewDate]]
            );
            reviewsCreated++;
          } catch {
            // Duplicate review — skip silently
          }
        }

        process.stdout.write(`\r  Progress: ${i + 1}/${orderCount} orders...`);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          skipped++;
        } else {
          console.error(`\n  Error on order ${i + 1}:`, err.message);
        }
      }
    }

    console.log(`\n\n  ✅ Done!`);
    console.log(`     Orders:   ${ordersCreated}`);
    console.log(`     Items:    ${itemsCreated}`);
    console.log(`     Payments: ${paymentsCreated}`);
    console.log(`     Reviews:  ${reviewsCreated}`);
    if (skipped > 0) console.log(`     Skipped:  ${skipped} (duplicates)`);

    // Summary
    const [orderStats] = await connection.query(
      'SELECT status, COUNT(*) as cnt FROM orders GROUP BY status ORDER BY cnt DESC'
    );
    console.log('\n  Orders by status:');
    for (const row of orderStats) {
      console.log(`    ${row.status}: ${row.cnt}`);
    }

    const [reviewStats] = await connection.query(
      'SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews'
    );
    console.log(`\n  Reviews: ${reviewStats[0].total} total, avg rating: ${Number(reviewStats[0].avg_rating || 0).toFixed(1)}⭐`);

  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
