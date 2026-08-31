#!/usr/bin/env node
/**
 * Applies (or reverses) migrations/2026-08-29-customer-auth.sql.
 *
 *   node scripts/migrate_customer_auth.js          # apply
 *   node scripts/migrate_customer_auth.js --down   # roll back (destroys passwords)
 *
 * The whole file runs inside one transaction, so a failure halfway through
 * leaves the schema exactly as it was rather than half-migrated. Applying it
 * twice is a no-op: every statement in the .sql is IF NOT EXISTS.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DOWN = process.argv.includes('--down');
const FILE = DOWN ? '2026-08-29-customer-auth.down.sql' : '2026-08-29-customer-auth.sql';

async function main() {
  const dbType = String(process.env.DATABASE_TYPE || '').toLowerCase();
  if (dbType !== 'postgres' && dbType !== 'postgresql') {
    console.error(`[migrate] DATABASE_TYPE is "${process.env.DATABASE_TYPE || '(unset)'}" -- this migration targets PostgreSQL. Aborting without touching anything.`);
    process.exit(1);
  }

  if (DOWN && process.env.CONFIRM_DESTRUCTIVE !== 'yes') {
    console.error('[migrate] --down drops customers.password_hash and destroys every customer password.');
    console.error('[migrate] Re-run with CONFIRM_DESTRUCTIVE=yes if that is genuinely what you want.');
    process.exit(1);
  }

  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', FILE), 'utf8');
  const { getPgPool } = require('../config/pg-database');
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`[migrate] Applied ${FILE}`);

    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'customers'
          AND column_name IN ('password_hash', 'password_updated_at', 'last_login_at')
        ORDER BY column_name`
    );
    console.log('[migrate] customers auth columns now:', cols.rows.map(r => r.column_name).join(', ') || '(none)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] FAILED, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
