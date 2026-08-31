#!/usr/bin/env node
/**
 * Customer auth -- concurrency and legacy-account behaviour.
 *
 * Separate from test-customer-auth-security.js because these are not access
 * checks: they are about what happens when two requests arrive at the same
 * instant, and about the customers who already exist in the table with no
 * password because the checkout created them implicitly.
 *
 *   node tests/test-customer-auth-races.js
 *
 * Boots its own server (same reasoning as the security suite: the rate limiter
 * is per-process and in-memory) and deletes only the rows it created.
 */

const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const EXTERNAL_BASE_URL = process.env.BASE_URL || null;
const OWN_PORT = 3600 + Math.floor(Math.random() * 300);
const BASE_URL = EXTERNAL_BASE_URL || `http://127.0.0.1:${OWN_PORT}`;

let serverProcess = null;
let passed = 0;
let failed = 0;
const failures = [];
const createdIds = [];

function check(id, description, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${id}  ${description}`);
  } else {
    failed++;
    failures.push(`${id}  ${description}${detail ? ` -- ${detail}` : ''}`);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${id}  ${description}${detail ? `\n          ${detail}` : ''}`);
  }
}

async function startServer() {
  if (EXTERNAL_BASE_URL) return;
  serverProcess = spawn(process.execPath, [path.resolve(__dirname, '..', 'server.js')], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(OWN_PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  serverProcess.stdout.on('data', d => { log += d; });
  serverProcess.stderr.on('data', d => { log += d; });

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`);
      if (r.ok) { console.log(`  Test server started on port ${OWN_PORT}.`); return; }
    } catch (_) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
  }
  console.error(`  Test server did not start.\n${log}`);
  stopServer();
  process.exit(2);
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) { serverProcess.kill(); serverProcess = null; }
}

function post(urlPath, body, headers = {}) {
  return fetch(`${BASE_URL}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    redirect: 'manual'
  }).then(async res => ({ status: res.status, body: await res.json().catch(() => null) }));
}

function randomPhone() {
  return `77${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`;
}

