/**
 * FAQPage structured data, for the answers rather than the links.
 *
 * The shop wants to be found in ChatGPT, Gemini, Perplexity and Google's AI
 * Overviews, not only in a list of blue links. Those systems lift facts most
 * readily when a page states them as an explicit question and an explicit
 * answer, and FAQPage is how a page says "this is a question, this is its
 * answer" in a form a machine can read.
 *
 * Audited 2026-09-11: not one page on the site carried it. faq.html writes out
 * seven real questions in <details> elements and had no machine-readable form
 * of any of them.
 *
 * The rule these tests exist to defend: every question and answer is READ OUT
 * of the rendered page, never composed. Structured data that says something
 * the page does not say is a lie told to a crawler, and Google treats it as
 * one.
 *
 *   node tests/test-faq-schema.js
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');

const { buildFaqSchema, extractPairs } = require('../services/faq-schema-service');

const REPO = path.resolve(__dirname, '..', '..');
const URL = 'https://zeyad.store/faq.html';

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

const parse = (tag) => JSON.parse(tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '').replace(/<\\\//g, '</'));

console.log('\nFAQPage structured data\n');

test('the real FAQ page produces a FAQPage with its own questions', () => {
  const $ = cheerio.load(fs.readFileSync(path.join(REPO, 'faq.html'), 'utf8'));
  const tag = buildFaqSchema($, URL);
  assert.ok(tag, 'faq.html produced no schema at all');

  const json = parse(tag);
  assert.strictEqual(json['@type'], 'FAQPage');
  assert.ok(Array.isArray(json.mainEntity) && json.mainEntity.length >= 5,
    'expected the page\'s several questions, got ' + (json.mainEntity || []).length);

  for (const q of json.mainEntity) {
    assert.strictEqual(q['@type'], 'Question');
    assert.ok(q.name && q.name.length > 3, 'a question is empty');
    assert.strictEqual(q.acceptedAnswer['@type'], 'Answer');
    assert.ok(q.acceptedAnswer.text && q.acceptedAnswer.text.length > 10, 'an answer is empty');
  }
});

test('every published question actually appears on the page', () => {
  /* The whole point. If a question here is not in the HTML, the page is
     telling a crawler something it does not tell a visitor. */
  const html = fs.readFileSync(path.join(REPO, 'faq.html'), 'utf8');
  const $ = cheerio.load(html);
  const visible = $.root().text().replace(/\s+/g, ' ');

  const json = parse(buildFaqSchema($, URL));
  for (const q of json.mainEntity) {
    assert.ok(visible.includes(q.name),
      'this question is in the schema but not on the page: ' + q.name);
    // The first words of the answer are enough; whitespace inside markup
    // makes a full-string match brittle without proving anything more.
    const opening = q.acceptedAnswer.text.split(' ').slice(0, 6).join(' ');
    assert.ok(visible.includes(opening),
      'this answer is in the schema but not on the page: ' + opening);
  }
});

test('a page with no questions gets no schema', () => {
  const $ = cheerio.load('<html><body><h1>عن المتجر</h1><p>نص عادي.</p></body></html>');
  assert.strictEqual(buildFaqSchema($, URL), null);
});

test('a page with a single question is not called an FAQ', () => {
  const $ = cheerio.load('<details><summary>سؤال واحد؟</summary><p>جواب واحد.</p></details>');
  assert.strictEqual(buildFaqSchema($, URL), null,
    'one question is a detail, not a frequently-asked-questions page');
});

test('an empty question or answer is skipped, not published blank', () => {
  const $ = cheerio.load(
    '<details><summary>سؤال حقيقي؟</summary><p>جواب حقيقي وواضح.</p></details>' +
    '<details><summary></summary><p>جواب بلا سؤال.</p></details>' +
    '<details><summary>سؤال بلا جواب؟</summary></details>' +
    '<details><summary>سؤال ثانٍ؟</summary><p>جواب ثانٍ وواضح.</p></details>'
  );
  const json = parse(buildFaqSchema($, URL));
  assert.strictEqual(json.mainEntity.length, 2, 'a blank entry was published');
});

test('the summary is not repeated inside its own answer', () => {
  const $ = cheerio.load(
    '<details><summary>ما هي مدة الضمان؟</summary><p>سنة كاملة على الأجهزة.</p></details>' +
    '<details><summary>وسؤال آخر؟</summary><p>وجواب آخر.</p></details>'
  );
  const json = parse(buildFaqSchema($, URL));
  assert.ok(!json.mainEntity[0].acceptedAnswer.text.includes('ما هي مدة الضمان'),
    'the question was duplicated into its answer');
});

test('a closing script tag in the content cannot break out of the block', () => {
  const $ = cheerio.load(
    '<details><summary>سؤال؟</summary><p>جواب &lt;/script&gt; مع نص.</p></details>' +
    '<details><summary>سؤال ثانٍ؟</summary><p>جواب ثانٍ.</p></details>'
  );
  const tag = buildFaqSchema($, URL);
  const body = tag.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  assert.ok(!body.includes('</script>'), 'a raw </script> survived into the block');
  assert.doesNotThrow(() => parse(tag), 'the block is not valid JSON');
});

test('extractPairs reads the shape both the FAQ and product pages use', () => {
  const $ = cheerio.load(
    '<details class="product-faq-item"><summary>س1؟</summary><p>ج1 طويل بما يكفي.</p></details>'
  );
  const pairs = extractPairs($, 'details');
  assert.strictEqual(pairs.length, 1);
  assert.strictEqual(pairs[0].question, 'س1؟');
  assert.strictEqual(pairs[0].answer, 'ج1 طويل بما يكفي.');
});

console.log(`\n  passed: ${passed}    failed: ${failed}\n`);
process.exit(failed ? 1 : 0);
