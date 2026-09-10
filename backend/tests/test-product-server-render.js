/**
 * What a crawler receives from a product page, before any JavaScript runs.
 *
 * The complaint that produced this file: "زياد ستور does not appear in search
 * at all." Search Console said 3 pages indexed, 65 not. Everything the usual
 * checklist covers was already right -- unique titles, unique canonicals, a
 * clean robots.txt, a submitted sitemap, full Product structured data -- and
 * the catalogue still was not indexed.
 *
 * Measured against the live site on 2026-09-10, and this is the whole answer:
 *
 *   two DIFFERENT product pages carried 1,256 and 1,253 characters of
 *   server-rendered text and were 98% identical -- four words apart,
 *   the title -- because everything a shopper reads was written by
 *   product-engine.js after load, inside a container that ships as
 *   `<div id="product-page" hidden>`.
 *
 * Google does execute JavaScript, but on a second pass it rations by trust,
 * and a new domain serving 57 byte-identical pages looks like 57 copies of
 * one page. Duplicates are not indexed. The head was never the problem.
 *
 * After server-rendering the body, against the real production catalogue:
 * median 2,430 characters, median similarity 81%, and 57 of 57 pages
 * textually distinct.
 *
 * These tests hold that line. They run against the shipped template and the
 * real renderer, with no server and no database.
 *
 *   node tests/test-product-server-render.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const { injectProductBody, sanitizeRichText, formatPrice, discountPercent } =
  require('../services/product-render-service');

const REPO = path.join(__dirname, '..', '..');

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

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function render(product) {
  const $ = cheerio.load(TEMPLATE);
  const written = injectProductBody($, product, cheerio);
  return { $, html: $.html(), text: strip($.html()), written };
}

const BED = {
  id: 'P-1001',
  product_id: 'P-1001',
  title: 'غرفة نوم ملكية ماليزية',
  price: 2500,
  oldPrice: 3000,
  brand: 'موديل ماليزي',
  origin: 'ماليزيا',
  sku: 'SKU-BED-1',
  description: '<p>غرفة نوم فاخرة بخشب صلب وتشطيب يدوي، مناسبة للعرسان.</p><script>alert(1)</script>',
  specs: [{ label: 'الدولاب', value: '220-240' }, { label: 'السرير', value: '180-190' }],
  faq: []
};

const SOFA = {
  id: 'P-1002',
  product_id: 'P-1002',
  title: 'مجلس عربي مطرز',
  price: 1800,
  brand: 'صناعة يمنية',
  origin: 'اليمن',
  sku: 'SKU-SOFA-2',
  description: '<p>مجلس عربي بأقمشة مطرزة يدوياً وإسفنج عالي الكثافة يتحمل الاستخدام اليومي.</p>',
  specs: [{ label: 'عدد القطع', value: '8' }],
  faq: [{ q: 'هل يمكن تفصيله بمقاس آخر؟', a: 'نعم، التفصيل متاح حسب مساحة المجلس.' }]
};

console.log('\nWhat a crawler receives from a product page, before any JavaScript\n');

// --- the defect that kept 57 pages out of the index ----------------------

test('the content container is not hidden from a crawler', () => {
  /* This single attribute is what made everything else moot: the page was
     filled correctly and still shipped invisible. */
  const before = cheerio.load(TEMPLATE);
  assert.ok(before('#product-page').attr('hidden') !== undefined,
    'the template no longer ships hidden — this test is checking the wrong thing');

  const { $ } = render(BED);
  assert.strictEqual($('#product-page').attr('hidden'), undefined,
    'the product content is still hidden after rendering');
});

test('the loading skeleton is not what a crawler reads instead', () => {
  const { $ } = render(BED);
  assert.ok(/display\s*:\s*none/.test($('#product-loading').attr('style') || ''),
    'the skeleton is still showing beside the real content');
});

test('two different products are not the same page', () => {
  /* The measurement that started this: 98% identical, four words apart. */
  const a = render(BED).text;
  const b = render(SOFA).text;
  const wa = a.split(' ');
  const setB = new Set(b.split(' '));
  const overlap = wa.filter((w) => setB.has(w)).length / wa.length;
  assert.ok(overlap < 0.9,
    'two products still render ' + Math.round(overlap * 100) + '% the same page');
});

test('the page carries substantially more than its furniture', () => {
  const empty = strip(TEMPLATE);          // header, nav, footer, skeleton
  const filled = render(BED).text;
  assert.ok(filled.length > empty.length + 500,
    'rendering added only ' + (filled.length - empty.length) + ' characters');
});

// --- the words themselves ------------------------------------------------

test("the product's own description reaches the HTML", () => {
  const { text } = render(BED);
  assert.ok(text.includes('غرفة نوم فاخرة بخشب صلب'),
    'the description is not in the server-rendered page');
});

test('specifications reach the HTML, label and value', () => {
  const { text } = render(BED);
  assert.ok(text.includes('الدولاب') && text.includes('220-240'),
    'the specifications are not server-rendered');
});