async function main() {
  console.log(`\nCustomer auth -- races & legacy accounts -- ${BASE_URL}\n`);
  await startServer();

  const PASSWORD = 'RacePass2026';

  // ------------------------------------------------------------------ RACE-01
  // Two registrations of the same brand-new number, fired together. The unique
  // index on customers.phone is what decides; exactly one may win.
  console.log('-- Concurrent registration of a new number --');
  const newPhone = randomPhone();
  const both = await Promise.all([
    post('/api/auth/register', { name: 'المتسابق الأول', phone: newPhone, password: PASSWORD, confirmPassword: PASSWORD }),
    post('/api/auth/register', { name: 'المتسابق الثاني', phone: newPhone, password: PASSWORD, confirmPassword: PASSWORD })
  ]);

  const created = both.filter(r => r.status === 201);
  const rejected = both.filter(r => r.status === 409);
  created.forEach(r => { if (r.body?.data?.id) createdIds.push(r.body.data.id); });

  check('RACE-01', 'exactly one of two simultaneous registrations succeeds',
    created.length === 1 && rejected.length === 1,
    `statuses: ${both.map(r => r.status).join(', ')}`);

  check('RACE-01b', 'the loser is told the number is taken, not shown a server error',
    rejected.length === 1 && rejected[0].body?.code === 'PHONE_TAKEN',
    `loser body: ${JSON.stringify(rejected[0]?.body)}`);

  // Only one row may exist for that number, whatever the timing was.
  const { getPgPool } = require('../config/pg-database');
  const pool = getPgPool();
  const rows = await pool.query('SELECT id FROM customers WHERE phone = $1', [newPhone]);
  check('RACE-01c', 'exactly one customer row exists for that phone number',
    rows.rowCount === 1, `found ${rows.rowCount} rows`);

  // ------------------------------------------------------------------ RACE-02
  // The same, but against a passwordless checkout contact record -- the path
  // that claims an existing row rather than inserting one. Both requests see a
  // NULL hash; the conditional UPDATE has to pick a winner.
  console.log('\n-- Concurrent claim of a passwordless checkout record --');
  const legacyPhone = randomPhone();
  const legacyInsert = await pool.query(
    `INSERT INTO customers (first_name, last_name, phone, email, city, total_orders, total_spent, created_at, updated_at)
     VALUES ($1, '', $2, '', 'صنعاء', 0, 0, NOW(), NOW()) RETURNING id`,
    ['عميل قديم', legacyPhone]
  );
  const legacyId = Number(legacyInsert.rows[0].id);
  createdIds.push(legacyId);

  const claims = await Promise.all([
    post('/api/auth/register', { name: 'مطالب أول', phone: legacyPhone, password: PASSWORD, confirmPassword: PASSWORD }),
    post('/api/auth/register', { name: 'مطالب ثاني', phone: legacyPhone, password: 'DifferentPass9', confirmPassword: 'DifferentPass9' })
  ]);

  const claimWon = claims.filter(r => r.status === 201);
  check('RACE-02', 'exactly one of two simultaneous claims on a passwordless record succeeds',
    claimWon.length === 1,
    `statuses: ${claims.map(r => r.status).join(', ')}`);

  check('RACE-02b', 'the claim attaches to the existing row rather than creating a second one',
    claimWon.length === 1 && Number(claimWon[0].body?.data?.id) === legacyId,
    `claimed id=${claimWon[0]?.body?.data?.id}, existing row was ${legacyId}`);

  const legacyRows = await pool.query('SELECT id FROM customers WHERE phone = $1', [legacyPhone]);
  check('RACE-02c', 'still exactly one customer row for that number',
    legacyRows.rowCount === 1, `found ${legacyRows.rowCount} rows`);

  // The winner's password must actually work -- the failure this guards
  // against is the loser silently overwriting the winner's hash.
  const winnerPassword = claims.indexOf(claimWon[0]) === 0 ? PASSWORD : 'DifferentPass9';
  const loserPassword = winnerPassword === PASSWORD ? 'DifferentPass9' : PASSWORD;

  const winnerLogin = await post('/api/auth/login', { phone: legacyPhone, password: winnerPassword });
  check('RACE-02d', "the winning registrant's password is the one that works",
    winnerLogin.status === 200, `login returned ${winnerLogin.status}`);

  const loserLogin = await post('/api/auth/login', { phone: legacyPhone, password: loserPassword });
  check('RACE-02e', "the losing registrant's password was never written",
    loserLogin.status === 401, `login returned ${loserLogin.status}`);

  // ------------------------------------------------------------------ LEGACY
  // A passwordless record must not be loggable-into before it is claimed.
  console.log('\n-- Passwordless records are not accounts --');
  const unclaimedPhone = randomPhone();
  const unclaimed = await pool.query(
    `INSERT INTO customers (first_name, last_name, phone, email, city, total_orders, total_spent, created_at, updated_at)
     VALUES ($1, '', $2, '', 'صنعاء', 0, 0, NOW(), NOW()) RETURNING id`,
    ['عميل بلا كلمة مرور', unclaimedPhone]
  );
  createdIds.push(Number(unclaimed.rows[0].id));

  const emptyPassword = await post('/api/auth/login', { phone: unclaimedPhone, password: '' });
  check('LEGACY-01', 'an empty password cannot log into a passwordless record',
    emptyPassword.status === 400 || emptyPassword.status === 401,
    `status=${emptyPassword.status}`);

  const anyPassword = await post('/api/auth/login', { phone: unclaimedPhone, password: 'anything-at-all' });
  check('LEGACY-02', 'no password logs into a passwordless record',
    anyPassword.status === 401,
    `status=${anyPassword.status} body=${JSON.stringify(anyPassword.body)}`);

  // ------------------------------------------------------------------ GUEST
  // The checkout must still work for someone who has no account at all --
  // hardening customer resolution in the order route must not have closed
  // guest checkout.
  console.log('\n-- Guest checkout still works --');
  const productsRes = await fetch(`${BASE_URL}/api/products?limit=1`, { headers: { Accept: 'application/json' } });
  const productsBody = await productsRes.json();
  const product = productsBody?.data?.[0] || productsBody?.products?.[0] || null;

  if (product) {
    const guestPhone = randomPhone();
    const guestOrder = await post('/api/orders', {
      customer: { firstName: 'زائر', lastName: 'بدون حساب', phone: guestPhone },
      items: [{ id: product.id || product.product_id, quantity: 1 }],
      paymentMethod: 'cash-on-delivery',
      city: 'صنعاء'
    }, { 'x-guest-id': 'guest-race-suite' });

    check('GUEST-01', 'a guest with no account can still place an order',
      guestOrder.status === 201 && guestOrder.body?.orderId,
      `status=${guestOrder.status} body=${JSON.stringify(guestOrder.body).slice(0, 200)}`);

    const guestRow = await pool.query('SELECT id FROM customers WHERE phone = $1', [guestPhone]);
    check('GUEST-02', 'the guest checkout created the customer contact record',
      guestRow.rowCount === 1, `found ${guestRow.rowCount} rows`);
    if (guestRow.rowCount) createdIds.push(Number(guestRow.rows[0].id));

    // And a guest must not be able to rewrite an existing customer's profile
    // by quoting their phone number at checkout.
    const victimBefore = await pool.query('SELECT first_name, city FROM customers WHERE id = $1', [legacyId]);
    await post('/api/orders', {
      customer: { firstName: 'اسم مزروع', lastName: 'من مهاجم', phone: legacyPhone, email: 'attacker@example.com' },
      items: [{ id: product.id || product.product_id, quantity: 1 }],
      paymentMethod: 'cash-on-delivery',
      city: 'عدن'
    }, { 'x-guest-id': 'guest-attacker' });
    const victimAfter = await pool.query('SELECT first_name, city FROM customers WHERE id = $1', [legacyId]);

    check('GUEST-03', "an anonymous order cannot rewrite an existing customer's profile",
      victimAfter.rows[0].first_name === victimBefore.rows[0].first_name &&
      victimAfter.rows[0].city === victimBefore.rows[0].city,
      `before=${JSON.stringify(victimBefore.rows[0])} after=${JSON.stringify(victimAfter.rows[0])}`);
  } else {
    check('GUEST-01', 'guest checkout', false, 'no product available to order');
  }

  // ------------------------------------------------------------------- REPO
  // White-box: the hash must not be sitting inside objects the repository
  // hands out. Everything above is black-box and would still pass if the hash
  // rode along in a row that simply happened not to be serialized today.
  console.log('\n-- The password hash does not leave the repository --');
  const { getRepositories } = require('../repositories');
  const repos = getRepositories('postgres');
  const bcrypt = require('bcryptjs');

  const probePhone = randomPhone();
  const probeId = await repos.customers.createWithPassword({
    first_name: 'فحص', last_name: 'التسريب', phone: probePhone,
    password_hash: await bcrypt.hash('LeakProbe2026', 10)
  });
  createdIds.push(Number(probeId));

  const carries = async (label, promise) => {
    const result = await promise;
    const rows = Array.isArray(result) ? result : [result];
    return rows.some(r => r && 'password_hash' in r);
  };

  check('REPO-01', 'findById does not carry the password hash',
    !(await carries('findById', repos.customers.findById(probeId))));
  check('REPO-02', 'findByPhone does not carry the password hash',
    !(await carries('findByPhone', repos.customers.findByPhone(probePhone))));
  check('REPO-03', 'findAllByPhone does not carry the password hash',
    !(await carries('findAllByPhone', repos.customers.findAllByPhone(probePhone))));
  check('REPO-04', 'findAll (the admin customer list) does not carry the password hash',
    !(await carries('findAll', repos.customers.findAll({ search: probePhone }, 5, 0))));
  check('REPO-05', 'findPublicById does not carry the password hash',
    !(await carries('findPublicById', repos.customers.findPublicById(probeId))));
  check('REPO-06', 'findAuthByPhone DOES carry it -- it is where a password is verified',
    await carries('findAuthByPhone', repos.customers.findAuthByPhone(probePhone)));

  console.log('\n' + '='.repeat(70));
  console.log(`  passed: ${passed}    failed: ${failed}`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log('='.repeat(70) + '\n');

  await cleanup(pool);
  stopServer();
  process.exit(failed === 0 ? 0 : 1);
}

/** Deletes only the ids this run created, never a broad DELETE. */
async function cleanup(pool) {
  if (!createdIds.length) return;
  try {
    const ids = createdIds;
    await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ANY($1::bigint[]))', [ids]);
    await pool.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ANY($1::bigint[]))', [ids]);
    await pool.query('DELETE FROM orders WHERE customer_id = ANY($1::bigint[])', [ids]);
    await pool.query('DELETE FROM addresses WHERE customer_id = ANY($1::bigint[])', [ids]);
    await pool.query('DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ANY($1::bigint[]))', [ids]);
    await pool.query('DELETE FROM carts WHERE user_id = ANY($1::bigint[])', [ids]);
    await pool.query('DELETE FROM customers WHERE id = ANY($1::bigint[])', [ids]);
    console.log(`  Cleaned up ${ids.length} test customer(s) and their rows.\n`);
    await pool.end();
  } catch (err) {
    console.warn(`  Cleanup incomplete (${err.message}). Test customer ids: ${createdIds.join(', ')}\n`);
  }
}

main().catch(err => {
  console.error('\nSuite crashed:', err);
  stopServer();
  process.exit(3);
});
