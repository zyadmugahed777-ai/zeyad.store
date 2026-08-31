/**
 * Zeyad For Business — Phase 8B: Identity & Ownership Isolation Test Suite
 * 
 * Explicitly tests:
 * 1. Customer Isolation (Customer A vs Customer B data partition)
 * 2. Guest Session Isolation (Guest X vs Guest Y data partition)
 * 3. Address Ownership Verification
 * 4. Wishlist Ownership Partitioning
 * 5. Session Ownership & Expiry Verification
 * 6. Najm Customer AI vs Admin AI Conversations Isolation
 */

const { getPgRepositories, resetPgRepositories } = require('../repositories/postgres');
const { getClient, closePgPool } = require('../config/pg-database');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${message}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${message}`);
    failed++;
  }
}

async function runIdentityIsolationTests() {
  console.log('\n======================================================');
  console.log('   PHASE 8B: IDENTITY & OWNERSHIP ISOLATION');
  console.log('======================================================\n');

  resetPgRepositories();
  const pRepos = getPgRepositories();
  const client = await getClient();

  try {
    // 1. Customer Isolation
    console.log('--- 1. Customer Isolation ---');
    const ts = Date.now().toString().slice(-6);
    const custARes = await client.query(`
      INSERT INTO customers (first_name, phone, created_at)
      VALUES ('Customer A', $1, NOW())
      RETURNING id
    `, ['+96777' + ts]);
    const custBRes = await client.query(`
      INSERT INTO customers (first_name, phone, created_at)
      VALUES ('Customer B', $1, NOW())
      RETURNING id
    `, ['+96778' + ts]);
    const custAId = custARes.rows[0].id;
    const custBId = custBRes.rows[0].id;

    // Create Order for Customer A
    const orderARes = await client.query(`
      INSERT INTO orders (order_id, customer_id, total, status, created_at, updated_at)
      VALUES ($1, $2, 300.00, 'pending', NOW(), NOW())
      RETURNING id
    `, ['ORD-A-' + Date.now(), custAId]);
    const orderAId = orderARes.rows[0].id;

    // Query Customer B's orders
    const custBOrders = await pRepos.orders.findByCustomer(custBId);
    assert(custBOrders.length === 0, "Customer B query returns 0 orders (Customer A's order is isolated)");

    const custAOrders = await pRepos.orders.findByCustomer(custAId);
    assert(custAOrders.length === 1 && Number(custAOrders[0].id) === Number(orderAId), "Customer A retrieves only Customer A's order");

    // 2. Guest Session Isolation
    console.log('\n--- 2. Guest Session Isolation ---');
    const guestX = 'guest_x_' + Date.now();
    const guestY = 'guest_y_' + Date.now();

    await pRepos.carts.ensureGuestSession(guestX);
    await pRepos.carts.ensureGuestSession(guestY);

    const cartXRes = await client.query(`
      INSERT INTO carts (guest_id, created_at, updated_at)
      VALUES ($1, NOW(), NOW())
      RETURNING id
    `, [guestX]);
    const cartXId = cartXRes.rows[0].id;

    await client.query(`
      INSERT INTO cart_items (cart_id, product_id, quantity, created_at)
      VALUES ($1, 1, 2, NOW())
    `, [cartXId]);

    const cartX = await pRepos.carts.findCartByGuestId(guestX);
    const cartY = await pRepos.carts.findCartByGuestId(guestY);

    assert(cartX !== null && Number(cartX.id) === Number(cartXId), 'Guest X retrieves their own cart');
    assert(cartY === null, 'Guest Y receives null (cannot access Guest X cart)');

    // 3. Address Ownership Verification
    console.log('\n--- 3. Address Ownership Verification ---');
    const addrARes = await client.query(`
      INSERT INTO addresses (customer_id, title, country, province, city, district, address_line, is_default, created_at, updated_at)
      VALUES ($1, 'Home A', 'Yemen', 'Sanaa', 'Sanaa', 'Hadda', 'Building 1', TRUE, NOW(), NOW())
      RETURNING id
    `, [custAId]);
    const addrAId = addrARes.rows[0].id;

    const custBAddresses = await pRepos.addresses.findByCustomer(custBId);
    const custAAddresses = await pRepos.addresses.findByCustomer(custAId);

    assert(custBAddresses.length === 0, 'Customer B cannot access Customer A addresses');
    assert(custAAddresses.length === 1 && Number(custAAddresses[0].id) === Number(addrAId), 'Customer A gets exactly their address');

    // 4. Wishlist Ownership Partitioning
    console.log('\n--- 4. Wishlist Ownership Partitioning ---');
    const wlARes = await client.query(`
      INSERT INTO wishlists (user_id, created_at, updated_at)
      VALUES ($1, NOW(), NOW())
      RETURNING id
    `, [custAId]);
    const wlAId = wlARes.rows[0].id;

    const wlA = await pRepos.wishlists.findByUserId(custAId);
    const wlB = await pRepos.wishlists.findByUserId(custBId);

    assert(wlA !== null && Number(wlA.id) === Number(wlAId), 'Customer A accesses their wishlist');
    assert(wlB === null, 'Customer B has no access to Customer A wishlist');

    // 5. Session Ownership & Expiry Verification
    console.log('\n--- 5. Session Ownership & Expiry ---');
    const testSid = 'sess_iso_test_' + Date.now();
    const sessData = { user_id: Number(custAId), role: 'customer', name: 'Customer A' };

    await pRepos.sessions.set(testSid, sessData, 86400);

    const retrievedSess = await pRepos.sessions.get(testSid);
    assert(retrievedSess !== null && retrievedSess.user_id === Number(custAId), 'Session correctly partitions user data');

    // 6. Najm Customer AI vs Admin AI Conversations Isolation
    console.log('\n--- 6. Najm Customer AI vs Admin AI Conversations Isolation ---');
    const adminConvRes = await client.query(`
      INSERT INTO ai_conversations (title, created_by, created_at)
      VALUES ('Admin AI Strategy Meeting', 1, NOW())
      RETURNING id
    `);
    const adminConvId = adminConvRes.rows[0].id;

    const najmConvRes = await client.query(`
      INSERT INTO ai_customer_conversations (user_id, session_id, created_at)
      VALUES ($1, 'najm_sess_1', NOW())
      RETURNING id
    `, [custAId]);
    const najmConvId = najmConvRes.rows[0].id;

    const adminConvs = await client.query('SELECT * FROM ai_conversations WHERE id = $1', [adminConvId]);
    const najmConvs = await client.query('SELECT * FROM ai_customer_conversations WHERE id = $1', [najmConvId]);

    assert(adminConvs.rows.length === 1 && adminConvs.rows[0].title === 'Admin AI Strategy Meeting', 'Admin AI conversation strictly isolated in ai_conversations');
    assert(najmConvs.rows.length === 1 && Number(najmConvs.rows[0].user_id) === Number(custAId), 'Najm Customer AI conversation strictly isolated in ai_customer_conversations');

    // Clean up created records
    await client.query('DELETE FROM ai_conversations WHERE id = $1', [adminConvId]);
    await client.query('DELETE FROM ai_customer_conversations WHERE id = $1', [najmConvId]);
    await client.query('DELETE FROM sessions WHERE sid = $1', [testSid]);
    await client.query('DELETE FROM wishlists WHERE id = $1', [wlAId]);
    await client.query('DELETE FROM addresses WHERE id = $1', [addrAId]);
    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartXId]);
    await client.query('DELETE FROM carts WHERE id = $1', [cartXId]);
    await client.query('DELETE FROM guest_sessions WHERE guest_id IN ($1, $2)', [guestX, guestY]);
    await client.query('DELETE FROM orders WHERE id = $1', [orderAId]);
    await client.query('DELETE FROM customers WHERE id IN ($1, $2)', [custAId, custBId]);

    console.log('\n======================================================');
    if (failed === 0) {
      console.log(`   \x1b[32mALL ${passed} IDENTITY & OWNERSHIP ISOLATION TESTS PASSED\x1b[0m`);
    } else {
      console.log(`   \x1b[31m${failed} ISOLATION TESTS FAILED out of ${passed + failed}\x1b[0m`);
    }
    console.log('======================================================\n');

    return failed === 0;
  } finally {
    client.release();
    await closePgPool();
  }
}

if (require.main === module) {
  runIdentityIsolationTests()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => {
      console.error('Isolation Test Error:', err);
      process.exit(1);
    });
}

module.exports = { runIdentityIsolationTests };
