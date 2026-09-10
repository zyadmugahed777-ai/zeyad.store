/**
 * Which product page represents a group of near-identical ones.
 *
 * 57 products share 16 descriptions. Twenty-nine differ from a sibling by
 * nothing a shopper could search for: the title ends in a bracketed letter --
 * "(P)", "(V)", "(J)" -- while the description, the specifications and the
 * price are identical. They are the same bedroom in a different finish.
 *
 * Google resolves a group like that by keeping one page and dropping the rest,
 * and it chooses without being told. Meanwhile the group's links and clicks are
 * split across all of them, so the page it keeps is weaker than the group
 * deserves. rel=canonical says "these are one thing, rank this one".
 *
 * The lines these tests defend:
 *
 *   - a page whose title says something real is NEVER collapsed. Twenty-three
 *     products in the same clusters are titled "استيل ابيض", "استيل اسود",
 *     "استيل ازرق"; people search for a white bedroom, and collapsing those
 *     would throw away demand the shop can serve.
 *   - never across a price. Two products at 2,100 and 1,850 are not the same
 *     offer, and pointing one at the other sends a shopper to a price they did
 *     not search for.
 *   - the choice is stable, because a canonical that moves between deploys
 *     teaches a crawler nothing.
 *
 *   node tests/test-product-canonical.js
 */
const assert = require('assert');

const { buildCanonicalMap, LETTER_TAG } = require('../services/product-canonical-service');
const { buildProductSeo } = require('../services/product-seo-service');

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

/* A description long enough to count as shared. The service ignores anything
   under 40 characters, because a product with no description shares nothing. */
const SHARED = '<p>' + 'غرفة نوم تركية فاخرة بتصميم أنيق يجمع بين الفخامة والجودة العالية. '.repeat(2) + '</p>';
const OTHER = '<p>' + 'مجلس عربي مطرز يدوياً بأقمشة فاخرة وإسفنج عالي الكثافة يتحمل الاستخدام. '.repeat(2) + '</p>';

const p = (id, title, price, description, gallery) => ({
  id, product_id: id, title, price, description,
  gallery: gallery || ['/a.png', '/b.png']
});

console.log('\nWhich product page represents a group of near-identical ones\n');

test('letter-tagged siblings collapse onto one representative', () => {
  const map = buildCanonicalMap([
    p('A', 'غرفة نوم ملكية فاخرة (P)', 2100, SHARED),
    p('B', 'غرفة نوم ملكية فاخرة (V)', 2100, SHARED),
    p('C', 'غرفة نوم ملكية فاخرة (J)', 2100, SHARED)
  ]);
  const targets = new Set([...map.values()]);
  assert.strictEqual(map.size, 2, 'expected two of three to point at the third');
  assert.strictEqual(targets.size, 1, 'they point at different representatives');
});

test('a title that says something real is never collapsed', () => {
  /* This is the assertion that keeps the fix from costing the shop traffic.
     Somebody searches for a white bedroom. */
  const map = buildCanonicalMap([
    p('A', 'غرف نوم موديل تركي استيل ابيض', 1850, SHARED),
    p('B', 'غرف نوم موديل تركي استيل اسود', 1850, SHARED),
    p('C', 'غرف نوم موديل تركي استيل ازرق', 1850, SHARED)
  ]);
  assert.strictEqual(map.size, 0, 'a page a shopper could search for was collapsed');
});

test('a named sibling is preferred as the representative', () => {
  const map = buildCanonicalMap([
    p('A', 'غرفة نوم ملكية فاخرة (P)', 2100, SHARED),
    p('B', 'غرف نوم موديل تركي استيل ابيض', 2100, SHARED),
    p('C', 'غرفة نوم ملكية فاخرة (V)', 2100, SHARED)
  ]);
  assert.strictEqual(map.get('A'), 'B', 'the letter-tagged page did not point at the named one');
  assert.strictEqual(map.get('C'), 'B');
  assert.ok(!map.has('B'), 'the named page was itself collapsed');
});

test('products at different prices are never grouped', () => {
  /* Same words, different offer. Sending a shopper from the 1,850 to the
     2,100 is worse than leaving them to compete. */
  const map = buildCanonicalMap([
    p('A', 'غرفة نوم ملكية فاخرة (P)', 2100, SHARED),
    p('B', 'غرفة نوم ملكية فاخرة (V)', 1850, SHARED)
  ]);
  assert.strictEqual(map.size, 0, 'two different prices were treated as one product');
});

