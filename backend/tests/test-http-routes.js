const assert = require('assert');
const express = require('express');
const session = require('express-session');
const path = require('path');
// This suite used to open the legacy SQLite database at module scope and
// assign the handle to a `db` const that nothing in the file ever read. When
// that file became corrupt the dead import took the whole suite down with it
// -- `npm test` reported 3/4 for a failure that had nothing to do with the
// routes being tested. The routes reach PostgreSQL through the repository
// layer; no direct database handle is needed here.

// Setup Express app matching server.js structure
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: true
}));

// Mock admin session middleware
app.use((req, res, next) => {
  // middleware/rbac.js resolves permissions from req.session.admin.role_name
  // (matching what the real loginAdmin() puts in the session). This fixture
  // used to set "role" and "permissions" instead, which rbac.js never reads,
  // so rolePermissions[undefined] was [] and every permission-gated route
  // 403'd -- a stale fixture, not a product bug.
  req.session.admin = {
    id: 1,
    username: 'admin',
    full_name: 'مدير النظام',
    role_id: 1,
    role_name: 'Super Admin'
  };
  next();
});

// Mock helpers and locals
const { formatPrice, formatDate, formatDateTime, parsePagination, paginationInfo, statusLabel, statusColor, paymentLabel } = require('../utils/helpers');
app.use((req, res, next) => {
  res.locals.helpers = { formatPrice, formatDate, formatDateTime, parsePagination, paginationInfo, statusLabel, statusColor, paymentLabel };
  res.locals.admin = req.session.admin;
  res.locals.flash = null;
  res.locals.csrfToken = 'test-csrf';
  req.csrfToken = () => 'test-csrf';
  next();
});

// Mount Routes
app.use('/admin/frame-products', require('../routes/admin/frame-products'));
app.use('/admin/najm', require('../routes/admin/najm'));
app.use('/admin/ai-employee', require('../routes/admin/ai-employee'));
app.use('/api/ai', require('../routes/api/customer-ai'));

async function startAndTest() {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`🌐 Testing HTTP Routes on ${baseUrl}...\n`);
  let passed = 0;
  let failed = 0;

  async function testRoute(name, url, options = {}, expectStatus = 200, validateBody = null) {
    try {
      const res = await fetch(`${baseUrl}${url}`, options);
      assert.strictEqual(res.status, expectStatus, `Expected ${expectStatus}, got ${res.status}`);
      if (validateBody) {
        const text = await res.text();
        validateBody(text);
      }
      console.log(`  ✅ PASSED: ${name} [${res.status}]`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${name}`);
      console.error('     ', err.message);
      failed++;
    }
  }

  // 1. /admin/frame-products (No 500 error!)
  await testRoute('1. GET /admin/frame-products returns 200 OK', '/admin/frame-products', {}, 200, (html) => {
    assert.ok(html.includes('منتجات الإطار') || html.includes('SuperDeals'), 'HTML should render frame products page');
  });

  // 2. /admin/najm Overview
  await testRoute('2. GET /admin/najm returns 200 OK', '/admin/najm', {}, 200, (html) => {
    assert.ok(html.includes('نجم — وكيل مبيعات وخدمة العملاء'), 'HTML should render Najm overview');
  });

  // 3. /admin/najm/settings
  await testRoute('3. GET /admin/najm/settings returns 200 OK', '/admin/najm/settings', {}, 200, (html) => {
    assert.ok(html.includes('إعدادات مزود الذكاء'), 'HTML should render Najm settings');
  });

  // 4. /admin/najm/instructions
  await testRoute('4. GET /admin/najm/instructions returns 200 OK', '/admin/najm/instructions', {}, 200, (html) => {
    assert.ok(html.includes('محرر تعليمات وسياسات نجم'), 'HTML should render Najm instructions');
  });

  // 5. /admin/najm/requests
  await testRoute('5. GET /admin/najm/requests returns 200 OK', '/admin/najm/requests', {}, 200, (html) => {
    assert.ok(html.includes('طلبات وتذاكر العملاء'), 'HTML should render Najm requests');
  });

  // 6. /admin/ai-employee (Admin Operations AI intact!)
  await testRoute('6. GET /admin/ai-employee returns 200 OK', '/admin/ai-employee', {}, 200, (html) => {
    assert.ok(html.includes('الموظف الذكي لإدارة زياد ستور'), 'HTML should render Admin AI');
  });

  // 7. /api/ai/featured-recommendations
  await testRoute('7. GET /api/ai/featured-recommendations returns 200 JSON', '/api/ai/featured-recommendations', {}, 200, (text) => {
    const json = JSON.parse(text);
    assert.strictEqual(json.success, true);
  });

  // 8. /api/ai/customer-chat
  await testRoute('8. POST /api/ai/customer-chat handles customer message', '/api/ai/customer-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'مرحبا اريد غرف نوم', sessionId: 'test-http-session' })
  }, 200, (text) => {
    const json = JSON.parse(text);
    assert.strictEqual(json.success, true);
    assert.ok(json.answer, 'Must return answer');
  });

  // 9. /admin/najm/test-connection AJAX endpoint
  await testRoute('9. POST /admin/najm/test-connection returns diagnostic JSON', '/admin/najm/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'openrouter', model: 'test', apiToken: 'fake-token' })
  }, 200, (text) => {
    const json = JSON.parse(text);
    assert.strictEqual(typeof json.ok, 'boolean');
    assert.strictEqual(typeof json.latencyMs, 'number');
  });

  server.close();

  console.log(`\n========================================`);
  console.log(`HTTP Route Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  // Release the database handles this suite opened. Without this the
  // PostgreSQL pool and the session-store cleanup timer keep the event loop
  // alive indefinitely, so the process never exits and a runner can only
  // conclude the suite hung -- even though every check had already passed.
  try {
    const { closePgPool } = require('../config/pg-database');
    await closePgPool();
  } catch (_) { /* pool may not have been opened */ }

  process.exit(failed > 0 ? 1 : 0);
}

startAndTest();
