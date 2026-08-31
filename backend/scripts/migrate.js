#!/usr/bin/env node
/**
 * Versioned, non-destructive schema migrations for PostgreSQL.
 *
 * Why this exists
 * ---------------
 * Before this, `migrations/` held one file that had been applied by hand, there
 * was no record of what had run, and `backend/migrate.js` was a one-off SQLite
 * script pointing at a legacy database path. There was no supported way to
 * evolve the schema of a deployed database without someone remembering which
 * statements they had already typed into psql.
 *
 * The contract
 * ------------
 *   - Files in `backend/migrations/*.sql` are applied in filename order.
 *     Name them `YYYY-MM-DD-what-it-does.sql`, which sorts chronologically.
 *   - Each file runs inside its OWN transaction. A file that fails rolls back
 *     completely and the run stops; nothing after it is attempted. A half
 *     applied migration is therefore not a state this can produce.
 *   - Applied files are recorded in `schema_migrations` with a checksum. An
 *     already-applied file is skipped. A file whose contents changed after it
 *     was applied is REFUSED, loudly -- editing an applied migration means the
 *     database and the repository no longer agree, and silently reapplying it
 *     would be how production data gets corrupted.
 *   - `.down.sql` files are never applied automatically. They exist so a human
 *     can roll one back deliberately.
 *   - Destructive statements (DROP TABLE, TRUNCATE, DROP COLUMN, DELETE without
 *     a WHERE) are rejected unless the file opts in with the marker comment
 *     `-- zfb:allow-destructive`. Normal deployment must never destroy data.
 *
 * Usage
 * -----
 *   node scripts/migrate.js --status      what is applied, what is pending
 *   node scripts/migrate.js --dry-run     print the plan, change nothing
 *   node scripts/migrate.js               apply pending migrations
 *
 * Deployment order: back up -> --dry-run -> apply -> deploy app -> verify.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/* A migration that touches these needs a human to have thought about it. The
   check is deliberately blunt: false positives cost one comment line, a false
   negative costs production data. */
const DESTRUCTIVE = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bTRUNCATE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDELETE\s+FROM\s+[^;]*?;/i,   // any DELETE; the WHERE check is below
];
const ALLOW_MARKER = /--\s*zfb:allow-destructive/i;

/*
 * The runner owns the transaction, so a file's own BEGIN/COMMIT must go.
 * Left in place, the file's COMMIT would close the runner's transaction and the
 * ledger INSERT that follows would land outside it -- meaning a migration could
 * be recorded as applied by a statement that had already been committed
 * separately, which is exactly the atomicity this is supposed to guarantee.
 * The checksum is taken from the file as written, so this rewrite is invisible
 * to change detection.
 */
function stripOuterTransaction(sql) {
  return sql
    .replace(/^\s*BEGIN\s*;/i, '')
    .replace(/COMMIT\s*;\s*$/i, '');
}

function checksum(text) {
  // Normalise line endings so a checkout on Windows and one on Linux agree.
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

function destructiveReason(sql) {
  if (ALLOW_MARKER.test(sql)) return null;
  for (const re of DESTRUCTIVE) {
    const hit = re.exec(sql);
    if (!hit) continue;
    // A DELETE with a WHERE is an ordinary data fix, not a wipe.
    if (/^\s*DELETE/i.test(hit[0]) && /\bWHERE\b/i.test(hit[0])) continue;
    return hit[0].trim().replace(/\s+/g, ' ').slice(0, 60);
  }
  return null;
}

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    });
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const statusOnly = args.includes('--status');

  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD || ''
  });

  const client = await pool.connect();
  let failed = false;

  try {
    await ensureLedger(client);

    const applied = new Map(
      (await client.query('SELECT name, checksum FROM schema_migrations')).rows
        .map((r) => [r.name, r.checksum])
    );

    const all = listMigrations();
    const pending = [];

    console.log(`\nDatabase: ${process.env.PG_DATABASE} @ ${process.env.PG_HOST}:${process.env.PG_PORT}`);
    console.log(`Migrations directory: ${MIGRATIONS_DIR}\n`);

    for (const m of all) {
      const prior = applied.get(m.name);
      if (prior === undefined) {
        pending.push(m);
        console.log(`  PENDING  ${m.name}`);
      } else if (prior !== m.checksum) {
        /* The file changed after it was applied. Reapplying it could rerun
           statements against data that has since moved on; skipping it hides a
           real divergence. Neither is safe to decide automatically. */
        console.error(`  CHANGED  ${m.name}`);
        console.error(`           This migration was already applied, but the file has since been edited.`);
        console.error(`           applied checksum ${prior.slice(0, 12)}, file checksum ${m.checksum.slice(0, 12)}`);
        console.error(`           Do not edit an applied migration. Add a new one instead.`);
        failed = true;
      } else {
        console.log(`  applied  ${m.name}`);
      }
    }

    if (failed) {
      console.error('\nRefusing to run: the repository and the database disagree about an applied migration.\n');
      process.exitCode = 1;
      return;
    }

    if (pending.length === 0) {
      console.log('\nNothing to do; the database is up to date.\n');
      return;
    }

    // Refuse anything destructive before touching the database at all, so a bad
    // file in the middle of the list cannot be discovered halfway through.
    for (const m of pending) {
      const reason = destructiveReason(m.sql);
      if (reason) {
        console.error(`\n  REFUSED  ${m.name}`);
        console.error(`           contains a destructive statement: ${reason}`);
        console.error(`           Normal deployment must not destroy data. If this is genuinely`);
        console.error(`           intended, add the line "-- zfb:allow-destructive" to the file`);
        console.error(`           and make sure a verified backup exists first.\n`);
        process.exitCode = 1;
        return;
      }
    }

    if (statusOnly || dryRun) {
      console.log(`\n${pending.length} migration(s) would be applied, in this order:`);
      pending.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));
      console.log('\nNo changes were made.\n');
      return;
    }

    console.log('\nBack up the database before this point if you have not already.\n');

    for (const m of pending) {
      process.stdout.write(`  applying ${m.name} ... `);
      try {
        await client.query('BEGIN');
        await client.query(stripOuterTransaction(m.sql));
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [m.name, m.checksum]
        );
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.log('FAILED');
        console.error(`\n  ${m.name} was rolled back completely. Nothing after it was attempted.`);
        console.error(`  ${err.message}\n`);
        process.exitCode = 1;
        return;
      }
    }

    console.log(`\n${pending.length} migration(s) applied.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nMigration run failed before any migration was applied:');
  console.error(err.message + '\n');
  process.exitCode = 1;
});
