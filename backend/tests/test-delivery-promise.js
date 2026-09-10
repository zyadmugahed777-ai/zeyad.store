/**
 * One delivery promise, in every place that makes it.
 *
 * The shop was making four different ones at once:
 *
 *   product.html markup      "2-5 أيام عمل"          <- what a crawler read
 *   product-engine.js        "24 إلى 48 ساعة"        <- what the shopper saw
 *   faq.html                 "٢ إلى ٤ أيام عمل"
 *   ten product rows         "T"                     <- rendered verbatim
 *
 * The first two are the serious pair. The engine OVERWROTE the markup on load,
 * so on the same page at the same moment Google was told two to five days and
 * the visitor was promised one to two. That is the shape of a cloaking
 * complaint even when nobody intended it, and it is worse now that the
 * structured data publishes a transit time built from the same number.
 *
 * The "T" was live on ten product pages, printed to customers as their
 * delivery estimate, on a shop whose every visitor arrives from a paid
 * advertisement.
 *
 * backend/config/constants.js holds the one string. product-engine.js repeats
 * it because it runs in the browser and cannot require the file. These tests
 * exist so the repetition cannot drift.
 *
 *   node tests/test-delivery-promise.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const REPO = path.resolve(__dirname, '..', '..');
const { DELIVERY_FALLBACK_SAR } = require('../config/constants');
const { injectProductBody } = require('../services/product-render-service');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  }
}

const TEMPLATE = fs.readFileSync(path.join(REPO, 'product.html'), 'utf8');
const ENGINE = fs.readFileSync(path.join(REPO, 'product-engine.js'), 'utf8');
const PROMISE = DELIVERY_FALLBACK_SAR.textAr;

function render(product) {
  const $ = cheerio.load(TEMPLATE);
  injectProductBody($, product, cheerio);
  return $;
}

const base = { id: 'P-1', title: 'منتج', price: 1000 };

console.log('\nOne delivery promise, everywhere it is made\n');

test('the browser copy of the promise matches the constant', () => {
  /* product-engine.js cannot require constants.js. This is the seam, so this
     is the assertion that keeps the two halves honest. */
  const m = ENGINE.match(/const DELIVERY_PROMISE_AR = "([^"]+)"/);
  assert.ok(m, 'product-engine.js no longer declares DELIVERY_PROMISE_AR');
  assert.strictEqual(m[1], PROMISE,
    'the browser promises "' + m[1] + '" while the server promises "' + PROMISE + '"');
});

test('the shipped markup promises the same thing', () => {
  /* This is what a crawler reads if the script never runs, and what the
     structured data on the same page is built from. */
  const $ = cheerio.load(TEMPLATE);
  const shipped = $('#trust-shipping small').first().text().trim();
  assert.strictEqual(shipped, PROMISE,
    'product.html ships "' + shipped + '" but the promise is "' + PROMISE + '"');
});

test('the promise and the published transit days agree', () => {
  const m = PROMISE.match(/(\d+)\s*-\s*(\d+)/);
  assert.ok(m, 'the promise no longer states a range: ' + PROMISE);
  assert.strictEqual(Number(m[1]), DELIVERY_FALLBACK_SAR.transitDays.min,
    'the words and the structured data disagree about the fastest delivery');
  assert.strictEqual(Number(m[2]), DELIVERY_FALLBACK_SAR.transitDays.max,
    'the words and the structured data disagree about the slowest delivery');
});

test('nothing anywhere still promises 24 to 48 hours', () => {
  /* The old fallback, and the answer in the default product FAQ. Both
     contradicted the markup directly above them. */
  const offenders = [];
  for (const f of ['product-engine.js', 'product.html']) {
    if (fs.readFileSync(path.join(REPO, f), 'utf8').includes('24 إلى 48')) offenders.push(f);
  }
  for (const f of ['services/product-render-service.js']) {
    if (fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('24 إلى 48')) offenders.push(f);
  }
  assert.deepStrictEqual(offenders, [],
    'these still promise 24-48 hours: ' + offenders.join(', '));
});

// --- the garbage that reached customers ----------------------------------

test('a one-letter delivery time is never shown to a customer', () => {
  /* Ten products held "T" and it rendered verbatim. */
  const $ = render(Object.assign({}, base, { deliveryTime: 'T' }));
  const shown = $('#trust-shipping small').first().text().trim();
  assert.strictEqual(shown, PROMISE, 'the page shows "' + shown + '"');
});

test('a delivery time with no digits is not shown either', () => {
  const $ = render(Object.assign({}, base, { deliveryTime: 'قريباً' }));
  assert.strictEqual($('#trust-shipping small').first().text().trim(), PROMISE);
});

test('an empty delivery time falls back rather than blanking the line', () => {
  for (const value of ['', null, undefined, '   ']) {
    const $ = render(Object.assign({}, base, { deliveryTime: value }));
    assert.strictEqual($('#trust-shipping small').first().text().trim(), PROMISE,
      'blank for value ' + JSON.stringify(value));
  }
});

test("a product's own real delivery time IS used", () => {
  // The rule must reject garbage without discarding a genuine per-product value.
  const $ = render(Object.assign({}, base, { deliveryTime: '7-10 أيام عمل' }));
  assert.strictEqual($('#trust-shipping small').first().text().trim(), '7-10 أيام عمل');
});

test('the browser applies the same rule as the server', () => {
  /* Same thresholds on both sides, or the shopper and the crawler diverge
     again -- which is the whole reason this file exists. */
  const fn = ENGINE.match(/function deliveryPromise\(product\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fn, 'product-engine.js has no deliveryPromise()');
  assert.ok(/own\.length >= 4/.test(fn[0]), 'the browser uses a different length threshold');
  assert.ok(/\[0-9٠-٩\]/.test(fn[0]), 'the browser does not require a digit');
});

console.log(`\n  passed: ${passed}    failed: ${failed}\n`);
process.exit(failed ? 1 : 0);
