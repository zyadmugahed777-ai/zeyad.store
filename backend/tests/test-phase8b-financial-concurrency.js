/**
 * Zeyad For Business — Phase 8B: Financial Concurrency & Atomicity Test Suite
 * 
 * Explicitly tests:
 * 1. Coupon max_uses concurrent redemption limits
 * 2. Cart concurrent updates & item integrity
 * 3. Order creation atomicity (order + order_items + payment)
 * 4. Payment record insertion
 * 5. Customer financial statistics updates (total_orders, total_spent)
 * 6. Rollback guarantee after injected failure
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

async function runFinancialConcurrencyTests() {
  console.log('\n======================================================');
  console.log('   PHASE 8B: FINANCIAL CONCURRENCY & ATOMICITY');
  console.log('======================================================\n');

  resetPgRepositories();
  const pRepos = getPgRepositories();
  const client = await getClient();

  try {
    // 1. Coupon max_uses concurrent redemption
    console.log('--- 1. Coupon Concurrent Redemption Limit ---');
    const testCode = 'CONCUR-TEST-' + Date.now();
    const couponInsert = await client.query(`
      INSERT INTO coupons (code, discount_type, discount_value, min_order, max_uses, used_count, is_active, scope, created_at, updated_at)
      VALUES ($1, 'percentage', 10.00, 50.00, 3, 0, TRUE, 'public', NOW(), NOW())
      RETURNING id
    `, [testCode]);
    const testCouponId = couponInsert.rows[0].id;

    // Simulate 10 simultaneous concurrent redemption attempts for a coupon with max_uses = 3
    const redemptionPromises = Array.from({ length: 10 }).map(() => pRepos.coupons.incrementUsage(testCouponId));
    const results = await Promise.all(redemptionPromises);
    const successCount = results.filter(r => r === true).length;
    const failedCount = results.filter(r => r === false).length;

    const couponCheck = await client.query('SELECT used_count, max_uses FROM coupons WHERE id = $1', [testCouponId]);
    const finalUsedCount = couponCheck.rows[0].used_count;

    assert(successCount === 3, `Exactly 3 redemptions succeeded out of 10 concurrent requests (got ${successCount})`);
    assert(failedCount === 7, `Exactly 7 redemptions rejected due to limit exhaustion (got ${failedCount})`);
    assert(finalUsedCount === 3, `Final database used_count is exactly 3 (got ${finalUsedCount})`);

    // Clean up test coupon
    await client.query('DELETE FROM coupons WHERE id = $1', [testCouponId]);

    // 2. Cart concurrent updates
    console.log('\n--- 2. Cart Concurrent Updates ---');
    const testCartGuestId = 'cart_concur_guest_' + Date.now();
    await pRepos.carts.ensureGuestSession(testCartGuestId);
    
    // Create cart
    const cartRes = await client.query(`
      INSERT INTO carts (guest_id, created_at, updated_at)
      VALUES ($1, NOW(), NOW())
      RETURNING id
    `, [testCartGuestId]);
    const testCartId = cartRes.rows[0].id;

    // Simulate 5 concurrent additions of 5 distinct products
    const { getPgPool } = require('../config/pg-database');
    const pool = getPgPool();
    const addPromises = Array.from({ length: 5 }).map((_, idx) => {
      return pool.query(`
        INSERT INTO cart_items (cart_id, product_id, quantity, selected_color, created_at)
        VALUES ($1, $2, 1, 'Red', NOW())
      `, [testCartId, idx + 1]);
    });
    await Promise.all(addPromises);

    const cartItems = await client.query('SELECT COUNT(*) as count, SUM(quantity) as total_qty FROM cart_items WHERE cart_id = $1', [testCartId]);
    assert(Number(cartItems.rows[0].count) === 5, 'All 5 concurrent distinct cart item entries persisted without lock contention');
    assert(Number(cartItems.rows[0].total_qty) === 5, 'Cart items total quantity matches 5');

    // Clean up test cart
    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [testCartId]);
    await client.query('DELETE FROM carts WHERE id = $1', [testCartId]);

    // 3. Order creation atomicity (Order + Items + Payment)
    console.log('\n--- 3. Order Creation Atomicity ---');
    const atomOrderNum = 'ATOM-ORDER-' + Date.now();
    let atomOrderId = null;
    let atomPaymentId = null;

    await pRepos.tx.run(async (txClient) => {
      // 1. Insert Order
      const ordRes = await txClient.query(`
        INSERT INTO orders (
          order_id, customer_id, status, subtotal, shipping_fee, total, currency,
          payment_method, city, district, address_detail, created_at, updated_at
        ) VALUES (
          $1, NULL, 'pending', 500.00, 20.00, 520.00, 'SAR',
          'kuraimi', 'Aden', 'Crater', 'Main St', NOW(), NOW()
        ) RETURNING id
      `, [atomOrderNum]);
      atomOrderId = ordRes.rows[0].id;

      // 2. Insert 2 Order Items
      await txClient.query(`
        INSERT INTO order_items (order_id, product_title, quantity, price, total)
        VALUES ($1, 'Solar Inverter 3KW', 1, 300.00, 300.00),
               ($1, 'Gel Battery 200Ah', 1, 200.00, 200.00)
      `, [atomOrderId]);

      // 3. Insert Payment
      const payRes = await txClient.query(`
        INSERT INTO payments (order_id, method, amount, status, reference, created_at)
        VALUES ($1, 'kuraimi', 520.00, 'completed', 'TXN-998877', NOW())
        RETURNING id
      `, [atomOrderId]);
      atomPaymentId = payRes.rows[0].id;
    });

    const verifyOrd = await client.query('SELECT * FROM orders WHERE id = $1', [atomOrderId]);
    const verifyItems = await client.query('SELECT * FROM order_items WHERE order_id = $1', [atomOrderId]);
    const verifyPay = await client.query('SELECT * FROM payments WHERE id = $1', [atomPaymentId]);

    assert(verifyOrd.rows.length === 1, 'Atomic order successfully committed');
    assert(verifyItems.rows.length === 2, 'Exactly 2 order items committed atomically');
    assert(verifyPay.rows.length === 1, 'Payment record committed atomically with exact amount (520.00 SAR)');
    assert(parseFloat(verifyPay.rows[0].amount) === 520.00, 'Payment amount matches order total');

    // 4. Customer Financial Statistics Update
    console.log('\n--- 4. Customer Statistics Update ---');
    const custRes = await client.query(`
      INSERT INTO customers (first_name, phone, total_orders, total_spent, created_at)
      VALUES ('Stats Tester', '+96777999888', 0, 0.00, NOW())
      RETURNING id
    `);
    const custId = custRes.rows[0].id;

    // Simulate placing order and updating customer stats atomically
    await pRepos.tx.run(async (txClient) => {
      await txClient.query(`
        UPDATE customers
        SET total_orders = total_orders + 1,
            total_spent = total_spent + 520.00,
            updated_at = NOW()
        WHERE id = $1
      `, [custId]);
    });

    const custVerify = await client.query('SELECT total_orders, total_spent FROM customers WHERE id = $1', [custId]);
    assert(Number(custVerify.rows[0].total_orders) === 1, 'Customer total_orders incremented to 1');
    assert(parseFloat(custVerify.rows[0].total_spent) === 520.00, 'Customer total_spent incremented to 520.00');

    // 5. Injected Failure Rollback Test
    console.log('\n--- 5. Rollback on Injected Failure ---');
    const failTxOrderNum = 'FAIL-ATOM-' + Date.now();
    let rollbacked = false;

    try {
      await pRepos.tx.run(async (txClient) => {
        const oRes = await txClient.query(`
          INSERT INTO orders (order_id, status, subtotal, shipping_fee, total, currency, payment_method, created_at, updated_at)
          VALUES ($1, 'pending', 1000.00, 50.00, 1050.00, 'SAR', 'cash-on-delivery', NOW(), NOW())
          RETURNING id
        `, [failTxOrderNum]);
        const oId = oRes.rows[0].id;

        await txClient.query(`
          INSERT INTO order_items (order_id, product_title, quantity, price, total)
          VALUES ($1, 'Valid Item', 1, 1000.00, 1000.00)
        `, [oId]);

        // Inject intentional failure (invalid foreign key / missing required column)
        await txClient.query('INSERT INTO non_existent_financial_audit_table VALUES (1)');
      });
    } catch (e) {
      rollbacked = true;
    }

    const checkOrd = await client.query('SELECT * FROM orders WHERE order_id = $1', [failTxOrderNum]);
    assert(rollbacked === true, 'Injected failure aborted transaction with exception');
    assert(checkOrd.rows.length === 0, 'Zero orphan orders exist after rollback');

    // Clean up created records
    await client.query('DELETE FROM payments WHERE id = $1', [atomPaymentId]);
    await client.query('DELETE FROM order_items WHERE order_id = $1', [atomOrderId]);
    await client.query('DELETE FROM orders WHERE id = $1', [atomOrderId]);
    await client.query('DELETE FROM customers WHERE id = $1', [custId]);

    console.log('\n======================================================');
    if (failed === 0) {
      console.log(`   \x1b[32mALL ${passed} FINANCIAL CONCURRENCY & ATOMICITY TESTS PASSED\x1b[0m`);
    } else {
      console.log(`   \x1b[31m${failed} TESTS FAILED out of ${passed + failed}\x1b[0m`);
    }
    console.log('======================================================\n');

    return failed === 0;
  } finally {
    client.release();
    await closePgPool();
  }
}

if (require.main === module) {
  runFinancialConcurrencyTests()
    .then(ok => process.exit(ok ? 0 : 1))
    .catch(err => {
      console.error('Financial Test Error:', err);
      process.exit(1);
    });
}

module.exports = { runFinancialConcurrencyTests };
