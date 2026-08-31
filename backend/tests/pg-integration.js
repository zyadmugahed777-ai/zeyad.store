#!/usr/bin/env node
/**
 * PostgreSQL integration suite.
 *
 * Exercises the real repository factory, the real services and the real
 * session store against a live PostgreSQL database. Every check corresponds to
 * a bug that was actually found and fixed, so a regression fails loudly rather
 * than silently returning a Promise or a stale row.
 *
 * Requires DATABASE_TYPE=postgres and a reachable database (see .env).
 * Writes only rows it creates itself, tagged with a run-unique stamp, and
 * removes them at the end.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const assert = require('assert');

const type = String(process.env.DATABASE_TYPE || '').toLowerCase();
if (type !== 'postgres' && type !== 'postgresql') {
  console.error('SKIP: DATABASE_TYPE is "' + (process.env.DATABASE_TYPE || '(unset)') +
    '", not postgres. This suite only validates the PostgreSQL adapter.');
  process.exit(0);
}

const { query, closePgPool } = require('../config/pg-database');
const { getRepositories } = require('../repositories');

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log('  PASS  ' + name + (detail ? '  -- ' + detail : ''));
  } catch (err) {
    failed++;
    failures.push({ name, message: err.message });
    console.log('  FAIL  ' + name + '  -- ' + err.message);
  }
}

const rows = async (sql, params) => (await query(sql, params || [])).rows;

(async () => {
  const stamp = Date.now();
  const repos = getRepositories();

  console.log('\n--- connectivity and type parsing ---');

  await check('database reachable', async () => {
    const r = await rows('SELECT current_database() db');
    return r[0].db;
  });

  await check('COUNT(*) deserializes as a JS number, not a string', async () => {
    const r = await rows('SELECT COUNT(*) AS c FROM products');
    assert.strictEqual(typeof r[0].c, 'number',
      'BIGINT/int8 came back as ' + typeof r[0].c + '; the OID 20 type parser is missing');
    return 'typeof number';
  });

  await check('NUMERIC deserializes as a JS number', async () => {
    const r = await rows('SELECT 12.34::numeric AS n');
    assert.strictEqual(typeof r[0].n, 'number');
    return 'typeof number';
  });

  console.log('\n--- reference data (fresh-database bootstrap) ---');

  await check('roles are seeded', async () => {
    const r = await rows('SELECT COUNT(*) AS c FROM roles');
    assert.ok(r[0].c >= 5, 'expected the 5 seeded roles, found ' + r[0].c);
    return r[0].c + ' roles';
  });

  await check('role names match the rbac.js permission map keys', async () => {
    const names = (await rows('SELECT name FROM roles ORDER BY id')).map((x) => x.name);
    for (const expected of ['Super Admin', 'Admin', 'Editor', 'Sales', 'Support']) {
      assert.ok(names.includes(expected), 'missing role "' + expected + '"');
    }
    return names.join(', ');
  });

  await check('ai_permissions are seeded (the admin AI page depends on them)', async () => {
    const r = await rows('SELECT COUNT(*) AS c FROM ai_permissions');
    assert.ok(r[0].c >= 14, 'expected 14 AI permissions, found ' + r[0].c);
    return r[0].c + ' permissions';
  });

  await check('a bootstrap admin exists and resolves a role name', async () => {
    const admin = await repos.auth.findAdminByUsername('admin');
    assert.ok(admin, 'no admin user; ensureDefaultAdmin() never succeeded');
    assert.ok(admin.role_name, 'admin.role_name is empty, so rbac.js would grant no permissions');
    return admin.username + ' -> ' + admin.role_name;
  });

  console.log('\n--- boolean columns (literals in VALUES) ---');

  await check('coupon create stores is_active as a real boolean', async () => {
    const code = 'ITEST' + stamp;
    await repos.coupons.create({
      code, discount_type: 'percentage', discount_value: 10, min_order: 500,
      max_uses: 100, start_date: null, end_date: null, scope: 'public',
      customer_phone: null, customer_id: null, source_type: 'admin',
      source_id: null, created_by: 'itest', notes: 'keep me'
    });
    const r = await rows('SELECT is_active FROM coupons WHERE code = $1', [code]);
    assert.strictEqual(r[0].is_active, true);
    return 'is_active === true';
  });

  await check('Najm order draft inserts with is_confirmed FALSE', async () => {
    const token = 'itest_' + stamp;
    await repos.ai.najmDrafts.createDraft({
      draftToken: token, idempotencyKey: 'itest_idem_' + stamp, sessionId: 'itest',
      customerPayload: JSON.stringify({ name: 'itest' }),
      itemsPayload: JSON.stringify([{ sku: 'X', qty: 1 }]),
      subtotal: 1000, shippingFee: 500, total: 1500,
      expiresAt: new Date(Date.now() + 3600e3).toISOString()
    });
    const back = await repos.ai.najmDrafts.getDraftByToken(token);
    assert.ok(back, 'draft was not readable back');
    assert.strictEqual(back.is_confirmed, false);
    return 'is_confirmed === false';
  });

  console.log('\n--- async contract (partial updates must not wipe fields) ---');

  await check('coupon partial update preserves untouched fields', async () => {
    const code = 'ITESTU' + stamp;
    await repos.coupons.create({
      code, discount_type: 'percentage', discount_value: 10, min_order: 500,
      max_uses: 100, start_date: null, end_date: null, scope: 'public',
      customer_phone: null, customer_id: null, source_type: 'admin',
      source_id: null, created_by: 'itest', notes: 'preserve me'
    });
    const created = await repos.coupons.findByCode(code);
    await repos.coupons.update(created.id, { discount_value: 25 });
    const after = await repos.coupons.findById(created.id);
    assert.strictEqual(Number(after.discount_value), 25, 'the supplied field did not change');
    assert.strictEqual(after.notes, 'preserve me', 'notes was wiped; missing await on findById');
    assert.strictEqual(Number(after.min_order), 500, 'min_order was wiped');
    return 'discount_value 10 -> 25, notes and min_order intact';
  });

  await check('delivery policy toggle flips both ways', async () => {
    const p = await rows('SELECT id FROM delivery_policies ORDER BY id LIMIT 1');
    if (!p.length) return 'skipped, no delivery policy rows';
    const a = await repos.delivery.togglePolicy(p[0].id);
    const b = await repos.delivery.togglePolicy(p[0].id);
    assert.notStrictEqual(a, b, 'toggle returned ' + a + ' twice, so it can only turn on');
    return a + ' -> ' + b;
  });

  await check('CMS element upsert inserts once, then updates in place', async () => {
    let pg = await rows('SELECT id FROM cms_pages ORDER BY id LIMIT 1');
    if (!pg.length) {
      await query('INSERT INTO cms_pages (slug, title_ar) VALUES ($1, $2)', ['itest-page', 'itest']);
      pg = await rows('SELECT id FROM cms_pages ORDER BY id LIMIT 1');
    }
    const key = 'itest_key_' + stamp;
    await repos.cms.saveDraftElement(pg[0].id, key, 'text', 'first', null, 1);
    await repos.cms.saveDraftElement(pg[0].id, key, 'text', 'second', null, 1);
    const back = await repos.cms.getElementDraft(pg[0].id, key);
    const count = await rows(
      'SELECT COUNT(*) AS c FROM cms_elements WHERE page_id = $1 AND element_key = $2', [pg[0].id, key]);
    assert.strictEqual(back.content, 'second', 'the update did not take effect');
    assert.strictEqual(Number(count[0].c), 1, 'expected exactly 1 row, found ' + count[0].c);
    return 'one row, first -> second';
  });

  console.log('\n--- PostgreSQL type semantics (SQLite leaks) ---');

  await check('product lookup by a string business key does not crash', async () => {
    await repos.products.checkStock('ZFB-DOES-NOT-EXIST-' + stamp);
    return 'checkStock accepts a non-numeric key';
  });

  await check('order lookup by a string order_id does not crash', async () => {
    await repos.orders.findSingleOrderForAiTracking('ZFB-2026-NOPE-' + stamp);
    return 'findSingleOrderForAiTracking accepts a non-numeric key';
  });

  console.log('\n--- Najm tools ---');

  await check('get_store_information returns real store data', async () => {
    const { executeCustomerTool } = require('../services/ai/customer-tools');
    const r = await executeCustomerTool('get_store_information', { topic: 'general' }, {});
    assert.ok(r && r.success, 'tool failed: ' + JSON.stringify(r).slice(0, 160));
    assert.ok(Array.isArray(r.branches), 'branches is not an array, so the await is missing');
    return 'storeName=' + r.storeName + ', branches=' + r.branches.length;
  });

  await check('support-ticket lookup enforces phone ownership', async () => {
    const { executeCustomerTool } = require('../services/ai/customer-tools');
    const { createCustomerRequest } = require('../services/ai/customer-requests');
    const phone = '7771' + String(stamp).slice(-6);
    const created = await createCustomerRequest({
      customerName: 'itest', phone, requestText: 'integration test', category: 'general'
    });
    const reqId = created.requestId || created.request_id;

    const noPhone = await executeCustomerTool('get_customer_request', { request_id: reqId }, {});
    assert.strictEqual(noPhone.success, false, 'ticket returned with no phone supplied (IDOR)');

    const wrong = await executeCustomerTool('get_customer_request', { request_id: reqId, phone: '700000000' }, {});
    assert.strictEqual(wrong.success, false, 'ticket returned to the wrong phone (IDOR)');

    const right = await executeCustomerTool('get_customer_request', { request_id: reqId, phone }, {});
    assert.strictEqual(right.success, true, 'the real owner was refused');
    assert.strictEqual(right.requestId, reqId);

    const missing = await executeCustomerTool('get_customer_request',
      { request_id: 'REQ-2026-000000', phone }, {});
    assert.strictEqual(missing.success, false, 'a nonexistent ticket reported success');
    return reqId + ' (refused, refused, allowed, not-found)';
  });

  await check('AI provider factory rejects unresolved settings', async () => {
    const { createProvider } = require('../services/ai/providers');
    const { getProviderSettings } = require('../services/ai/settings-store');
    assert.throws(() => createProvider(getProviderSettings(true)),
      /resolved provider settings/, 'a Promise was accepted as provider settings');
    const real = createProvider(await getProviderSettings(true));
    assert.ok(real, 'resolved settings failed to build a provider');
    return real.constructor.name;
  });

  console.log('\n--- sessions ---');

  await check('session store round-trips through the PostgreSQL repository', async () => {
    const SessionStore = require('../services/session-store');
    const store = new SessionStore({ ttl: 60 });
    const sid = 'itest-sess-' + stamp;
    const data = { cookie: { maxAge: 60000 }, marker: stamp };

    await new Promise((res, rej) => store.set(sid, data, (e) => (e ? rej(e) : res())));
    const got = await new Promise((res, rej) => store.get(sid, (e, v) => (e ? rej(e) : res(v))));
    assert.ok(got, 'session did not come back');
    assert.strictEqual(got.marker, stamp, 'session payload did not survive the round trip');

    await new Promise((res, rej) => store.destroy(sid, (e) => (e ? rej(e) : res())));
    const gone = await new Promise((res, rej) => store.get(sid, (e, v) => (e ? rej(e) : res(v))));
    assert.ok(!gone, 'a destroyed session is still readable');
    clearInterval(store.cleanupTimer);
    return 'set, get, destroy';
  });

  console.log('\n--- SQLite is gone ---');

  // These three used to guard a runtime that still shipped a complete SQLite
  // adapter behind a DATABASE_TYPE switch. The adapter has since been deleted
  // outright, so the checks now assert absence from the source tree as well as
  // from require.cache -- they fail loudly if anyone reintroduces it.

  await check('better-sqlite3 is not loaded at runtime', async () => {
    const loaded = Object.keys(require.cache).some((p) => /better[-_]sqlite3/.test(p));
    assert.ok(!loaded, 'better-sqlite3 is in require.cache');
    return 'driver not loaded';
  });

  await check('better-sqlite3 is not a declared dependency', async () => {
    const pkg = require('../package.json');
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    assert.ok(!('better-sqlite3' in deps), 'better-sqlite3 is still in package.json');
    return 'not in package.json';
  });

  await check('the SQLite adapter and its config are deleted', async () => {
    const fsMod = require('fs');
    const pathMod = require('path');
    const gone = ['repositories/sqlite', 'config/database.js', 'repositories/base-repository.js'];
    const survivors = gone.filter((rel) => fsMod.existsSync(pathMod.join(__dirname, '..', rel)));
    assert.strictEqual(survivors.length, 0, 'still present: ' + survivors.join(', '));
    return gone.length + ' paths absent';
  });

  console.log('\n--- referential integrity ---');

  await check('no orphaned order_items', async () => {
    const r = await rows('SELECT COUNT(*) AS c FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL');
    assert.strictEqual(Number(r[0].c), 0, r[0].c + ' orphaned order_items');
    return '0 orphans';
  });

  await check('no orphaned product_images', async () => {
    const r = await rows('SELECT COUNT(*) AS c FROM product_images pi LEFT JOIN products p ON p.id = pi.product_id WHERE p.id IS NULL');
    assert.strictEqual(Number(r[0].c), 0, r[0].c + ' orphaned product_images');
    return '0 orphans';
  });

  await check('no orphaned cart_items', async () => {
    const r = await rows('SELECT COUNT(*) AS c FROM cart_items ci LEFT JOIN carts c ON c.id = ci.cart_id WHERE c.id IS NULL');
    assert.strictEqual(Number(r[0].c), 0, r[0].c + ' orphaned cart_items');
    return '0 orphans';
  });

  await check('no id sequence has drifted behind its table', async () => {
    // Drive this off information_schema rather than pg_class: an unqualified
    // relname in pg_get_serial_sequence() resolves against the whole search
    // path, which pulls in system catalogs like pg_statistic.
    const tables = await rows(`
      SELECT t.table_name,
             pg_get_serial_sequence('public.' || quote_ident(t.table_name), 'id') AS seq
      FROM information_schema.tables t
      JOIN information_schema.columns col
        ON col.table_schema = t.table_schema
       AND col.table_name = t.table_name
       AND col.column_name = 'id'
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND pg_get_serial_sequence('public.' || quote_ident(t.table_name), 'id') IS NOT NULL
      ORDER BY t.table_name
    `);
    const bad = [];
    for (const t of tables) {
      const r = await rows('SELECT COALESCE(MAX(id), 0) AS max_id, (SELECT last_value FROM ' +
        t.seq + ') AS seq_val FROM "' + t.table_name + '"');
      if (Number(r[0].max_id) > Number(r[0].seq_val)) {
        bad.push(t.table_name + ' (max=' + r[0].max_id + ' > seq=' + r[0].seq_val + ')');
      }
    }
    assert.strictEqual(bad.length, 0, 'sequence drift: ' + bad.join(', '));
    return tables.length + ' sequences checked';
  });

  // Clean up only what this run created.
  try {
    await query('DELETE FROM coupons WHERE created_by = $1', ['itest']);
    await query('DELETE FROM ai_order_drafts WHERE session_id = $1', ['itest']);
    await query('DELETE FROM ai_customer_requests WHERE customer_name = $1', ['itest']);
    await query('DELETE FROM cms_elements WHERE element_key LIKE $1', ['itest_key_%']);
  } catch (e) {
    console.log('\n  (cleanup warning: ' + e.message + ')');
  }

  console.log('\n' + '='.repeat(70));
  console.log('  PostgreSQL integration: ' + passed + ' passed, ' + failed + ' failed');
  console.log('='.repeat(70));
  for (const f of failures) console.log('  FAILED: ' + f.name + '\n          ' + f.message);
  console.log('');

  await closePgPool();
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error('\nSuite crashed:', e);
  try { await closePgPool(); } catch (_) {}
  process.exit(1);
});
