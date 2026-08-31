/**
 * Product variants: sizes reach the storefront, and a chosen size sets the price.
 *
 * Covers the three places the chain was broken:
 *   1. /api/products/:id returned no `sizes`, so a product with two sizes
 *      arrived at the product page as a product with none.
 *   2. product-engine.js hardcoded `sizes: []` when mapping that response.
 *   3. POST /api/orders priced every line from the product's base price and
 *      never recorded which size was bought.
 *
 * Read-only: it inspects the pricing rule directly and reads the public API.
 * It creates no orders and writes nothing to the database.
 *
 *   node tests/test-product-variants-pricing.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const variants = require('../services/product-variant-service');

const BASE = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3005}`;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.then(
      () => { passed++; console.log(`  PASS  ${name}`); },
      (e) => { failed++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
    );
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
  return Promise.resolve();
}

(async () => {
  console.log('\nProduct variants — pricing and exposure\n');

  // --- 1. The pricing rule itself -----------------------------------------
  const product = { price: 1500 };
  const sizes = [
    { label: 'حجم نفر واحد', price: 1300 },
    { label: 'حجم نفرين', price: 1200 },
  ];

  await test('a chosen size sets the price outright, it is not a delta', () => {
    assert.strictEqual(variants.priceForSize(product, sizes, 'حجم نفر واحد'), 1300);
    assert.strictEqual(variants.priceForSize(product, sizes, 'حجم نفرين'), 1200);
  });

  await test('no size chosen keeps the product price', () => {
    assert.strictEqual(variants.priceForSize(product, sizes, null), 1500);
    assert.strictEqual(variants.priceForSize(product, sizes, ''), 1500);
  });

  await test('a product with no sizes is unaffected', () => {
    assert.strictEqual(variants.priceForSize(product, [], 'أي حجم'), 1500);
  });

  await test('a stale or forged label never charges a price that was not offered', () => {
    // A link from an old page naming a size that has since been deleted must
    // fall back to the base price, never to zero and never to an invented one.
    assert.strictEqual(variants.priceForSize(product, sizes, 'حجم محذوف'), 1500);
  });

  // --- 2. The order route prices server-side ------------------------------
  await test('the order route re-prices from product_sizes, ignoring the posted price', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'api', 'orders.js'), 'utf8');
    assert.ok(
      src.includes('variants.priceForSize(product, productSizes, chosenSize)'),
      'unit price must come from priceForSize, not from the request body'
    );
    assert.ok(
      /selected_size:\s*sizeIsReal \? chosenSize : null/.test(src),
      'the order must record the size that was actually bought'
    );
    assert.ok(
      /selected_size_price:\s*sizeIsReal \? unitPriceSar : null/.test(src),
      'the order must record the price that size carried at the time'
    );
  });

  // --- 3. The read path actually carries sizes ----------------------------
  await test('the product service loads sizes and colour-tagged images', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'product-service.js'), 'utf8');
    assert.ok(src.includes('findSizes'), 'getProductById must load sizes');
    assert.ok(src.includes('colorImages'), 'getProductById must group images by colour');
  });

  await test('product-engine.js no longer discards the sizes it was sent', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'product-engine.js'), 'utf8');
    assert.ok(!/\bsizes:\s*\[\],/.test(src), 'sizes must not be hardcoded empty');
    assert.ok(src.includes('sizes: Array.isArray(raw.sizes) ? raw.sizes : []'));
  });

  // --- 4. Live API, when a server is running ------------------------------
  let live = null;
  let reachable = true;
  try {
    const res = await fetch(`${BASE}/api/products?limit=200`);
    if (res.ok) {
      live = await res.json();
    } else {
      /* A server that answers with an error is NOT the same as no server, and
         quietly skipping on it hid a 500 from a database outage for a whole
         run. Fail loudly instead. */
      failed++;
      console.log(`  FAIL  live API reachable\n        ${BASE}/api/products returned HTTP ${res.status}`);
      reachable = false;
    }
  } catch (_) { /* nothing listening; the checks below are skipped */ }

  if (!live) {
    if (reachable) console.log('  SKIP  live API checks (no server on ' + BASE + ')');
  } else {
    const list = live.data || live.products || [];
    let sized = null;
    for (const p of list) {
      const one = await (await fetch(`${BASE}/api/products/${p.id}`)).json();
      const full = one.data || one.product;
      if (full && Array.isArray(full.sizes) && full.sizes.length) { sized = full; break; }
    }

    if (!sized) {
      console.log('  SKIP  live API sizes check (no product currently has sizes)');
    } else {
      await test(`GET /api/products/:id exposes sizes (product ${sized.id})`, () => {
        assert.ok(sized.sizes.length > 0);
        for (const s of sized.sizes) {
          assert.ok(typeof s.label === 'string' && s.label.length, 'each size needs a label');
          assert.ok(Number.isFinite(s.price) && s.price >= 0, 'each size needs its own price');
        }
      });

      await test('every product response carries a colourImages map', () => {
        assert.ok(sized.colorImages && typeof sized.colorImages === 'object');
      });
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
