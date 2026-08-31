/**
 * Majlis estimator: the customer's own inputs must reach the price.
 *
 * The bug this locks down
 * -----------------------
 * The storefront form posts `length`, `width`, `type` and `wood`.
 * calculateMajlis() only ever read `lengthMeters`, `widthMeters`,
 * `fabricQuality` and `woodType`. Not one field matched, so every submission
 * fell through to the method's defaults and the page answered with the SAME
 * number every time -- 3,332 SAR, "11.9 متر طولي", luxury/premium -- whether the
 * customer asked about a 3x4 standard majlis or a 5x6 royal one.
 *
 * This is a price shown to a customer, so it gets a test that pins the actual
 * arithmetic rather than just "it responds".
 *
 *   node tests/test-majlis-estimator.js
 */
const assert = require('assert');
const { calculatorService } = require('../services/calculator-service');

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

/* The formula, restated here independently so the test fails if the service's
   arithmetic drifts rather than silently agreeing with whatever it now does:
     runningMeters = max(4, round((length*2 + width) * 0.85, 1dp))
     rate          = 180 (+60 luxury | +120 royal) (+40 premium wood)
     total         = runningMeters * rate                                    */
function expected(length, width, fabric, wood) {
  const rm = Math.max(4, Math.round(((length * 2) + width) * 0.85 * 10) / 10);
  let rate = 180;
  if (fabric === 'luxury') rate += 60;
  if (fabric === 'royal') rate += 120;
  if (wood === 'premium') rate += 40;
  return { runningMeters: rm, total: Math.round(rm * rate) };
}

(async () => {
  console.log('\nMajlis estimator — the inputs must reach the price\n');

  await test('the form\'s own field names are honoured', async () => {
    const r = await calculatorService.calculateMajlis({
      length: 5, width: 6, type: 'standard', wood: 'standard', currency: 'SAR'
    });
    const e = expected(5, 6, 'standard', 'standard');
    assert.strictEqual(r.data.estimated_price_sar, e.total, 'price must follow the inputs');
    assert.strictEqual(r.data.dimensions.runningMeters, `${e.runningMeters} متر طولي`);
    assert.strictEqual(r.data.dimensions.fabricQuality, 'standard');
    assert.strictEqual(r.data.dimensions.woodType, 'standard');
  });

  await test('the canonical field names still work', async () => {
    const r = await calculatorService.calculateMajlis({
      lengthMeters: 5, widthMeters: 6, fabricQuality: 'standard', woodType: 'standard', currency: 'SAR'
    });
    assert.strictEqual(r.data.estimated_price_sar, expected(5, 6, 'standard', 'standard').total);
  });

  await test('a bigger room costs more than a smaller one', async () => {
    const small = await calculatorService.calculateMajlis({ length: 3, width: 4, type: 'standard', wood: 'standard', currency: 'SAR' });
    const big = await calculatorService.calculateMajlis({ length: 5, width: 6, type: 'standard', wood: 'standard', currency: 'SAR' });
    assert.ok(big.data.estimated_price_sar > small.data.estimated_price_sar,
      `expected ${big.data.estimated_price_sar} > ${small.data.estimated_price_sar}`);
  });

  await test('a richer fabric and better wood cost more at the same size', async () => {
    const plain = await calculatorService.calculateMajlis({ length: 5, width: 6, type: 'standard', wood: 'standard', currency: 'SAR' });
    const royal = await calculatorService.calculateMajlis({ length: 5, width: 6, type: 'royal', wood: 'premium', currency: 'SAR' });
    assert.ok(royal.data.estimated_price_sar > plain.data.estimated_price_sar,
      `expected ${royal.data.estimated_price_sar} > ${plain.data.estimated_price_sar}`);
    assert.strictEqual(royal.data.estimated_price_sar, expected(5, 6, 'royal', 'premium').total);
  });

  await test('two different requests do not return the same number', async () => {
    // The exact symptom of the bug: everything answered 3332.
    const a = await calculatorService.calculateMajlis({ length: 3, width: 4, type: 'standard', wood: 'standard', currency: 'SAR' });
    const b = await calculatorService.calculateMajlis({ length: 5, width: 6, type: 'royal', wood: 'premium', currency: 'SAR' });
    assert.notStrictEqual(a.data.estimated_price_sar, b.data.estimated_price_sar);
  });

  await test('a caller that sends nothing is priced exactly as before', async () => {
    // Backward compatibility: the old defaults were 5 x 4, luxury, premium.
    const r = await calculatorService.calculateMajlis({ currency: 'SAR' });
    assert.strictEqual(r.data.estimated_price_sar, expected(5, 4, 'luxury', 'premium').total);
  });

  await test('a tiny or junk size cannot produce a nonsense price', async () => {
    const r = await calculatorService.calculateMajlis({ length: 'abc', width: -9, type: 'standard', wood: 'standard', currency: 'SAR' });
    assert.ok(r.data.estimated_price_sar > 0, 'must never quote zero or a negative');
    assert.ok(Number.isFinite(r.data.estimated_price_sar));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
