#!/usr/bin/env node
/**
 * Report customers whose phone numbers are the same number written two ways.
 *
 * READ-ONLY. It issues SELECTs and nothing else. Merging these rows means
 * moving orders, addresses, carts and lifetime totals between customer
 * records, and deciding which name and address survive -- a destructive data
 * migration that needs a human decision and a backup, not a script that runs
 * itself.
 *
 *   node scripts/audit_duplicate_customer_phones.js
 *
 * Background: customers.phone was written unnormalized for a long time, so the
 * live table holds '+967770420928' and '770420928' as separate rows -- one
 * person, two accounts, with their order history split between them.
 * normalizePhone() now writes a single canonical form, and every identity
 * lookup matches all known spellings (see phoneVariants), so the split no
 * longer grows and both rows are reachable by their owner. This report exists
 * to size what is already there.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { normalizePhone } = require('../utils/helpers');

async function main() {
  const dbType = String(process.env.DATABASE_TYPE || '').toLowerCase();
  if (dbType !== 'postgres' && dbType !== 'postgresql') {
    console.error(`[audit] DATABASE_TYPE is "${process.env.DATABASE_TYPE || '(unset)'}" -- this report targets PostgreSQL.`);
    process.exit(1);
  }

  const { getPgPool } = require('../config/pg-database');
  const pool = getPgPool();

  const { rows } = await pool.query(`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email,
           c.total_orders, c.total_spent, c.created_at,
           (c.password_hash IS NOT NULL) AS has_password,
           (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
      FROM customers c
     ORDER BY c.id
  `);

  // Group by the canonical form rather than by the stored string -- that is
  // precisely the equivalence the stored data failed to apply.
  const groups = new Map();
  for (const row of rows) {
    const key = normalizePhone(row.phone);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const duplicates = [...groups.entries()].filter(([, members]) => members.length > 1);

  console.log(`\nCustomers scanned: ${rows.length}`);
  console.log(`Distinct phone numbers after normalization: ${groups.size}`);
  console.log(`Numbers held by more than one row: ${duplicates.length}\n`);

  if (!duplicates.length) {
    console.log('No duplicate identities found. Nothing to review.\n');
    await pool.end();
    return;
  }

  for (const [canonical, members] of duplicates) {
    console.log(`  ${canonical}`);
    for (const m of members) {
      const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || '(no name)';
      console.log(
        `    id=${String(m.id).padEnd(5)} stored="${m.phone}"`.padEnd(46) +
        ` orders=${String(m.order_count).padEnd(3)} spent=${m.total_spent}` +
        ` password=${m.has_password ? 'yes' : 'no '}  ${name}`
      );
    }
    console.log('');
  }

  const withOrders = duplicates.filter(([, ms]) => ms.filter(m => Number(m.order_count) > 0).length > 1);

  console.log('---');
  console.log('REQUIRES REVIEW. No row has been changed by this script.');
  console.log(`${withOrders.length} of these numbers have orders on more than one row, so merging`);
  console.log('them would move order history between customer records. Decide per number:');
  console.log('  - which row is the surviving account (prefer the one with a password),');
  console.log('  - whether the other row\'s orders, addresses and totals move across,');
  console.log('  - which name, email and address survive.');
  console.log('Take a backup first. Nothing here is urgent: both rows are reachable by');
  console.log('their owner today, because lookups match every spelling of a number.\n');

  await pool.end();
}

main().catch(err => {
  console.error('[audit] failed:', err.message);
  process.exit(1);
});
