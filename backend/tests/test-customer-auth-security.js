#!/usr/bin/env node
/**
 * Customer accounts & authentication -- security acceptance suite (AUTH-01..21).
 *
 * Black-box, over real HTTP, against a running server. Nothing is stubbed:
 * these assertions are about what an attacker can actually reach with a
 * socket, so they exercise the same middleware stack, the same session store
 * and the same database a browser would.
 *
 *   node tests/test-customer-auth-security.js            # starts its own server
 *   BASE_URL=http://localhost:3000 node tests/...        # reuse a running one
 *
 * With no BASE_URL the suite boots its own server on a free port and shuts it
 * down afterwards. That is not ceremony: the rate limiter is in-process and
 * in-memory, so a second run against a long-lived server inherits the first
 * run's counters and reports lockouts as security failures. A fresh process
 * per run makes the result mean the same thing every time.
 *
 * Two customers are created with random phone numbers, each tries to reach
 * the other's data, and the run deletes only the rows it created itself --
 * no pre-existing customer, order, address or cart is touched.
 */

const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const EXTERNAL_BASE_URL = process.env.BASE_URL || null;
const OWN_PORT = 3200 + Math.floor(Math.random() * 300);
const BASE_URL = EXTERNAL_BASE_URL || `http://127.0.0.1:${OWN_PORT}`;

let serverProcess = null;

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return true;
    } catch (_) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function startOwnServer() {
  serverProcess = spawn(process.execPath, [path.resolve(__dirname, '..', 'server.js')], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(OWN_PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let startupLog = '';
  serverProcess.stdout.on('data', d => { startupLog += d.toString(); });
  serverProcess.stderr.on('data', d => { startupLog += d.toString(); });

  const up = await waitForHealth();
  if (!up) {
    console.error(`\n  Test server did not come up on port ${OWN_PORT}.\n${startupLog}`);
    stopOwnServer();
    process.exit(2);
  }
  console.log(`  Test server started on port ${OWN_PORT}.`);
}

function stopOwnServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

let passed = 0;
let failed = 0;
const failures = [];

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

/**
 * A tiny cookie-jar HTTP client. Each instance is one browser: it keeps its
 * own cookies, so "customer A tries to read customer B's order" is expressed
 * as two clients rather than by hand-editing headers.
 */
function createClient(label) {
  const jar = new Map();

  async function request(method, urlPath, { body, headers = {}, json = true } = {}) {
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    const finalHeaders = { Accept: 'application/json', ...headers };
    if (cookieHeader) finalHeaders.Cookie = cookieHeader;
    if (body !== undefined && json && !finalHeaders['Content-Type']) {
      finalHeaders['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${BASE_URL}${urlPath}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : (json ? JSON.stringify(body) : body),
      redirect: 'manual'
    });

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) jar.delete(name);
      else jar.set(name, value);
    }

    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) { /* not JSON: kept as raw */ }

    return { status: res.status, body: parsed, raw: text, headers: res.headers, setCookies };
  }

  return {
    label,
    jar,
    get: (p, o) => request('GET', p, o),
    post: (p, body, o) => request('POST', p, { ...o, body }),
    put: (p, body, o) => request('PUT', p, { ...o, body }),
    del: (p, body, o) => request('DELETE', p, { ...o, body })
  };
}

/** A phone number no real customer can already own. */
function randomPhone() {
  return `79${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`;
}

const created = { customerIds: [], orderIds: [], addressIds: [] };

