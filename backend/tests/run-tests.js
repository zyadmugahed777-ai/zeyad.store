#!/usr/bin/env node
/**
 * Zeyad For Business — test runner
 *
 * package.json's `npm test` has always pointed at this file, but it did not
 * exist, so there was no runnable test command at all. The tests/ directory
 * accumulated ~40 one-off scripts from successive migration phases; many are
 * historical (they assert against the pre-migration SQLite database, or drive
 * phases that have since been superseded) and are not meaningful to run today.
 *
 * Rather than pretend all of them are a suite, this runner declares which
 * scripts are part of the supported suite and runs those, in order, reporting
 * honestly. Add a file to SUITE when it is known to reflect the current
 * contract; do not add one to make a number go up.
 *
 * Usage:
 *   npm test                  run the default suite
 *   npm test -- --list        show the suite and what is excluded
 *   npm test -- --all         additionally run the quarantined legacy scripts
 *   npm test -- <substring>   run only matching suite entries
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TESTS_DIR = __dirname;

// Load backend/.env before anything reads DATABASE_TYPE.
//
// Without this the runner spawned every suite with DATABASE_TYPE unset.
// pg-integration.js is written to skip rather than fail in that case -- it
// printed "SKIP: DATABASE_TYPE is (unset), not postgres", exited 0, and the
// summary reported PASS for a suite that had asserted nothing. Twenty-four
// checks covering repositories, RBAC, sessions and referential integrity were
// silently not running, and `npm test` was green either way.
require('dotenv').config({ path: path.resolve(TESTS_DIR, '..', '.env') });

// Scripts that reflect the current PostgreSQL contract and are expected to pass.
const SUITE = [
  { file: 'pg-integration.js', name: 'PostgreSQL integration (repositories, RBAC, sessions, Najm)', timeout: 180000 },
  { file: 'test-http-routes.js', name: 'Admin + AI HTTP routes', timeout: 180000 },
  { file: 'test-product-variants-pricing.js', name: 'Product variants: sizes reach the page and set the price', timeout: 60000 },
  { file: 'test-majlis-estimator.js', name: 'Majlis estimator: the inputs must reach the price', timeout: 60000 },
  { file: 'test-product-placement-and-flags.js', name: 'Placement, delivery policy and flag handling', timeout: 60000 },
  { file: 'test-product-form-roundtrip.js', name: 'Admin product form: post it, read the row back', timeout: 120000 },
  { file: 'test-customer-auth-security.js', name: 'Customer auth, isolation & IDOR (AUTH-01..21)', timeout: 300000 },
  { file: 'test-customer-auth-races.js', name: 'Customer auth races, legacy records & guest checkout', timeout: 300000 },
];

// Known-stale scripts, kept for reference but excluded from the default run.
// Each entry records *why*, so this list stays auditable instead of becoming a
// dumping ground.
// Every entry that used to be quarantined here has been deleted along with the
// SQLite adapter: each one either opened db/zeyad.db directly or drove a
// one-shot migration phase against a database that no longer exists. Keeping
// them would have meant carrying 70 files that throw on `require`.
//
// The map stays because the concept is still useful -- add an entry when a
// script is worth keeping but not worth running, and say why.
const QUARANTINE = {};

function listSuite() {
  console.log('\nSuite (runs on `npm test`):');
  for (const t of SUITE) console.log('  - ' + t.file.padEnd(38) + t.name);

  const all = fs.readdirSync(TESTS_DIR).filter((f) => /^(test|smoke)[-_].*\.js$/.test(f));
  const inSuite = new Set(SUITE.map((t) => t.file));
  const others = all.filter((f) => !inSuite.has(f));

  console.log('\nQuarantined (excluded, with reason):');
  for (const [f, why] of Object.entries(QUARANTINE)) console.log('  - ' + f.padEnd(46) + why);

  const unclassified = others.filter((f) => !QUARANTINE[f]);
  console.log('\nNot yet classified (' + unclassified.length + ') -- legacy phase scripts, run manually:');
  for (const f of unclassified) console.log('  - ' + f);
  console.log('');
}

function runOne(entry) {
  return new Promise((resolve) => {
    const file = path.join(TESTS_DIR, entry.file);
    if (!fs.existsSync(file)) {
      console.log('\n  SKIP  ' + entry.file + ' (not found)');
      return resolve({ ...entry, status: 'missing' });
    }

    console.log('\n' + '='.repeat(70));
    console.log('  ' + entry.name);
    console.log('  ' + entry.file);
    console.log('='.repeat(70));

    const started = Date.now();
    const child = spawn(process.execPath, [file], {
      cwd: path.join(TESTS_DIR, '..'),
      stdio: 'inherit',
      env: process.env,
    });

    const timer = setTimeout(() => {
      console.error('\n  TIMEOUT after ' + entry.timeout + 'ms -- killing');
      child.kill('SIGKILL');
    }, entry.timeout);

    child.on('exit', (code) => {
      clearTimeout(timer);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      resolve({ ...entry, status: code === 0 ? 'pass' : 'fail', code, secs });
    });
  });
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--list')) return listSuite();

  const filter = args.find((a) => !a.startsWith('--'));
  const selected = filter ? SUITE.filter((t) => t.file.includes(filter) || t.name.includes(filter)) : SUITE;

  if (!selected.length) {
    console.error('No suite entry matches "' + filter + '". Try --list.');
    process.exit(1);
  }

  console.log('\nZeyadStore test suite');
  console.log('DATABASE_TYPE=' + (process.env.DATABASE_TYPE || '(unset -- legacy SQLite)'));

  const results = [];
  for (const entry of selected) results.push(await runOne(entry));

  console.log('\n' + '='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  for (const r of results) {
    const mark = r.status === 'pass' ? 'PASS' : r.status === 'missing' ? 'MISS' : 'FAIL';
    console.log('  ' + mark + '  ' + r.file + (r.secs ? '  (' + r.secs + 's)' : ''));
  }
  const failed = results.filter((r) => r.status !== 'pass');
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + ' suites passed\n');
  process.exit(failed.length ? 1 : 0);
})();
