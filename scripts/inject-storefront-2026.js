/*
 * Injects the storefront-2026 CSS/JS layer into every storefront HTML page.
 *
 * Idempotent: running it twice changes nothing. It edits only the <head> link
 * list and the end of <body>, never the page's own markup, so the data-vid
 * attributes the visual CMS keys its saved edits on are untouched.
 *
 *   node scripts/inject-storefront-2026.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// The version is a hash of the assets themselves, so a returning visitor gets
// the new files the moment they change and never re-downloads them otherwise.
const hash = (rel) => require('crypto')
  .createHash('sha1')
  .update(fs.readFileSync(path.join(ROOT, rel)))
  .digest('hex')
  .slice(0, 8);

const VER = hash('assets/css/storefront-2026.css') + hash('assets/js/core/storefront-2026.js');
const CSS_TAG = `<link rel="stylesheet" href="assets/css/storefront-2026.css?v=${VER}">`;
const JS_TAG = `<script src="assets/js/core/storefront-2026.js?v=${VER}"></script>`;

// Scripts this change touches. They ship with no version query (or a stale
// one), so a returning visitor would keep serving the old copy from cache.
const STAMPED = [
  'assets/js/core/theme.js',
  'assets/js/core/premium-cards.js',
  'assets/js/core/currency.js',
  // Builds the mobile header markup, so a stale copy leaves the old one-row
  // layout in place however new the stylesheet is.
  'assets/js/core/global-ux.js',
  'product-engine.js',
  'zfb-core.js',
  'site.js',
];

/*
 * Rewrite an asset's version query -- but ONLY where it is the value of an
 * href or src attribute.
 *
 * The previous version matched the bare filename anywhere in the document. A
 * comment in majalis.html that mentioned "assets/js/core/storefront-2026.js"
 * was rewritten too, and because the pattern also swallowed the following
 * `?v=...` it ran on into the markup after the comment and destroyed the
 * opening tag of the element below it. The page still parsed, so nothing
 * failed loudly -- the element simply vanished from the DOM.
 *
 * Anchoring on `href="` / `src="` means prose, comments and documentation can
 * name these files freely.
 */
function stampAsset(html, asset, version) {
  const path = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // (href|src) = quote + optional leading slash + path + optional ?v=... + same quote
  const re = new RegExp(
    '((?:href|src)\\s*=\\s*)(["\'])(/?)' + path + '(?:\\?v=[^"\']*)?\\2',
    'g'
  );
  return html.replace(re, (_m, attr, quote, slash) =>
    `${attr}${quote}${slash}${asset}?v=${version}${quote}`);
}

// Pages that are not part of the public storefront.
const SKIP = new Set(['appliances_test.html']);

const files = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html'))
  .filter(f => !SKIP.has(f));

let changed = 0;
let skipped = 0;

for (const file of files) {
  const abs = path.join(ROOT, file);
  let html = fs.readFileSync(abs, 'utf8');
  const before = html;

  // Refresh the version on tags that are already there.
  html = stampAsset(html, 'assets/css/storefront-2026.css', VER);
  html = stampAsset(html, 'assets/js/core/storefront-2026.js', VER);

  // --- CSS: last in the cascade, so it can override the four earlier sheets.
  if (!html.includes('assets/css/storefront-2026.css')) {
    // Anchor on the last <link rel="stylesheet"> in the document.
    const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
    let last = null, m;
    while ((m = linkRe.exec(html)) !== null) last = m;
    if (last) {
      const at = last.index + last[0].length;
      html = html.slice(0, at) + '\n  ' + CSS_TAG + html.slice(at);
    } else if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, '  ' + CSS_TAG + '\n</head>');
    }
  }

  // --- JS: after every other script, so the card generators have already run.
  if (!html.includes('assets/js/core/storefront-2026.js')) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, '  ' + JS_TAG + '\n</body>');
    } else {
      html += '\n' + JS_TAG + '\n';
    }
  }

  // --- Cache-bust the core scripts this change edits. They ship without a
  // version query, so a returning visitor would keep the old copy.
  for (const asset of STAMPED) {
    html = stampAsset(html, asset, hash(asset));
  }

  if (html !== before) {
    fs.writeFileSync(abs, html, 'utf8');
    changed++;
    console.log('  updated  ' + file);
  } else {
    skipped++;
  }
}

console.log(`\nstorefront-2026: ${changed} page(s) updated, ${skipped} already current.`);