test('products with different descriptions are never grouped', () => {
  const map = buildCanonicalMap([
    p('A', 'غرفة نوم ملكية فاخرة (P)', 2100, SHARED),
    p('B', 'مجلس عربي فاخر (V)', 2100, OTHER)
  ]);
  assert.strictEqual(map.size, 0);
});

test('a product alone is its own canonical', () => {
  const map = buildCanonicalMap([p('A', 'غرفة نوم ملكية فاخرة (P)', 2100, SHARED)]);
  assert.strictEqual(map.size, 0);
});

test('an empty or very short description groups nothing', () => {
  /* Otherwise every product the operator has not described yet would collapse
     onto one arbitrary page. */
  for (const desc of ['', '<p>قريباً</p>', null]) {
    const map = buildCanonicalMap([
      p('A', 'منتج (P)', 100, desc),
      p('B', 'منتج (V)', 100, desc)
    ]);
    assert.strictEqual(map.size, 0, 'grouped on description ' + JSON.stringify(desc));
  }
});

test('the representative is the same on every rebuild', () => {
  const rows = [
    p('B', 'غرفة نوم ملكية فاخرة (V)', 2100, SHARED),
    p('A', 'غرفة نوم ملكية فاخرة (P)', 2100, SHARED),
    p('C', 'غرفة نوم ملكية فاخرة (J)', 2100, SHARED)
  ];
  const first = [...buildCanonicalMap(rows).entries()].sort().join(',');
  const shuffled = [rows[2], rows[0], rows[1]];
  const again = [...buildCanonicalMap(shuffled).entries()].sort().join(',');
  assert.strictEqual(again, first, 'the canonical moved when the input order changed');
});

test('the fullest page wins when no sibling is named', () => {
  const map = buildCanonicalMap([
    p('A', 'غرفة نوم ملكية فاخرة (P)', 2100, SHARED, ['/1.png', '/2.png']),
    p('B', 'غرفة نوم ملكية فاخرة (V)', 2100, SHARED, ['/1.png', '/2.png', '/3.png', '/4.png'])
  ]);
  assert.strictEqual(map.get('A'), 'B', 'the page with fewer photographs was chosen to represent');
});

// --- what actually reaches the page --------------------------------------

test('the canonical tag points at the representative', () => {
  const seo = buildProductSeo(
    { id: 'A', title: 'غرفة نوم ملكية فاخرة (P)', price: 2100, image: '/a.png', stock_status: 'in-stock' },
    'SAR', null, 'B'
  );
  assert.ok(seo.tags.some((t) => t.includes('rel="canonical"') && t.includes('id=B')),
    'the canonical does not point at the representative');
});

test('og:url still points at THIS page, not the representative', () => {
  /* A share of this URL must preview this product. Canonical is a hint to a
     crawler; og:url is what a person is about to see. */
  const seo = buildProductSeo(
    { id: 'A', title: 'غرفة نوم ملكية فاخرة (P)', price: 2100, image: '/a.png', stock_status: 'in-stock' },
    'SAR', null, 'B'
  );
  const og = seo.tags.find((t) => t.includes('property="og:url"'));
  assert.ok(og.includes('id=A'), 'og:url was redirected to another product: ' + og);
});

test('with no representative the page is its own canonical', () => {
  const seo = buildProductSeo(
    { id: 'A', title: 'غرفة نوم', price: 2100, image: '/a.png', stock_status: 'in-stock' },
    'SAR', null, null
  );
  assert.ok(seo.tags.some((t) => t.includes('rel="canonical"') && t.includes('id=A')));
});

test('a page is never made to canonicalise to itself by a stale id', () => {
  const seo = buildProductSeo(
    { id: 'A', title: 'غرفة نوم', price: 2100, image: '/a.png', stock_status: 'in-stock' },
    'SAR', null, 'A'
  );
  assert.ok(seo.tags.some((t) => t.includes('rel="canonical"') && t.includes('id=A')));
});

test('LETTER_TAG matches a trailing bracketed letter and nothing else', () => {
  assert.ok(LETTER_TAG.test('غرفة نوم (P)'));
  assert.ok(LETTER_TAG.test('غرفة نوم (w)'));
  assert.ok(!LETTER_TAG.test('غرفة نوم استيل ابيض'));
  assert.ok(!LETTER_TAG.test('غرفة نوم (كبير)'), 'an Arabic word in brackets is not a variant tag');
  assert.ok(!LETTER_TAG.test('(P) غرفة نوم'), 'only a TRAILING tag counts');
});

console.log(`\n  passed: ${passed}    failed: ${failed}\n`);
process.exit(failed ? 1 : 0);
