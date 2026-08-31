/**
 * Order number generator for Zeyad For Business
 * Format: ZFB-YYYY-XXXXXX
 */

const { getPgPool } = require('../config/pg-database');

/**
 * Generate a unique order ID by reading the highest existing order_id for
 * the current year from the live PostgreSQL orders table.
 *
 * This does not hold a lock across the caller's subsequent INSERT, so two
 * concurrent requests can in principle compute the same candidate number;
 * the database's `uq_orders_order_id` unique index is the final backstop
 * and will reject the losing insert rather than corrupt data. That is a
 * acceptable interim behavior (a rare, retryable 500 under real concurrency)
 * compared to the previous bug, where every order after the very first one
 * ever placed against PostgreSQL collided unconditionally because the
 * number was computed from the frozen, pre-migration SQLite orders table.
 * @returns {Promise<string>} Order ID like "ZFB-2026-000001"
 */
async function generateOrderId() {
  const pool = getPgPool();
  const year = new Date().getFullYear();
  const prefix = `ZFB-${year}-`;

  const result = await pool.query(
    'SELECT order_id FROM orders WHERE order_id LIKE $1 ORDER BY id DESC LIMIT 1',
    [`${prefix}%`]
  );

  let nextNum = 1;
  const lastOrder = result.rows[0];
  if (lastOrder) {
    const lastNum = parseInt(lastOrder.order_id.split('-')[2], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(6, '0')}`;
}

module.exports = { generateOrderId };