test('the title, price and brand are in the body, not only the head', () => {
  const { $ } = render(BED);
  assert.strictEqual($('#product-title').text(), 'غرفة نوم ملكية ماليزية');
  assert.ok($('#product-current-price').text().includes('ر.س'), 'no price in the body');
  assert.strictEqual($('#product-brand').text(), 'موديل ماليزي');
  assert.strictEqual($('#product-origin').text(), 'ماليزيا');
});

test('a product with its own questions gets those, not the defaults', () => {
  const { text } = render(SOFA);
  assert.ok(text.includes('هل يمكن تفصيله بمقاس آخر؟'), 'the product FAQ is missing');
  assert.ok(!text.includes('ما هي طرق الدفع المتاحة؟'),
    'the default questions were used even though the product has its own');
});

test('a product with no questions still answers the common ones', () => {
  const { text } = render(BED);
  assert.ok(text.includes('ما هي مدة الضمان على هذا المنتج؟'),
    'a product without its own FAQ got no questions at all');
});

// --- the discount, which must never render half-shown --------------------

test('a discounted product shows the old price and the saving', () => {
  const { $ } = render(BED);           // 2500 from 3000
  assert.strictEqual($('#product-old-price').attr('hidden'), undefined);
  assert.ok($('#product-saving').text().startsWith('وفر'), 'no saving line');
  assert.strictEqual($('#product-discount-badge').text(), '-17%');
});

test('a product at full price shows no empty discount chips', () => {
  const { $ } = render(SOFA);          // no oldPrice
  assert.strictEqual($('#product-old-price').attr('hidden'), 'hidden');
  assert.strictEqual($('#product-saving').attr('hidden'), 'hidden');
  assert.strictEqual($('#product-discount-badge').attr('hidden'), 'hidden');
});

test('discountPercent matches what the client computes', () => {
  assert.strictEqual(discountPercent({ price: 2500, oldPrice: 3000 }), 17);
  assert.strictEqual(discountPercent({ price: 3000, oldPrice: 2500 }), 0, 'a price RISE is not a discount');
  assert.strictEqual(discountPercent({ price: 0, oldPrice: 100 }), 0);
  assert.strictEqual(discountPercent({ price: 100 }), 0);
});

// --- the description is operator-written markup, so it is sanitised ------

test('script in a description does not reach the page', () => {
  /* The description comes from a rich-text editor and is meant to carry
     markup, so it cannot simply be escaped -- doing that printed the
     operator's tags to customers as literal text. It is parsed and
     allow-listed instead, exactly as the client does it. */
  const { html, text } = render(BED);
  assert.ok(!/alert\(1\)/.test(html), 'a script from the description survived into the page');
  assert.ok(!text.includes('<p>'), 'markup was escaped instead of rendered');
});

test('safe formatting survives, dangerous attributes do not', () => {
  const dirty = '<p style="color:red" onclick="steal()">نص <b>مهم</b> و<a href="javascript:x()">رابط</a></p>';
  const clean = sanitizeRichText(cheerio, dirty);
  assert.ok(clean.includes('<b>مهم</b>'), 'bold formatting was stripped');
  assert.ok(!/onclick/i.test(clean), 'an event handler survived');
  assert.ok(!/style=/i.test(clean), 'inline style survived');
  assert.ok(!/javascript:/i.test(clean), 'a javascript: href survived');
});

test('an unknown tag loses the tag and keeps the sentence', () => {
  const clean = sanitizeRichText(cheerio, '<marquee>كلمات مهمة</marquee>');
  assert.ok(clean.includes('كلمات مهمة'), 'the words were deleted with the tag');
  assert.ok(!/marquee/i.test(clean), 'the tag survived');
});

test('an empty description falls back rather than leaving a blank page', () => {
  const { text } = render({ id: 'P-3', title: 'منتج', price: 10, description: '' });
  assert.ok(text.includes('زياد ستور'), 'no fallback description was written');
});

// --- it must never cost a response ---------------------------------------

test('a template without the product markup is left alone, not crashed', () => {
  const $ = cheerio.load('<html><body><p>صفحة أخرى</p></body></html>');
  assert.strictEqual(injectProductBody($, BED, cheerio), null);
});

test('a missing product is a no-op', () => {
  const $ = cheerio.load(TEMPLATE);
  assert.strictEqual(injectProductBody($, null, cheerio), null);
});

test('the price format matches the client fallback exactly', () => {
  // product-engine.js: Number(v).toLocaleString('ar-SA') + ' ر.س'
  assert.strictEqual(formatPrice(2500), Number(2500).toLocaleString('ar-SA') + ' ر.س');
  assert.strictEqual(formatPrice(null), Number(0).toLocaleString('ar-SA') + ' ر.س');
});

console.log(`\n  passed: ${passed}    failed: ${failed}\n`);
process.exit(failed ? 1 : 0);
