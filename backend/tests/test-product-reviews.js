/**
 * Customer reviews, end to end.
 *
 * The shop needed star ratings and the tempting shortcut was to publish
 * products.rating -- a column seeded at import that no customer ever wrote.
 * That is review fraud as Google defines it. This suite exists to prove the
 * honest path actually works, and to keep the shortcut closed:
 *
 *   - a stranger cannot write a review
 *   - a review lands as 'pending' and is invisible until approved
 *   - the same customer cannot review the same product twice
 *   - "verified purchase" is computed from orders, never from the request
 *   - the rating published to Google comes from approved rows and nothing else
 *   - a product with no approved reviews publishes NO rating, not a zero
 *
 * It creates its own customer, product and reviews, and deletes all of them in
 * a finally block. Run against the shadow database, never production.
 *
 *   node tests/test-product-reviews.js
 */
const assert = require('assert');
const path = require('path');
const express = require('express');
const session = require('express-session');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { getRepositories } = require('../repositories');
const { buildProductSeo } = require('../services/product-seo-service');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

/** An app that can be logged in as a specific customer, or as nobody. */
function buildApp(state) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'reviews-test', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    if (state.customerId) req.session.customer = { id: state.customerId };
    next();
  });
  app.use('/api/products', require('../routes/api/reviews'));
  // Surface errors rather than hanging.
  app.use((err, req, res, _next) => res.status(500).json({ success: false, error: err.message }));
  return app;
}

