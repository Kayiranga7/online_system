const { pool } = require('../config/database');

/**
 * Lightweight, rule-based fraud scoring (0-100, higher = riskier).
 * This is intentionally simple and transparent rather than a black-box
 * ML model, since a v1 system needs explainable flags a Manager/Admin
 * can act on. Swap in a real ML scoring service later without changing
 * the call site in paymentController.
 */
async function scorePaymentRisk({ userId, amount, ipAddress }) {
  let score = 0;
  const reasons = [];

  // Rule 1: unusually large order relative to account history
  const [[avg]] = await pool.query(
    `SELECT AVG(total_amount) AS avgAmount, COUNT(*) AS orderCount
     FROM orders WHERE customer_id = ? AND status NOT IN ('cancelled','pending_payment')`,
    [userId]
  );
  if (avg.orderCount >= 3 && amount > (avg.avgAmount || 0) * 4) {
    score += 30;
    reasons.push('Order amount significantly exceeds customer average.');
  }

  // Rule 2: many failed/pending payments recently from this user
  const [[recentFails]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE o.customer_id = ? AND p.status = 'failed' AND p.created_at > (NOW() - INTERVAL 1 HOUR)`,
    [userId]
  );
  if (recentFails.cnt >= 3) {
    score += 40;
    reasons.push('Multiple failed payment attempts in the last hour.');
  }

  // Rule 3: brand-new account placing a high-value order
  const [[user]] = await pool.query(`SELECT created_at FROM users WHERE id = ?`, [userId]);
  const accountAgeHours = (Date.now() - new Date(user.created_at).getTime()) / 36e5;
  if (accountAgeHours < 1 && amount > 200) {
    score += 25;
    reasons.push('New account placing a high-value order within an hour of signup.');
  }

  return { score: Math.min(score, 100), reasons, flagged: score >= 50 };
}

module.exports = { scorePaymentRisk };