async function main() {
  console.log(`\nCustomer auth & isolation suite -- ${BASE_URL}\n`);

  if (EXTERNAL_BASE_URL) {
    try {
      const health = await fetch(`${BASE_URL}/api/health`);
      if (!health.ok) throw new Error(`health check returned ${health.status}`);
    } catch (err) {
      console.error(`\n  Cannot reach ${BASE_URL} -- ${err.message}\n`);
      process.exit(2);
    }
    console.log('  NOTE: reusing an external server. Its rate-limit counters are shared\n' +
                '        with anything else that has been talking to it, so AUTH-18 and the\n' +
                '        login checks may report lockouts that are not defects.\n');
  } else {
    await startOwnServer();
  }

  const alice = createClient('A');
  const bob = createClient('B');
  const anon = createClient('anon');

  const alicePhone = randomPhone();
  const bobPhone = randomPhone();
  const PASSWORD = 'CorrectHorse42';

  // ---------------------------------------------------------------- AUTH-01
  console.log('\n-- Registration & login --');
  const regA = await alice.post('/api/auth/register', {
    name: 'أليس التجريبية', phone: alicePhone, password: PASSWORD, confirmPassword: PASSWORD
  });
  check('AUTH-01', 'registration creates an account and signs in',
    regA.status === 201 && regA.body?.success === true && regA.body?.data?.id > 0,
    `status=${regA.status} body=${JSON.stringify(regA.body)}`);
  const aliceId = regA.body?.data?.id;
  if (aliceId) created.customerIds.push(aliceId);

  const regB = await bob.post('/api/auth/register', {
    name: 'بوب التجريبي', phone: bobPhone, password: PASSWORD, confirmPassword: PASSWORD
  });
  const bobId = regB.body?.data?.id;
  if (bobId) created.customerIds.push(bobId);

  // ---------------------------------------------------------------- AUTH-02
  const dupe = await anon.post('/api/auth/register', {
    name: 'منتحل', phone: alicePhone, password: 'AnotherPass99', confirmPassword: 'AnotherPass99'
  });
  check('AUTH-02', 'duplicate phone number is rejected',
    dupe.status === 409 && dupe.body?.code === 'PHONE_TAKEN',
    `status=${dupe.status} body=${JSON.stringify(dupe.body)}`);

  // Same number written a different way must collide too, or "unique phone"
  // is only true for callers who type it the way we happen to expect.
  const dupeVariant = await anon.post('/api/auth/register', {
    name: 'منتحل', phone: `+967${alicePhone}`, password: 'AnotherPass99', confirmPassword: 'AnotherPass99'
  });
  check('AUTH-02b', 'duplicate phone in a different spelling (+967...) is rejected',
    dupeVariant.status === 409,
    `status=${dupeVariant.status} body=${JSON.stringify(dupeVariant.body)}`);

  // Mismatched confirmation, short password, missing name.
  const badConfirm = await anon.post('/api/auth/register', {
    name: 'س', phone: randomPhone(), password: PASSWORD, confirmPassword: 'Different1'
  });
  check('AUTH-15a', 'server rejects mismatched password confirmation',
    badConfirm.status === 400, `status=${badConfirm.status}`);

  const shortPass = await anon.post('/api/auth/register', {
    name: 'اسم صحيح', phone: randomPhone(), password: 'abc', confirmPassword: 'abc'
  });
  check('AUTH-15b', 'server rejects a too-short password',
    shortPass.status === 400, `status=${shortPass.status}`);

  const noName = await anon.post('/api/auth/register', {
    name: '', phone: randomPhone(), password: PASSWORD, confirmPassword: PASSWORD
  });
  check('AUTH-15c', 'server rejects an empty name',
    noName.status === 400, `status=${noName.status}`);

  // ---------------------------------------------------------------- AUTH-03
  const wrongPass = await anon.post('/api/auth/login', { phone: alicePhone, password: 'WrongPassword1' });
  check('AUTH-03', 'wrong password is rejected',
    wrongPass.status === 401 && !wrongPass.body?.data,
    `status=${wrongPass.status} body=${JSON.stringify(wrongPass.body)}`);

  const noSuchUser = await anon.post('/api/auth/login', { phone: randomPhone(), password: 'WrongPassword1' });
  check('AUTH-03b', 'unknown phone and wrong password are indistinguishable (no user enumeration)',
    noSuchUser.status === wrongPass.status && noSuchUser.body?.error === wrongPass.body?.error,
    `unknown=${noSuchUser.status}/${noSuchUser.body?.error} known=${wrongPass.status}/${wrongPass.body?.error}`);

  // ---------------------------------------------------------------- AUTH-04
  const freshAlice = createClient('A2');
  const loginA = await freshAlice.post('/api/auth/login', { phone: alicePhone, password: PASSWORD });
  check('AUTH-04', 'correct credentials log in',
    loginA.status === 200 && loginA.body?.data?.id === aliceId,
    `status=${loginA.status} body=${JSON.stringify(loginA.body)}`);

  const loginVariant = await createClient('A3').post('/api/auth/login', { phone: `00967${alicePhone}`, password: PASSWORD });
  check('AUTH-04b', 'login works with the same number written as 00967...',
    loginVariant.status === 200 && loginVariant.body?.data?.id === aliceId,
    `status=${loginVariant.status}`);

  // ------------------------------------------------------------ AUTH-06/07
  console.log('\n-- Credential exposure --');
  const meA = await alice.get('/api/auth/me');
  const bodies = [
    JSON.stringify(regA.body), JSON.stringify(loginA.body), JSON.stringify(meA.body)
  ].join(' ');
  check('AUTH-06', 'plaintext password never appears in any response',
    !bodies.includes(PASSWORD), 'password string found in a response body');
  check('AUTH-07', 'password hash never appears in any response',
    !/password_hash|passwordHash|\$2[aby]\$/.test(bodies), 'a bcrypt hash or hash field found in a response body');

  // ---------------------------------------------------------------- AUTH-08
  console.log('\n-- Customer data isolation --');
  check('AUTH-08', 'a signed-in customer sees their own account',
    meA.status === 200 && meA.body?.authenticated === true && meA.body?.data?.id === aliceId,
    `body=${JSON.stringify(meA.body)}`);

  // ---------------------------------------------------------------- AUTH-09
  const meAnon = await anon.get('/api/auth/me');
  check('AUTH-09a', 'an anonymous caller is told nothing about anyone',
    meAnon.status === 200 && meAnon.body?.authenticated === false && meAnon.body?.data === null,
    `body=${JSON.stringify(meAnon.body)}`);

  const meByPhone = await alice.get(`/api/auth/me?phone=${encodeURIComponent(bobPhone)}`);
  check('AUTH-09b', '?phone= cannot make /me answer about another customer',
    meByPhone.body?.data?.id === aliceId,
    `A asked about B and got id=${meByPhone.body?.data?.id} (B is ${bobId})`);

  const profileHijack = await alice.post('/api/auth/profile', {
    phone: bobPhone, firstName: 'مخترق', lastName: 'حساب', name: 'مخترق حساب'
  });
  const bobAfter = await bob.get('/api/auth/me');
  check('AUTH-09c', 'a phone number in the profile body cannot redirect the update at another customer',
    bobAfter.body?.data?.firstName !== 'مخترق',
    `B's first name is now "${bobAfter.body?.data?.firstName}" after A posted with B's phone (status ${profileHijack.status})`);

  const bobPhoneAfter = bobAfter.body?.data?.phone;
  const aliceAfterProfile = await alice.get('/api/auth/me');
  check('AUTH-09d', 'the profile endpoint cannot be used to change the account phone number',
    aliceAfterProfile.body?.data?.phone !== bobPhone && bobPhoneAfter !== undefined,
    `A's phone is now ${aliceAfterProfile.body?.data?.phone}`);

  // Mass assignment: privileged columns must not be writable through profile.
  await alice.post('/api/auth/profile', {
    name: 'أليس التجريبية', total_spent: 999999, totalSpent: 999999, password_hash: 'x', id: bobId
  });
  const aliceMass = await alice.get('/api/auth/me');
  check('AUTH-MA', 'profile update ignores unlisted fields (no mass assignment)',
    aliceMass.body?.data?.id === aliceId && Number(aliceMass.body?.data?.totalSpent) !== 999999,
    `id=${aliceMass.body?.data?.id} totalSpent=${aliceMass.body?.data?.totalSpent}`);

  // ------------------------------------------------------------ AUTH-10 orders
  console.log('\n-- Orders --');
  const productRes = await anon.get('/api/products?limit=1');
  const product = productRes.body?.data?.[0] || productRes.body?.products?.[0] || null;

  let bobOrderId = null;
  if (product) {
    const orderRes = await bob.post('/api/orders', {
      customer: { firstName: 'بوب', lastName: 'التجريبي', phone: bobPhone },
      items: [{ id: product.id || product.product_id, quantity: 1 }],
      paymentMethod: 'cash-on-delivery',
      city: 'صنعاء'
    });
    bobOrderId = orderRes.body?.orderId || null;
    if (bobOrderId) created.orderIds.push(bobOrderId);
  }

  if (bobOrderId) {
    const aliceReadsBobOrder = await alice.get(`/api/orders/${encodeURIComponent(bobOrderId)}`);
    check('AUTH-10', "customer A cannot read customer B's order by id",
      aliceReadsBobOrder.status === 404 && !aliceReadsBobOrder.body?.data,
      `status=${aliceReadsBobOrder.status} body=${JSON.stringify(aliceReadsBobOrder.body).slice(0, 200)}`);

    const anonReadsOrder = await anon.get(`/api/orders/${encodeURIComponent(bobOrderId)}`);
    check('AUTH-10b', 'an anonymous caller cannot read an order by id',
      anonReadsOrder.status === 401 || anonReadsOrder.status === 404,
      `status=${anonReadsOrder.status} body=${JSON.stringify(anonReadsOrder.body).slice(0, 200)}`);

    const bobReadsOwn = await bob.get(`/api/orders/${encodeURIComponent(bobOrderId)}`);
    check('AUTH-10c', 'customer B can read their own order',
      bobReadsOwn.status === 200 && bobReadsOwn.body?.data?.order_id,
      `status=${bobReadsOwn.status}`);

    const trackNoPhone = await anon.post('/api/orders/track', { orderNumber: bobOrderId });
    check('AUTH-16a', 'guest tracking refuses an order number without the matching phone',
      trackNoPhone.status === 400 || trackNoPhone.status === 404,
      `status=${trackNoPhone.status} body=${JSON.stringify(trackNoPhone.body).slice(0, 200)}`);

    const trackWrongPhone = await anon.post('/api/orders/track', { orderNumber: bobOrderId, phone: alicePhone });
    check('AUTH-16b', 'guest tracking refuses an order number paired with the wrong phone',
      trackWrongPhone.status === 404,
      `status=${trackWrongPhone.status}`);

    const trackRight = await anon.post('/api/orders/track', { orderNumber: bobOrderId, phone: bobPhone });
    check('AUTH-16c', 'guest tracking still works with the correct order number + phone pair',
      trackRight.status === 200 && trackRight.body?.count === 1,
      `status=${trackRight.status} body=${JSON.stringify(trackRight.body).slice(0, 200)}`);

    const legacyNoPhone = await anon.post('/api/track-order', { orderNumber: bobOrderId });
    check('AUTH-16d', 'the legacy /api/track-order refuses an order number alone',
      legacyNoPhone.status === 400 || legacyNoPhone.status === 404,
      `status=${legacyNoPhone.status}`);

    const legacyRight = await anon.post('/api/track-order', { orderNumber: bobOrderId, phone: bobPhone });
    check('AUTH-16e', 'the legacy /api/track-order works with the correct pair (and is no longer an empty Promise)',
      legacyRight.status === 200 && legacyRight.body?.data?.order_id === bobOrderId,
      `status=${legacyRight.status} body=${JSON.stringify(legacyRight.body).slice(0, 200)}`);

    const aiTrackShortPhone = await anon.get(`/api/ai/track-order?orderId=${encodeURIComponent(bobOrderId)}&phone=7`);
    check('AUTH-16f', "Najm's order tracking rejects a one-digit phone (substring bypass closed)",
      aiTrackShortPhone.status === 404 || aiTrackShortPhone.body?.success === false,
      `status=${aiTrackShortPhone.status} body=${JSON.stringify(aiTrackShortPhone.body).slice(0, 200)}`);
  } else {
    check('AUTH-10', 'order isolation', false, 'could not create a test order -- no product available');
  }

  const myOrdersA = await alice.get('/api/orders/my-orders');
  const aliceSeesForeign = (myOrdersA.body?.data || []).some(o => Number(o.customer_id) !== Number(aliceId));
  check('AUTH-08b', 'my-orders returns only the session customer\'s own orders',
    myOrdersA.status === 200 && !aliceSeesForeign,
    `returned ${myOrdersA.body?.count} orders, foreign rows present: ${aliceSeesForeign}`);

  const myOrdersByPhone = await alice.get(`/api/orders/my-orders?phone=${encodeURIComponent(bobPhone)}`);
  const leakedViaPhone = (myOrdersByPhone.body?.data || []).some(o => Number(o.customer_id) === Number(bobId));
  check('AUTH-09e', '?phone= cannot make my-orders return another customer\'s orders',
    !leakedViaPhone, 'B\'s orders came back when A passed B\'s phone');

  const myOrdersAnon = await anon.get('/api/orders/my-orders');
  check('AUTH-09f', 'my-orders refuses an anonymous caller (no store-wide fallback)',
    myOrdersAnon.status === 401,
    `status=${myOrdersAnon.status} count=${myOrdersAnon.body?.count}`);

  const myOrdersGuestHeader = await anon.get('/api/orders/my-orders', { headers: { 'x-guest-id': 'guest-anything' } });
  check('AUTH-09g', 'a guest-id header cannot unlock the store-wide order list',
    myOrdersGuestHeader.status === 401,
    `status=${myOrdersGuestHeader.status} count=${myOrdersGuestHeader.body?.count}`);

  // ------------------------------------------------------------ AUTH-11/12 cart
  console.log('\n-- Cart --');
  if (product) {
    await bob.post('/api/cart/add', { productId: product.product_id || product.id, quantity: 2 });
    const bobCart = await bob.get('/api/cart');
    const bobCartId = bobCart.body?.cart_id;

    const aliceCart = await alice.get('/api/cart');
    check('AUTH-11', "customer A's cart is not customer B's cart",
      aliceCart.body?.cart_id !== bobCartId && (aliceCart.body?.count || 0) === 0,
      `A cart_id=${aliceCart.body?.cart_id} B cart_id=${bobCartId} A count=${aliceCart.body?.count}`);

    // A signed-in customer sending B's guest header must still get their own
    // cart -- the session wins, the caller-written header is ignored.
    const aliceWithGuestHeader = await alice.get('/api/cart', { headers: { 'x-guest-id': `guest-${bobId}` } });
    check('AUTH-11b', 'a guest-id header cannot redirect a signed-in customer to another cart',
      aliceWithGuestHeader.body?.cart_id === aliceCart.body?.cart_id,
      `with header cart_id=${aliceWithGuestHeader.body?.cart_id}, own cart_id=${aliceCart.body?.cart_id}`);

    await alice.post('/api/cart/add', { productId: product.product_id || product.id, quantity: 1 });
    const bobCartAfter = await bob.get('/api/cart');
    check('AUTH-12', "customer A's cart writes do not reach customer B's cart",
      bobCartAfter.body?.cart_id === bobCartId && bobCartAfter.body?.count === bobCart.body?.count,
      `B count before=${bobCart.body?.count} after=${bobCartAfter.body?.count}`);
  }

  // -------------------------------------------------------------- AUTH-13 addresses
  console.log('\n-- Addresses --');
  const bobAddr = await bob.post('/api/addresses', {
    title: 'منزل بوب', city: 'صنعاء', province: 'صنعاء', address_line: 'شارع الاختبار'
  });
  const bobAddrId = bobAddr.body?.data?.id;
  if (bobAddrId) created.addressIds.push(bobAddrId);

  if (bobAddrId) {
    const aliceReads = await alice.get(`/api/addresses/${bobAddrId}`);
    check('AUTH-13', "customer A cannot read customer B's address",
      aliceReads.status === 404 && !aliceReads.body?.data,
      `status=${aliceReads.status} body=${JSON.stringify(aliceReads.body).slice(0, 200)}`);

    const anonReads = await anon.get(`/api/addresses/${bobAddrId}`);
    check('AUTH-13b', 'an identity-less caller cannot read an address by id',
      anonReads.status === 401 || anonReads.status === 404,
      `status=${anonReads.status} body=${JSON.stringify(anonReads.body).slice(0, 200)}`);

    const aliceWrites = await alice.put(`/api/addresses/${bobAddrId}`, { title: 'اختراق', city: 'عدن' });
    const bobAddrAfter = await bob.get(`/api/addresses/${bobAddrId}`);
    check('AUTH-13c', "customer A cannot modify customer B's address",
      bobAddrAfter.body?.data?.title === 'منزل بوب',
      `title is now "${bobAddrAfter.body?.data?.title}" (A's PUT returned ${aliceWrites.status})`);

    const aliceDeletes = await alice.del(`/api/addresses/${bobAddrId}`);
    const bobAddrStill = await bob.get(`/api/addresses/${bobAddrId}`);
    check('AUTH-13d', "customer A cannot delete customer B's address",
      bobAddrStill.status === 200 && bobAddrStill.body?.data?.id === bobAddrId,
      `A's DELETE returned ${aliceDeletes.status}; B's address now ${bobAddrStill.status}`);

    // Mass assignment: an unauthenticated caller naming a victim in the body.
    const injected = await anon.post('/api/addresses', {
      customerId: bobId, title: 'مزروع', city: 'صنعاء'
    }, { headers: { 'x-guest-id': 'attacker-guest' } });
    const bobList = await bob.get('/api/addresses');
    const plantedFound = (bobList.body?.data || []).some(a => a.title === 'مزروع');
    check('AUTH-13e', 'customerId in the request body cannot file an address into another account',
      !plantedFound,
      `planted address landed in B's list (create returned ${injected.status})`);
  } else {
    check('AUTH-13', 'address isolation', false, `could not create a test address: ${JSON.stringify(bobAddr.body)}`);
  }

  // -------------------------------------------------------------- AUTH-14/15 admin
  console.log('\n-- Admin separation --');
  const adminPage = await alice.get('/admin/dashboard', { headers: { Accept: 'text/html' } });
  check('AUTH-14a', 'a customer session cannot open the admin dashboard',
    adminPage.status === 302 || adminPage.status === 401 || adminPage.status === 403,
    `status=${adminPage.status}`);

  const adminApi = await alice.get('/api/admin/ai/conversations');
  check('AUTH-14b', 'a customer session cannot reach admin APIs',
    adminApi.status === 401 || adminApi.status === 403 || adminApi.status === 302 || adminApi.status === 404,
    `status=${adminApi.status}`);

  const adminOrders = await alice.get('/admin/orders', { headers: { Accept: 'text/html' } });
  check('AUTH-14c', 'a customer session cannot list orders through the admin panel',
    adminOrders.status === 302 || adminOrders.status === 401 || adminOrders.status === 403,
    `status=${adminOrders.status}`);

  // A customer session must not carry an admin object at all -- that is the
  // structural reason the three checks above hold.
  const sessionShape = await alice.get('/api/auth/me');
  check('AUTH-15', 'customer sessions and admin sessions stay separate',
    sessionShape.body?.data && !('role' in sessionShape.body.data) && !('role_id' in sessionShape.body.data),
    `customer payload: ${JSON.stringify(sessionShape.body?.data)}`);

  // -------------------------------------------------------------- AUTH-17 SQLi
  console.log('\n-- Injection --');
  const injections = [
    "' OR '1'='1",
    "'; DROP TABLE customers; --",
    "' UNION SELECT id, password_hash, phone FROM customers --",
    `${alicePhone}' --`
  ];
  let injectionLoggedIn = false;
  for (const payload of injections) {
    const res = await anon.post('/api/auth/login', { phone: payload, password: payload });
    if (res.status === 200 && res.body?.success) injectionLoggedIn = true;
  }
  check('AUTH-17a', 'SQL injection in the login form does not authenticate anyone',
    !injectionLoggedIn, 'an injection payload produced a successful login');

  const stillThere = await createClient('A4').post('/api/auth/login', { phone: alicePhone, password: PASSWORD });
  check('AUTH-17b', 'the customers table survived the injection attempts',
    stillThere.status === 200, `login after injection returned ${stillThere.status}`);

  const xssName = '<img src=x onerror=alert(1)>';
  await alice.post('/api/auth/profile', { name: xssName });
  const xssBack = await alice.get('/api/auth/me');
  check('AUTH-XSS', 'markup in a name is returned as data, never as executable HTML',
    xssBack.headers.get('content-type')?.includes('application/json'),
    `content-type=${xssBack.headers.get('content-type')}`);
  await alice.post('/api/auth/profile', { name: 'أليس التجريبية' });

  // -------------------------------------------------------------- AUTH-18 brute force
  console.log('\n-- Rate limiting --');
  const bruteforcer = createClient('brute');
  const brutePhone = randomPhone();
  let sawRateLimit = false;
  let attempts = 0;
  for (let i = 0; i < 15; i++) {
    attempts++;
    const res = await bruteforcer.post('/api/auth/login', { phone: brutePhone, password: `guess-${i}` });
    if (res.status === 429) { sawRateLimit = true; break; }
  }
  check('AUTH-18', 'repeated failed logins are rate limited',
    sawRateLimit, `made ${attempts} failed attempts with no 429`);

  // ---------------------------------------------------------- AUTH-05/19 logout
  console.log('\n-- Session lifecycle --');
  const sessionBeforeLogout = alice.jar.get('connect.sid');
  const logout = await alice.post('/api/auth/logout', {});
  check('AUTH-05', 'logout succeeds',
    logout.status === 200 && logout.body?.success === true,
    `status=${logout.status} body=${JSON.stringify(logout.body)}`);

  const afterLogout = await alice.get('/api/auth/me');
  check('AUTH-19a', 'the session is unauthenticated after logout',
    afterLogout.body?.authenticated === false,
    `body=${JSON.stringify(afterLogout.body)}`);

  const afterLogoutOrders = await alice.get('/api/orders/my-orders');
  check('AUTH-19b', 'protected endpoints refuse the logged-out session',
    afterLogoutOrders.status === 401, `status=${afterLogoutOrders.status}`);

  // Replaying the pre-logout cookie must not work: the session row is gone
  // server-side, not merely forgotten by the browser.
  const replay = createClient('replay');
  if (sessionBeforeLogout) replay.jar.set('connect.sid', sessionBeforeLogout);
  const replayed = await replay.get('/api/auth/me');
  check('AUTH-19c', 'replaying the pre-logout cookie does not restore the session',
    replayed.body?.authenticated === false,
    `body=${JSON.stringify(replayed.body)}`);

  // Session fixation, played out as the actual attack.
  //
  // The attacker cannot obtain a session id merely by browsing -- the server
  // runs saveUninitialized:false, so an anonymous request that writes nothing
  // to the session gets no cookie at all. Checked first, because it is the
  // outer wall.
  const browsing = createClient('browsing');
  await browsing.get('/api/auth/me');
  await browsing.get('/api/cart');
  check('AUTH-SF0', 'browsing anonymously is not handed a session id to fixate',
    !browsing.jar.get('connect.sid'),
    `anonymous browsing received connect.sid=${browsing.jar.get('connect.sid')}`);

  // So the attacker uses a session id they legitimately hold -- their own --
  // and plants it in the victim's browser before the victim signs in.
  const attacker = createClient('attacker');
  await attacker.post('/api/auth/login', { phone: bobPhone, password: PASSWORD });
  const plantedSid = attacker.jar.get('connect.sid');

  const victim = createClient('victim');
  victim.jar.set('connect.sid', plantedSid);
  await victim.post('/api/auth/login', { phone: bobPhone, password: PASSWORD });
  const victimSid = victim.jar.get('connect.sid');

  check('AUTH-SF', 'login regenerates the session id, so a planted id is not carried into the session',
    Boolean(plantedSid) && Boolean(victimSid) && plantedSid !== victimSid,
    `planted=${String(plantedSid).slice(0, 16)}... after login=${String(victimSid).slice(0, 16)}...`);

  // And the id the attacker kept a copy of is dead, not merely superseded.
  const attackerReplay = createClient('attacker-replay');
  attackerReplay.jar.set('connect.sid', plantedSid);
  const stolen = await attackerReplay.get('/api/auth/me');
  check('AUTH-SF2', 'the planted session id no longer identifies anyone after the victim logs in',
    stolen.body?.authenticated === false,
    `replay of the planted id returned ${JSON.stringify(stolen.body)}`);

  // -------------------------------------------------------------- AUTH-20 cookie flags
  const loginForFlags = createClient('flags');
  const flagRes = await loginForFlags.post('/api/auth/login', { phone: bobPhone, password: PASSWORD });
  const sessionCookie = (flagRes.setCookies || []).find(c => c.startsWith('connect.sid'));
  check('AUTH-20a', 'the session cookie is HttpOnly',
    Boolean(sessionCookie) && /HttpOnly/i.test(sessionCookie),
    `cookie: ${sessionCookie}`);
  check('AUTH-20b', 'the session cookie sets SameSite',
    Boolean(sessionCookie) && /SameSite=/i.test(sessionCookie),
    `cookie: ${sessionCookie}`);

  // -------------------------------------------------------------- CSRF shape
  const formPost = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' },
    body: `phone=${alicePhone}&password=${PASSWORD}`,
    redirect: 'manual'
  });
  check('AUTH-CSRF', 'a cross-origin HTML form post to login is refused',
    formPost.status === 403 || formPost.status === 415,
    `status=${formPost.status}`);

  // -------------------------------------------------------------- AUTH-21 no OTP
  console.log('\n-- No OTP --');
  const otpRoutes = ['/api/auth/otp', '/api/auth/verify-otp', '/api/auth/send-otp', '/api/auth/verify', '/api/otp'];
  const otpResults = [];
  for (const route of otpRoutes) {
    const res = await anon.post(route, {});
    otpResults.push(`${route}:${res.status}`);
  }
  check('AUTH-21a', 'no OTP endpoint exists',
    otpResults.every(r => r.endsWith(':404')), otpResults.join(' '));

  console.log('\n' + '='.repeat(70));
  console.log(`  passed: ${passed}    failed: ${failed}`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    - ${f}`));
  }
  console.log('='.repeat(70) + '\n');

  await cleanup();
  stopOwnServer();
  process.exit(failed === 0 ? 0 : 1);
}

/**
 * Remove only what this run created. Deliberately narrow: it deletes by the
 * exact ids captured above and never issues a broad DELETE, so a bug here
 * cannot take real customer data with it.
 */
async function cleanup() {
  if (!created.customerIds.length) return;
  try {
    const { getPgPool } = require('../config/pg-database');
    const pool = getPgPool();
    const ids = created.customerIds;

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
    console.warn(`  Cleanup incomplete (${err.message}). Test customer ids: ${created.customerIds.join(', ')}\n`);
  }
}

main().catch(async err => {
  console.error('\nSuite crashed:', err);
  await cleanup();
  process.exit(3);
});