const post = (base, url, body) => fetch(base + url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

(async () => {
  console.log('\nCustomer product reviews\n');

  if ((process.env.DATABASE_TYPE || '').toLowerCase() !== 'postgres') {
    console.log('  SKIP: DATABASE_TYPE is not postgres\n');
    process.exit(0);
  }

  const repos = getRepositories();
  const db = repos.products.db;
  const stamp = Date.now();

  const state = { customerId: null };
  const app = buildApp(state);
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;

  let productId = null;
  let customerId = null;
  let otherCustomerId = null;

  try {
    // --- fixtures ----------------------------------------------------------
    const prod = await db.prepare(
      "INSERT INTO products (product_id, title, price, is_active, stock_status) VALUES (?, ?, ?, TRUE, 'in-stock') RETURNING id"
    ).get('REV-' + stamp, 'منتج اختبار التقييمات ' + stamp, 100);
    productId = Number(prod.id);

    const cust = await db.prepare(
      'INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?) RETURNING id'
    ).get('زبون', 'تجريبي', 'RVT' + stamp);
    customerId = Number(cust.id);

    const other = await db.prepare(
      'INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?) RETURNING id'
    ).get('زبون', 'آخر', 'RVT2' + stamp);
    otherCustomerId = Number(other.id);

    // --- 1. a stranger may not write ---------------------------------------
    await test('a visitor who is not signed in cannot write a review', async () => {
      state.customerId = null;
      const res = await post(base, '/api/products/REV-' + stamp + '/reviews', { rating: 5, body: 'منتج ممتاز جداً وأنصح به' });
      assert.strictEqual(res.status, 401, 'expected 401, got ' + res.status);
      const j = await res.json();
      assert.strictEqual(j.code, 'CUSTOMER_AUTH_REQUIRED');
    });

    // --- 2. validation ------------------------------------------------------
    await test('a rating outside 1..5 is refused', async () => {
      state.customerId = customerId;
      for (const rating of [0, 6, 4.5, 'خمسة']) {
        const res = await post(base, '/api/products/REV-' + stamp + '/reviews', { rating, body: 'نص كافٍ الطول هنا' });
        assert.strictEqual(res.status, 400, 'rating ' + rating + ' was accepted');
      }
    });

    await test('an empty or one-word review is refused', async () => {
      state.customerId = customerId;
      const res = await post(base, '/api/products/REV-' + stamp + '/reviews', { rating: 5, body: 'جيد' });
      assert.strictEqual(res.status, 400);
    });

    // --- 3. the happy path --------------------------------------------------
    await test('a signed-in customer can write one, and it lands pending', async () => {
      state.customerId = customerId;
      const res = await post(base, '/api/products/REV-' + stamp + '/reviews', {
        rating: 5, body: 'المنتج وصل سريعاً والجودة ممتازة، أنصح به بشدة.'
      });
      // Read the body ONCE. Building the failure message with `await
      // res.text()` consumes it even when the assertion passes, and the
      // res.json() below then throws "Body has already been read".
      const j = await res.json();
      assert.strictEqual(res.status, 201, 'expected 201, got ' + res.status + ' ' + JSON.stringify(j));
      assert.strictEqual(j.data.status, 'pending', 'a review must not publish itself');
    });

    await test('a pending review is invisible to shoppers', async () => {
      const approved = await repos.reviews.findApproved(productId);
      assert.strictEqual(approved.length, 0, 'a pending review reached the public list');
      const agg = await repos.reviews.aggregate(productId);
      assert.strictEqual(agg, null, 'a pending review was counted into the rating');
    });

    await test('the same customer cannot review the same product twice', async () => {
      state.customerId = customerId;
      const res = await post(base, '/api/products/REV-' + stamp + '/reviews', { rating: 1, body: 'رأي ثانٍ من نفس الزبون' });
      assert.strictEqual(res.status, 409);
      const j = await res.json();
      assert.strictEqual(j.code, 'ALREADY_REVIEWED');
    });

    await test('verified purchase is false for someone who never bought it', async () => {
      const row = await db.prepare('SELECT is_verified_purchase FROM product_reviews WHERE customer_id = ? AND product_id = ?')
        .get(customerId, productId);
      assert.ok(row, 'the review is missing');
      assert.ok(row.is_verified_purchase === false || row.is_verified_purchase === 0,
        'a non-buyer was marked as a verified purchaser');
    });

    await test('the client cannot mark its own review as a verified purchase', async () => {
      state.customerId = otherCustomerId;
      await post(base, '/api/products/REV-' + stamp + '/reviews', {
        rating: 4, body: 'رأي من زبون آخر لاختبار التزوير', is_verified_purchase: true, isVerifiedPurchase: true, status: 'approved'
      });
      const row = await db.prepare('SELECT is_verified_purchase, status FROM product_reviews WHERE customer_id = ? AND product_id = ?')
        .get(otherCustomerId, productId);
      assert.ok(row, 'the second review is missing');
      assert.ok(row.is_verified_purchase === false || row.is_verified_purchase === 0,
        'the request set is_verified_purchase');
      assert.strictEqual(row.status, 'pending', 'the request set its own status');
    });

    // --- 4. approval is what publishes -------------------------------------
    await test('approving one review is what makes the rating appear', async () => {
      const mine = await repos.reviews.findMine(customerId, productId);
      await repos.reviews.setStatus(mine.id, 'approved');

      const agg = await repos.reviews.aggregate(productId);
      assert.ok(agg, 'no aggregate after approval');
      assert.strictEqual(agg.count, 1);
      assert.strictEqual(agg.average, 5);

      const list = await repos.reviews.findApproved(productId);
      assert.strictEqual(list.length, 1, 'only the approved review should be public');
    });

    await test('the average counts approved reviews only', async () => {
      // The other review is still pending at 4 stars. If it were counted the
      // average would be 4.5.
      const agg = await repos.reviews.aggregate(productId);
      assert.strictEqual(agg.average, 5, 'a pending review moved the average');

      const other = await repos.reviews.findMine(otherCustomerId, productId);
      await repos.reviews.setStatus(other.id, 'approved');
      const after = await repos.reviews.aggregate(productId);
      assert.strictEqual(after.count, 2);
      assert.strictEqual(after.average, 4.5);
    });

    // --- 5. what reaches Google --------------------------------------------
    await test('structured data publishes no rating when there are no reviews', () => {
      const seo = buildProductSeo({ id: 'X', product_id: 'X', title: 'منتج', price: 10, stock_status: 'in-stock' });
      const ld = JSON.parse(seo.jsonLd.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
      assert.ok(!('aggregateRating' in ld), 'a rating was published with no reviews behind it');
      assert.ok(!('review' in ld));
    });

    await test('structured data never publishes a zero rating', () => {
      const seo = buildProductSeo(
        { id: 'X', product_id: 'X', title: 'منتج', price: 10, stock_status: 'in-stock' },
        'SAR',
        { aggregate: { count: 0, average: 0 }, items: [] }
      );
      const ld = JSON.parse(seo.jsonLd.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
      assert.ok(!('aggregateRating' in ld), '"rated 0 out of 5" was published as a claim');
    });

    await test('structured data publishes the real average once reviews exist', async () => {
      const aggregate = await repos.reviews.aggregate(productId);
      const items = (await repos.reviews.findApproved(productId, 5)).map((r) => ({
        author: r.author_name, rating: Number(r.rating), body: r.body, createdAt: r.created_at
      }));
      const seo = buildProductSeo(
        { id: 'REV-' + stamp, product_id: 'REV-' + stamp, title: 'منتج', price: 10, stock_status: 'in-stock' },
        'SAR',
        { aggregate, items }
      );
      const ld = JSON.parse(seo.jsonLd.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
      assert.ok(ld.aggregateRating, 'no aggregateRating after two approved reviews');
      assert.strictEqual(ld.aggregateRating.ratingValue, 4.5);
      assert.strictEqual(ld.aggregateRating.reviewCount, 2);
      assert.strictEqual(ld.aggregateRating.bestRating, 5);
      // Google wants review bodies behind the average, not an average alone.
      assert.ok(Array.isArray(ld.review) && ld.review.length === 2, 'the reviews themselves were not published');
      assert.ok(ld.review[0].author.name, 'a review has no author');
      assert.ok(ld.review[0].reviewRating.ratingValue >= 1);
    });

    await test('the seeded products.rating column is never the source', () => {
      const src = require('fs').readFileSync(
        path.join(__dirname, '..', 'services', 'product-seo-service.js'), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(!/product\.rating|reviews_count/.test(code),
        'the SEO service reads the seeded rating columns');
    });

    // --- 6. moderation ------------------------------------------------------
    await test('rejecting hides a review without deleting it', async () => {
      const other = await repos.reviews.findMine(otherCustomerId, productId);
      await repos.reviews.setStatus(other.id, 'rejected');
      const agg = await repos.reviews.aggregate(productId);
      assert.strictEqual(agg.count, 1, 'a rejected review is still counted');
      const still = await repos.reviews.findMine(otherCustomerId, productId);
      assert.ok(still, 'rejecting deleted the row, so the customer can resubmit the same text');
    });

    await test('deleting frees that customer to write a new one', async () => {
      const other = await repos.reviews.findMine(otherCustomerId, productId);
      await repos.reviews.remove(other.id);
      assert.strictEqual(await repos.reviews.findMine(otherCustomerId, productId), undefined);

      state.customerId = otherCustomerId;
      const res = await post(base, '/api/products/REV-' + stamp + '/reviews', { rating: 3, body: 'رأي جديد بعد الحذف' });
      assert.strictEqual(res.status, 201, 'the customer could not write again after deletion');
    });

  } finally {
    try {
      if (productId) await db.prepare('DELETE FROM product_reviews WHERE product_id = ?').run(productId);
      if (productId) await db.prepare('DELETE FROM products WHERE id = ?').run(productId);
      for (const c of [customerId, otherCustomerId]) {
        if (c) await db.prepare('DELETE FROM customers WHERE id = ?').run(c);
      }
    } catch (e) {
      console.log('  (cleanup warning: ' + e.message + ')');
    }
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
