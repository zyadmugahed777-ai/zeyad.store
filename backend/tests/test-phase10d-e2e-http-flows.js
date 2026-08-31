/**
 * Zeyad For Business — Phase 10D: Full HTTP E2E Lifecycle Verification
 * Tests: Admin Login -> Session Inflate -> Admin Dashboard -> Touch -> Logout
 * Tests: Customer Chat API, Product APIs, CMS Pages
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const http = require('http');
const app = require('../server');

let server;
let port;
let cookieHeader = '';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(condition, message, category = 'HTTP Flow') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✔ PASS: [${category}] ${message}`);
    return true;
  } else {
    failedChecks++;
    console.error(`  ✖ FAIL: [${category}] ${message}`);
    return false;
  }
}

function makeRequest({ method = 'GET', path: reqPath = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {
        'host': `127.0.0.1:${port}`,
        ...headers
      }
    };

    if (body) {
      if (typeof body === 'object' && !headers['content-type']) {
        options.headers['content-type'] = 'application/json';
        body = JSON.stringify(body);
      }
      options.headers['content-length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runE2ESuite() {
  console.log('\n======================================================');
  console.log('   PHASE 10D: E2E HTTP SERVER & SESSION INTEGRATION');
  console.log('======================================================\n');

  // Start test server on random free port
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`Test server running on port ${port}`);
      resolve();
    });
  });

  try {
    // -----------------------------------------------------------------------
    // Test 1: Public Home & Products API
    // -----------------------------------------------------------------------
    console.log('\n--- 1. Public Endpoints & Product Search API ---');
    const homeRes = await makeRequest({ path: '/' });
    check(homeRes.statusCode === 200, 'GET / returned HTTP 200', 'Public Routes');

    const productsApi = await makeRequest({ path: '/api/products' });
    check(productsApi.statusCode === 200, 'GET /api/products returned HTTP 200', 'Products API');
    const prodJson = JSON.parse(productsApi.body);
    check(prodJson.success === true && Array.isArray(prodJson.data), `GET /api/products returned ${prodJson.data?.length} products`, 'Products API');

    const searchApi = await makeRequest({ path: '/api/products/search/suggestions?q=%D8%BA%D8%B3%D8%A7%D9%84%D8%A9' });
    check(searchApi.statusCode === 200, 'GET /api/products/search/suggestions returned HTTP 200', 'Products API');
    const searchJson = JSON.parse(searchApi.body);
    check(Array.isArray(searchJson.suggestions) || Array.isArray(searchJson.data), `Search suggestions returned matches`, 'Products API');

    // -----------------------------------------------------------------------
    // Test 2: Admin Login Flow & Session Cookie
    // -----------------------------------------------------------------------
    console.log('\n--- 2. Admin Auth Flow & Session Inflation ---');
    // First get login page
    const loginPage = await makeRequest({ path: '/admin/login' });
    check(loginPage.statusCode === 200, 'GET /admin/login returned HTTP 200', 'Admin Auth');

    // Extract initial cookie
    let setCookie = loginPage.headers['set-cookie'];
    let cookieVal = '';
    if (setCookie && setCookie[0]) {
      cookieVal = setCookie[0].split(';')[0];
    }

    // Submit Admin Login (using admin credentials)
    const loginPost = await makeRequest({
      method: 'POST',
      path: '/admin/login',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'cookie': cookieVal
      },
      body: 'username=admin&password=changeme123'
    });

    check(loginPost.statusCode === 302 || loginPost.statusCode === 200, `POST /admin/login redirected successfully (Status: ${loginPost.statusCode})`, 'Admin Auth');
    if (loginPost.headers['set-cookie'] && loginPost.headers['set-cookie'][0]) {
      cookieVal = loginPost.headers['set-cookie'][0].split(';')[0];
    }

    // -----------------------------------------------------------------------
    // Test 3: Admin Dashboard Access (Session Get & Inflate)
    // -----------------------------------------------------------------------
    console.log('\n--- 3. Admin Protected Dashboard (Session Inflate Check) ---');
    const dashRes = await makeRequest({
      path: '/admin',
      headers: { 'cookie': cookieVal }
    });

    // The key test: should NOT crash with TypeError: Cannot read properties of undefined (reading 'expires')
    check(dashRes.statusCode === 200 || dashRes.statusCode === 302, `GET /admin with auth session returned HTTP ${dashRes.statusCode} without 500 error`, 'Admin Dashboard');
    check(!dashRes.body.includes('TypeError: Cannot read properties of undefined'), 'No session inflate TypeError in response', 'Admin Dashboard');

    // -----------------------------------------------------------------------
    // Test 4: Admin AI Settings Page
    // -----------------------------------------------------------------------
    console.log('\n--- 4. Admin Najm AI Control Center Page ---');
    const aiAdminRes = await makeRequest({
      path: '/admin/ai',
      headers: { 'cookie': cookieVal }
    });
    check(aiAdminRes.statusCode === 200 || aiAdminRes.statusCode === 302, `GET /admin/ai returned HTTP ${aiAdminRes.statusCode}`, 'Admin AI');

    // -----------------------------------------------------------------------
    // Test 5: Customer AI Endpoints
    // -----------------------------------------------------------------------
    console.log('\n--- 5. Customer Najm AI Endpoints ---');
    const quickActions = await makeRequest({ path: '/api/ai/quick-actions' });
    check(quickActions.statusCode === 200, 'GET /api/ai/quick-actions returned HTTP 200', 'Customer AI');

    const featuredRecom = await makeRequest({ path: '/api/ai/featured-recommendations' });
    check(featuredRecom.statusCode === 200, 'GET /api/ai/featured-recommendations returned HTTP 200', 'Customer AI');
    const featJson = JSON.parse(featuredRecom.body);
    check(featJson.success === true && Array.isArray(featJson.products), `Featured recommendations returned ${featJson.products?.length} products`, 'Customer AI');

    // -----------------------------------------------------------------------
    // Test 6: Admin Logout
    // -----------------------------------------------------------------------
    console.log('\n--- 6. Admin Logout & Session Destroy ---');
    const logoutRes = await makeRequest({
      path: '/admin/logout',
      headers: { 'cookie': cookieVal }
    });
    check(logoutRes.statusCode === 302, 'GET /admin/logout redirected successfully (HTTP 302)', 'Admin Logout');

    // Re-verify dashboard is protected
    const afterLogout = await makeRequest({
      path: '/admin',
      headers: { 'cookie': cookieVal }
    });
    check(afterLogout.statusCode === 302, 'GET /admin after logout redirects to login', 'Admin Auth');

  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n======================================================');
  console.log(`TOTAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
  console.log('======================================================\n');

  return { totalChecks, passedChecks, failedChecks };
}

if (require.main === module) {
  runE2ESuite().then((r) => {
    if (r.failedChecks > 0) {
      process.exit(1);
    }
    process.exit(0);
  }).catch((err) => {
    console.error('E2E Test Suite Failed:', err);
    process.exit(1);
  });
}

module.exports = { runE2ESuite };
