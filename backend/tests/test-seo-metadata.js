/**
 * SEO metadata that must not regress.
 *
 * Everything asserted here was found broken by auditing the LIVE site, not by
 * reading the source:
 *
 *   - og:image on 60 pages pointed at assets/placeholder-logo.webp, a file
 *     that has never existed. Every WhatsApp and Facebook share of a
 *     department page previewed with a broken image.
 *   - The favicon link on the one page that had one pointed at
 *     assets/images/favicon.png, also a 404. The other 70 declared no icon.
 *   - No web manifest existed at all.
 *   - Five department descriptions had been scraped out of the pages' own
 *     markup: three ran a heading into a subheading with no space
 *     ("تصاميم راقية تناسب ذوقكوجودة تصنع الراحة") and two were the breadcrumb
 *     trail ("الرئيسية / الأثاث والمفروشات").
 *   - The category description published a product count and claimed a
 *     warranty for every category regardless of the data.
 *
 * Static assertions run always. The live-page checks need a server and skip
 * cleanly without one.
 *
 *   node tests/test-seo-metadata.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const BASE = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3005}`;

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

const pages = () => fs.readdirSync(REPO).filter((f) => f.endsWith('.html'));
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

(async () => {
  console.log('\nSEO metadata\n');

  // --- 1. Nothing points at an asset that does not exist -------------------
  await test('no page references the og:image that never existed', () => {
    const bad = pages().filter((f) => read(f).includes('placeholder-logo.webp'));
    assert.strictEqual(bad.length, 0,
      bad.length + ' page(s) still point at assets/placeholder-logo.webp: ' + bad.slice(0, 5).join(', '));
  });

  await test('no page references the favicon that never existed', () => {
    const bad = pages().filter((f) => read(f).includes('assets/images/favicon.png'));
    assert.strictEqual(bad.length, 0, bad.join(', '));
  });

  await test('every brand asset a page links actually exists on disk', () => {
    const referenced = new Set();
    for (const f of pages()) {
      for (const m of read(f).matchAll(/(?:href|content)="(\/assets\/brand\/[^"]+|\/site\.webmanifest)"/g)) {
        referenced.add(m[1]);
      }
      for (const m of read(f).matchAll(/content="https:\/\/zeyad\.store(\/assets\/brand\/[^"]+)"/g)) {
        referenced.add(m[1]);
      }
    }
    // Five paths reach the pages: the SVG, the 32px PNG, apple-touch-icon,
    // the manifest and the OG card. icon-192 and icon-512 are referenced by
    // the manifest instead, and are checked by the manifest assertion.
    assert.ok(referenced.size >= 5, 'expected the icon set to be referenced, found ' + referenced.size);
    for (const rel of referenced) {
      /* Strip the cache-busting query before looking on disk. These carry a
         content hash now -- see the next assertion for why. */
      const onDisk = rel.replace(/^\//, '').replace(/\?.*$/, '');
      assert.ok(fs.existsSync(path.join(REPO, onDisk)), rel + ' is referenced but missing on disk');
    }
  });

  await test('the brand assets are cache-busted, so a changed mark reaches visitors', () => {
    /* nginx serves these with `max-age=31536000, immutable` and Cloudflare
       honours it. When the mark changed from an olive ز to a gold Z the origin
       had the new file within seconds and the edge kept serving the old one --
       measured cf-cache-status HIT, Age 10,572, against a file replaced
       moments earlier. A purge fixes that once; a content hash in the URL
       fixes it for every future change, because a changed file becomes a URL
       no cache has seen.

       Asserted rather than trusted: dropping these from STAMPED in
       scripts/inject-storefront-2026.js would silently bring the problem back,
       and nobody would notice until a rebrand appeared not to deploy. */
    /* The injector keeps a SKIP list, and a page on it is never stamped. Read
       that list rather than keeping a second copy here: appliances_test.html
       is on it, is in no sitemap, is linked from nowhere and answers 404 on
       the live site, so holding it to a rule about what visitors receive would
       be asserting something about a page no visitor can reach. */
    const injector = fs.readFileSync(path.join(REPO, 'scripts', 'inject-storefront-2026.js'), 'utf8');
    const skipBlock = injector.match(/const SKIP = new Set\(\[([^\]]*)\]\)/);
    const skip = new Set(skipBlock ? [...skipBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);

    const unstamped = [];
    for (const f of pages()) {
      if (skip.has(f)) continue;
      const s = read(f);
      for (const asset of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) {
        const m = s.match(new RegExp('/assets/brand/' + asset.replace('.', '\\.') + '(\\?v=[a-f0-9]+)?'));
        if (m && !m[1]) unstamped.push(f + ' -> ' + asset);
      }
      const man = s.match(/\/site\.webmanifest(\?v=[a-f0-9]+)?/);
      if (man && !man[1]) unstamped.push(f + ' -> site.webmanifest');
    }
    assert.strictEqual(unstamped.length, 0,
      'these are served immutable for a year with no version in the URL: ' + unstamped.slice(0, 5).join('; '));
  });

  await test('the social card and logo carry a content version too', () => {
    /* Facebook, WhatsApp and TikTok each cache an og:image keyed on its URL,
       and this shop's visitors all arrive from one of those. A share posted
       before a rebrand would otherwise keep showing the old card forever. */
    const c = require('../config/constants');
    assert.ok(/\?v=[a-f0-9]{6,}$/.test(c.DEFAULT_OG_IMAGE),
      'og:image has no content version: ' + c.DEFAULT_OG_IMAGE);
    assert.ok(/\?v=[a-f0-9]{6,}$/.test(c.BRAND_LOGO),
      'the logo has no content version: ' + c.BRAND_LOGO);
  });

  await test('the manifest is valid JSON and names the current brand', () => {
    const m = JSON.parse(fs.readFileSync(path.join(REPO, 'site.webmanifest'), 'utf8'));
    assert.strictEqual(m.name, 'زياد ستور');
    assert.ok(Array.isArray(m.icons) && m.icons.length >= 2, 'manifest needs at least a 192 and a 512 icon');
    for (const i of m.icons) {
      const onDisk = i.src.replace(/^\//, '').split('?')[0];
      assert.ok(fs.existsSync(path.join(REPO, onDisk)), 'manifest icon missing: ' + i.src);

      /* Stamped, and this is not decoration. nginx serves these with a long
         max-age, so a phone that installed the shop while the mark was still
         an olive Arabic "ز" kept that icon on its home screen however many
         times the file was replaced. The manifest is cache-busted in the HTML;
         the URLs INSIDE it were not, which is the gap this closes. */
      assert.ok(/\?v=[0-9a-f]{8}$/.test(i.src),
        'manifest icon is not cache-busted, so a home-screen icon can never change: ' + i.src);
    }
    assert.ok(m.icons.some((i) => String(i.purpose || '').includes('maskable')),
      'Android crops a non-maskable icon into a circle and clips the mark');

    /* The retired brand's olive green. The header renders white in light mode
       and #141d18 in dark, so this painted a green status bar above a white
       header -- in the one colour the operator asked never to see again. */
    assert.notStrictEqual(String(m.theme_color || '').toLowerCase(), '#23382e',
      'the manifest still carries the retired olive theme colour');
  });

  await test('no page still declares the retired olive theme colour', () => {
    const offenders = pages().filter((f) => read(f).includes('#23382e'));
    assert.deepStrictEqual(offenders, [],
      'the olive theme-color survives on: ' + offenders.slice(0, 5).join(', '));
  });

  // --- 2. Every page carries the icon set ---------------------------------
  await test('every page links the favicon and the manifest', () => {
    const missingIcon = pages().filter((f) => !read(f).includes('/assets/brand/favicon.svg'));
    const missingManifest = pages().filter((f) => !read(f).includes('rel="manifest"'));
    assert.strictEqual(missingIcon.length, 0, 'no favicon on: ' + missingIcon.slice(0, 5).join(', '));
    assert.strictEqual(missingManifest.length, 0, 'no manifest on: ' + missingManifest.slice(0, 5).join(', '));
  });

  // --- 3. Social metadata is complete and not duplicated -------------------
  await test('every page has a complete Open Graph set', () => {
    const required = ['og:title', 'og:description', 'og:image', 'og:url', 'og:site_name'];
    const gaps = [];
    for (const f of pages()) {
      const s = read(f);
      // og:url comes from the canonical; a page without one is reported by the
      // canonical check instead of twice here.
      for (const tag of required) {
        if (tag === 'og:url' && !/rel="canonical"/.test(s)) continue;
        if (!s.includes('property="' + tag + '"')) gaps.push(f + ' -> ' + tag);
      }
    }
    assert.strictEqual(gaps.length, 0, gaps.slice(0, 8).join('; '));
  });

  await test('no page carries a duplicate title, description or canonical', () => {
    const bad = [];
    for (const f of pages()) {
      const s = read(f);
      const n = (re) => (s.match(re) || []).length;
      if (n(/<title>/gi) > 1) bad.push(f + ' titles x' + n(/<title>/gi));
      if (n(/<meta[^>]+name="description"/gi) > 1) bad.push(f + ' descriptions');
      if (n(/rel="canonical"/gi) > 1) bad.push(f + ' canonicals');
      if (n(/property="og:image"/gi) > 1) bad.push(f + ' og:image');
    }
    assert.strictEqual(bad.length, 0, bad.slice(0, 8).join('; '));
  });

  // --- 4. The descriptions that were scraped fragments ---------------------
  await test('no description is a breadcrumb trail or two headings run together', () => {
    /* Only pages a crawler may actually index. visual-cms.js injects
       noindex,nofollow for the rest at render time, so the list is read from
       there rather than duplicated here -- a page added to that set must not
       start failing this test. */
    const cms = fs.readFileSync(path.join(ROOT, 'middleware/visual-cms.js'), 'utf8');
    const block = cms.slice(cms.indexOf('const NOINDEX_PAGES'), cms.indexOf(']);', cms.indexOf('const NOINDEX_PAGES')));
    const noindex = new Set([...block.matchAll(/'([a-z0-9_-]+)'/gi)].map((m) => m[1]));
    assert.ok(noindex.size > 5, 'could not read NOINDEX_PAGES out of visual-cms.js');

    const bad = [];
    for (const f of pages()) {
      if (noindex.has(f.replace(/.html$/, ''))) continue;
      const m = read(f).match(/<meta\s+name="description"\s+content="([^"]*)"/i);
      if (!m) continue;
      const d = m[1].trim();
      if (/^الرئيسية\s*\//.test(d)) bad.push(f + ': breadcrumb -> "' + d + '"');
      // A word ending in a letter immediately followed by و + another word is
      // how "…ذوقك" + "وجودة…" appeared when two lines were concatenated.
      if (/[ء-ي]{4,}(?:وجودة|وضمان|بخامات)/.test(d)) bad.push(f + ': run-together -> "' + d + '"');
      if (d.length < 40) bad.push(f + ': too short (' + d.length + ' chars) -> "' + d + '"');
    }
    assert.strictEqual(bad.length, 0, bad.slice(0, 6).join('; '));
  });

  await test('titles and descriptions are unique across the storefront', () => {
    const titles = {}, descs = {};
    for (const f of pages()) {
      const s = read(f);
      const t = (s.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      const d = (s.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1];
      if (t) (titles[t.trim()] ||= []).push(f);
      if (d) (descs[d.trim()] ||= []).push(f);
    }
    const dupT = Object.entries(titles).filter(([, v]) => v.length > 1);
    const dupD = Object.entries(descs).filter(([, v]) => v.length > 1);
    assert.strictEqual(dupT.length, 0, 'shared titles: ' + dupT.slice(0, 3).map(([k, v]) => '"' + k.slice(0, 40) + '" on ' + v.join('+')).join('; '));
    assert.strictEqual(dupD.length, 0, 'shared descriptions: ' + dupD.slice(0, 3).map(([, v]) => v.join('+')).join('; '));
  });

  // --- 5. The retired brand ------------------------------------------------
  await test('nothing a customer receives carries a retired brand name', () => {
    /* The company is زياد ستور. It used to trade under two other names, and
       those were still reaching customers in four places nobody had swept:
       the site header and the drawer, Najm's opening greeting, the signature
       on every WhatsApp message the shop sends, and the letterhead of the two
       printed documents. They were also being republished to Google as
       schema.org alternateName -- telling a crawler the business answers to
       four names, which is the opposite of one strong identity.

       This checks everything a customer can end up holding: the pages, the
       client scripts, the WhatsApp formatter and the print templates.

       Comments are stripped first. The history is worth recording in the
       source, and a note explaining why a name was retired must not read as
       the name still being used. */
    const RETIRED = ['زياد للتجارة', 'زياد للتجاره', 'زياد للأعمال', 'Zeyad For Business'];
    const strip = (s) => s
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    const targets = [];
    for (const f of pages()) targets.push([f, strip(read(f))]);
    for (const rel of [
      'assets/js/core/global-ux.js',
      'assets/js/najm-chat.js',
      'assets/js/core/translations.js',
      'site.js'
    ]) {
      const abs = path.join(REPO, rel);
      if (fs.existsSync(abs)) targets.push([rel, strip(fs.readFileSync(abs, 'utf8'))]);
    }
    for (const rel of [
      'utils/whatsapp-prep.js',
      'views/admin/requests/print.ejs',
      'views/admin/customer-reports/print.ejs'
    ]) {
      const abs = path.join(ROOT, rel);
      if (fs.existsSync(abs)) targets.push([rel, strip(fs.readFileSync(abs, 'utf8'))]);
    }

    const bad = [];
    for (const [name, body] of targets) {
      for (const n of RETIRED) if (body.includes(n)) bad.push(name + ' -> ' + n);
    }
    assert.strictEqual(bad.length, 0, bad.slice(0, 8).join('; '));
  });

  await test('the structured data claims one name, not four', () => {
    const c = require('../config/constants');
    assert.strictEqual(c.BRAND_AR, 'زياد ستور');
    assert.deepStrictEqual(c.BRAND_ALTERNATES, ['Zeyad Store'],
      'alternateName should carry only the English rendering of the current name');
  });

  // --- 6. Claims the data does not support --------------------------------
  await test('the category description publishes no count and no blanket warranty', () => {
    const svc = fs.readFileSync(path.join(ROOT, 'services/product-seo-service.js'), 'utf8');
    const cat = svc.slice(svc.indexOf('const description = count > 0'));
    assert.ok(!/\$\{count\}\s*منتج/.test(cat),
      'the category meta description still prints how many products the shop has');
    assert.ok(!/ضمان معتمد/.test(cat),
      'the category description still claims a warranty for every category');
  });

  await test('the title tidier squeezes whitespace, not the letter s', () => {
    // It shipped as replace(/s+/g, ' ') -- the backslash lost in transit -- so
    // it replaced runs of the LETTER s. "Samsung Smart TV" became
    // "Sam ung Smart TV" in the title and the meta description. The category
    // call only looked correct because the .trim() after it did the visible
    // work on a trailing space.
    const svc = fs.readFileSync(path.join(ROOT, 'services/product-seo-service.js'), 'utf8');
    assert.ok(!svc.includes("replace(/s+/g"),
      'the tidier matches the letter s instead of whitespace');

    const m = svc.match(/const tidy = ([^;]+);/);
    assert.ok(m, 'could not find the tidy helper');
    // eslint-disable-next-line no-new-func
    const tidy = new Function('return ' + m[1])();
    assert.strictEqual(tidy('Samsung Smart TV'), 'Samsung Smart TV',
      'an English product name is being corrupted');
    assert.strictEqual(tidy('غرفه نوم ملكي  (N)'), 'غرفه نوم ملكي (N)');
    assert.strictEqual(tidy('غرف نوم سويدي '), 'غرف نوم سويدي');
  });

  // --- What Search Console asked for, and what it will not get -----------
  //
  // Google reported five structured-data issues on this shop. Three are real
  // omissions and are fixed. Two ask for review data that does not exist, and
  // fabricating it would be a policy violation, so they stay reported.

  const sampleProduct = () => ({
    id: 'P-853157', product_id: 'P-853157',
    // Deliberately the messy values the live rows actually carry.
    title: 'غرف نوم خشب ماليزي (طوفان ) ',
    brand: 'موديل تركي ',
    categoryName: 'غرف نوم ماليزي (مودرن ) ',
    departmentName: 'غرف النوم',
    departmentSlug: 'bedrooms', categorySlug: 'maliz',
    price: 1350, stock_status: 'in-stock',
    main_image: '/uploads/products/prod-1788613139149-275008.webp',
    description: 'غرفة نوم'
  });

  const productLd = (overrides) => {
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo(Object.assign(sampleProduct(), overrides || {}));
    const blocks = [...seo.jsonLd.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]));
    return blocks.find((b) => b['@type'] === 'Product');
  };

  await test('every JSON-LD block a product page emits is valid JSON', () => {
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo(sampleProduct());
    const blocks = [...seo.jsonLd.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 2, 'expected Product and BreadcrumbList');
    for (const b of blocks) JSON.parse(b[1]);   // throws on malformed output
  });

  await test('the offer states the return policy the shop actually publishes', () => {
    const p = productLd();
    const r = p.offers.hasMerchantReturnPolicy;
    assert.ok(r, 'hasMerchantReturnPolicy is missing -- Search Console flagged this');
    assert.strictEqual(r.applicableCountry, 'YE');
    // returns.html says seven days for a refund. The 14-day EXCHANGE window
    // must not be published as the refund window.
    assert.strictEqual(r.merchantReturnDays, 7,
      'the published return window disagrees with returns.html');
    assert.strictEqual(r.returnPolicyCategory,
      'https://schema.org/MerchantReturnFiniteReturnWindow');
    assert.ok(/returns\.html$/.test(r.merchantReturnLink));
  });

  await test('the offer states shipping the checkout would actually charge', () => {
    const { DELIVERY_FALLBACK_SAR } = require('../config/constants');
    const p = productLd();
    const sd = p.offers.shippingDetails;
    assert.ok(sd, 'shippingDetails is missing -- Search Console flagged this');
    assert.strictEqual(sd.shippingDestination.addressCountry, 'YE');
    // The published range must bracket what delivery-service.js charges, or a
    // shopper sees one price in the search result and another at checkout.
    assert.strictEqual(sd.shippingRate.minValue,
      Math.min(DELIVERY_FALLBACK_SAR.sanaa.min, DELIVERY_FALLBACK_SAR.provinces.min));
    assert.strictEqual(sd.shippingRate.maxValue,
      Math.max(DELIVERY_FALLBACK_SAR.sanaa.max, DELIVERY_FALLBACK_SAR.provinces.max));
    assert.strictEqual(sd.shippingRate.currency, 'SAR');
    // No addressRegion: Yemen's subdivision code for "صنعاء" is ambiguous and
    // a guess published as a shipping commitment is worse than a wider range.
    assert.ok(!sd.shippingDestination.addressRegion,
      'an ISO subdivision code is being guessed');
  });

  await test('shipping is not restated in a currency the checkout never quotes', () => {
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo(sampleProduct(), 'YER');
    const blocks = [...seo.jsonLd.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const p = blocks.find((b) => b['@type'] === 'Product');
    assert.ok(!p.offers.shippingDetails,
      'a SAR delivery range was published against a non-SAR offer');
  });

  await test('the name and brand carry no stray spaces', () => {
    /* This test used to also assert that `category` was the shop's Arabic path,
       "غرف النوم > غرف نوم ماليزي (مودرن )". That assertion is gone, and not
       because it became inconvenient: it locked in the exact value Search
       Console keeps rejecting. `category` on a merchant listing is read
       against Google's product taxonomy, so an Arabic path can be perfectly
       tidy and still be an invalid value. The taxonomy tests above cover what
       replaced it.

       The name and brand checks stay. They came from real data -- products
       named "غرف نوم ماليزي (مودرن )" and brands like "موديل تركي " with a
       trailing space pasted in from a supplier's sheet. */
    const p = productLd();
    assert.ok(!/^\s|\s$/.test(p.name), 'the product name has leading or trailing space');
    assert.ok(!/^\s|\s$/.test(p.brand.name), 'the brand has leading or trailing space');
  });

  await test('a product with no department publishes no category', () => {
    /* It used to fall back to the bare category name. That fallback was
       publishing Arabic into a field Google reads as taxonomy, so the honest
       answer for a product whose department is unknown is to say nothing: a
       missing recommended field is a milder notice than a wrong value. */
    const p = productLd({ departmentName: null, departmentSlug: null });
    assert.strictEqual(p.category, undefined);
  });

  await test('a rating is published only from reviews a customer actually wrote', () => {
    /* This assertion used to be "aggregateRating is never emitted", which was
       right while no reviews table existed. One exists now
       (migrations/2026-09-07-product-reviews.sql) and approved rows in it DO
       get published -- that is the whole point of building it.

       What must never come back is the shortcut: products.rating and
       products.reviews_count hold values seeded at catalogue import that no
       customer wrote, and publishing those is review fraud as Google defines
       it. So the rule is now about the SOURCE, not about the field. The
       behaviour itself -- no reviews means no rating, not a zero -- is proved
       against a live database in test-product-reviews.js. */
    const code = fs.readFileSync(path.join(ROOT, 'services/product-seo-service.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    assert.ok(!/product\.rating|reviews_count/.test(code),
      'the SEO service reads the seeded rating columns instead of real reviews');

    // And the rating must sit behind a check that real reviews exist.
    assert.ok(/reviews\s*&&\s*reviews\.aggregate\s*&&\s*reviews\.aggregate\.count\s*>\s*0/.test(code),
      'aggregateRating is emitted without first proving there are approved reviews');
  });

  // --- 7. Live pages, when a server is up ---------------------------------
  let up = true;
  try { up = (await fetch(BASE + '/api/health')).ok; } catch (_) { up = false; }

  if (!up) {
    console.log('\n  (no server at ' + BASE + ' — live checks skipped)');
  } else {
    await test('every brand asset serves 200 with the right content type', async () => {
      const expect = {
        '/site.webmanifest': /manifest|json/,
        '/assets/brand/favicon.svg': /svg/,
        '/assets/brand/apple-touch-icon.png': /png/,
        '/assets/brand/icon-192.png': /png/,
        '/assets/brand/icon-512.png': /png/,
        '/assets/brand/og-default.png': /png/
      };
      for (const [p, ct] of Object.entries(expect)) {
        const r = await fetch(BASE + p);
        assert.strictEqual(r.status, 200, p + ' returned ' + r.status);
        assert.ok(ct.test(r.headers.get('content-type') || ''),
          p + ' served as ' + r.headers.get('content-type'));
      }
    });

    await test('every JSON-LD block on the main pages parses', async () => {
      for (const p of ['index', 'bedrooms', 'appliances', 'offers', 'about']) {
        const html = await (await fetch(BASE + '/' + p + '.html')).text();
        const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
        assert.ok(blocks.length > 0, p + ' has no structured data at all');
        for (const b of blocks) {
          try { JSON.parse(b[1].trim()); }
          catch (e) { throw new Error(p + ': ' + e.message.slice(0, 80)); }
        }
      }
    });

    await test('the sitemap lists no private page', async () => {
      const xml = await (await fetch(BASE + '/sitemap.xml')).text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.ok(locs.length > 0, 'the sitemap is empty');
      const priv = locs.filter((u) => /\/(cart|checkout|confirmation|account|login)/.test(u));
      assert.strictEqual(priv.length, 0, 'private URLs in the sitemap: ' + priv.slice(0, 3).join(', '));
      const offHost = locs.filter((u) => !u.startsWith('https://zeyad.store/'));
      assert.strictEqual(offHost.length, 0, 'non-canonical host in the sitemap: ' + offHost.slice(0, 3).join(', '));
    });

    await test('cart, checkout and account stay out of the index', async () => {
      for (const p of ['cart', 'checkout', 'account']) {
        const html = await (await fetch(BASE + '/' + p + '.html')).text();
        assert.ok(/name="robots"[^>]+content="[^"]*noindex/i.test(html),
          p + '.html is missing its noindex directive');
      }
    });
  }

  // --- No page names a street ---------------------------------------------

  await test('no page publishes a street address', () => {
    /* This shop has several warehouses and showrooms, stock differs between
       them, and a visit is arranged in advance so the customer is sent to the
       branch that actually holds what they came for. A fixed street address
       does the one thing that must never happen here: it sends somebody to a
       door that may hold nothing they want.

       It was in the footer of 59 pages ("صنعاء، شارع الزبيري"), on the
       branches page as two invented showrooms with their own opening hours,
       and on the reservation page as a made-up villa number shown to every
       customer as though it were their own delivery address. */
    const STREET_WORDS = ['الزبيري', 'حي حدة', 'شارع صفر', 'تقاطع عصر', 'فيلا رقم'];
    const offenders = [];
    for (const f of pages()) {
      const html = read(f);
      for (const w of STREET_WORDS) {
        if (html.includes(w)) offenders.push(f + ' -> ' + w);
      }
    }
    assert.deepStrictEqual(offenders, [],
      'a street address is published again: ' + offenders.slice(0, 6).join(', '));
  });

  await test('the Organization publishes a city and a country, never a street', () => {
    const { BUSINESS } = require('../config/constants');
    assert.ok(BUSINESS.city, 'the city is missing');
    assert.ok(BUSINESS.country, 'the country is missing');
    assert.strictEqual(BUSINESS.streetAddress, undefined,
      'a streetAddress was added to the business constants');

    const src = fs.readFileSync(path.join(ROOT, 'middleware', 'visual-cms.js'), 'utf8');
    const block = src.slice(src.indexOf("'@type': 'PostalAddress'"), src.indexOf('areaServed'));
    assert.ok(!/streetAddress/.test(block),
      'the PostalAddress node now carries a street');
  });

  await test('the footer offers a booking link where the address used to be', () => {
    /* Removing the address is only half of it. The useful next step from
       "where are you?" is arranging a visit, not navigating to a street. */
    const missing = pages().filter((f) => {
      const html = read(f);
      if (!html.includes('footer_address')) return false;
      const m = html.match(/<[^>]*data-vid="footer_address"[^>]*>/);
      return !m || !/book-appointment\.html/.test(m[0]);
    });
    assert.deepStrictEqual(missing, [],
      'these pages show an address that leads nowhere: ' + missing.slice(0, 5).join(', '));
  });

  await test('the appointment form asks what to view, not which shop to pick', () => {
    /* "اختر الفرع المطلوب" with options "محل الأثاث", "محل المجالس" asked the
       customer to know which of several warehouses holds the thing they want.
       They do not know that, and the whole point of booking is that the
       administration tells them. */
    const html = read('book-appointment.html');
    assert.ok(!/محل ال/.test(html),
      'the form still asks the customer to choose a shop');
    assert.ok(html.includes('value="all"'),
      'somebody furnishing a whole house still cannot say so');
    assert.ok(/name="fullName"/.test(html) && /name="phone"/.test(html),
      'the form no longer collects the name and number the office calls back on');
  });

  // --- The sitemap is a set of claims about what is worth crawling --------

  await test('the sitemap lists no page that does not exist', () => {
    /* It listed /flash-deals.html and /return-policy.html, and neither file
       has ever been in this repository -- so the sitemap submitted to Google
       advertised two 404s. The returns page is returns.html, which
       constants.js has always pointed the return policy at; the sitemap was
       the only thing naming a page that was not there.

       Being wrong here costs trust on a domain that has little to spare. */
    const src = fs.readFileSync(path.join(ROOT, 'utils', 'sitemap-generator.js'), 'utf8');
    const listed = [...src.matchAll(/path:\s*'(\/[^']*\.html)'/g)].map((m) => m[1]);
    assert.ok(listed.length > 5, 'the static route list was not found');

    const missing = listed.filter(
      (p) => !fs.existsSync(path.join(REPO, p.replace(/^\//, '')))
    );
    assert.deepStrictEqual(missing, [],
      'the sitemap advertises pages that do not exist: ' + missing.join(', '));
  });

  await test('the id-less templates are excluded from the sitemap', () => {
    /* product.html and category.html only mean anything with an ?id=. Both of
       those forms are listed in full -- every product, every category. The
       bare files render a loading skeleton, so submitting them asks a new
       domain to spend crawl budget on two pages that can never be useful and
       can only look thin beside the real ones. */
    const src = fs.readFileSync(path.join(ROOT, 'utils', 'sitemap-generator.js'), 'utf8');
    for (const page of ['product', 'category']) {
      const pattern = new RegExp('\\^\\\\/' + page + '\\\\.html\\$');
      assert.ok(pattern.test(src),
        'the bare ' + page + '.html template is not excluded from the sitemap');
    }
  });

  await test('the id-less templates are served noindex', () => {
    // Not submitting a page is not the same as not indexing it: one link from
    // anywhere is enough.
    const src = fs.readFileSync(path.join(ROOT, 'middleware', 'visual-cms.js'), 'utf8');
    assert.ok(/isBareTemplate/.test(src), 'nothing marks the id-less templates');
    assert.ok(/baseSlug === 'product' \|\| baseSlug === 'category'/.test(src),
      'the bare-template rule does not cover both templates');
  });

  // --- The category Google actually validates ------------------------------

  await test('the product category is a real Google taxonomy path', () => {
    /* Search Console: "القيمة غير صالحة في الحقل category". The page used to
       publish the shop's own Arabic path, "غرف النوم > غرف نوم ملكي". An
       earlier pass assumed punctuation was the cause and trimmed the values;
       the data came out clean and the report did not change. `category` on a
       merchant listing is read against GOOGLE'S taxonomy, and Arabic free text
       is not in it.

       Every path is checked here against the real vocabulary, because the
       first attempt at this from memory produced "Furniture > Bedroom
       Furniture" -- which does not exist in Google's file. */
    const src = fs.readFileSync(path.join(ROOT, 'services', 'product-seo-service.js'), 'utf8');
    const block = src.match(/const GOOGLE_CATEGORY = \{[\s\S]*?\n  \};/);
    assert.ok(block, 'the category mapping is gone');

    const values = [...block[0].matchAll(/'([^']*>[^']*|Furniture)'/g)].map((m) => m[1]);
    assert.ok(values.length >= 5, 'expected a path per department, found ' + values.length);

    for (const v of values) {
      assert.ok(!/[\u0600-\u06FF]/.test(v), 'an Arabic value is still published: ' + v);
      assert.ok(v === v.trim(), 'padded value: ' + JSON.stringify(v));
      assert.ok(!/\s{2,}/.test(v), 'double space in: ' + v);
      // Google's own separator is " > ", spaces included.
      if (v.includes('>')) {
        assert.ok(/^[^>]+( > [^>]+)+$/.test(v), 'malformed path separator: ' + v);
      }
    }

    // The one that matters: the whole live catalogue is bedroom sets.
    assert.ok(values.includes('Furniture > Furniture Sets > Bedroom Furniture Sets'),
      'the bedrooms department no longer maps to its taxonomy path');
  });

  await test('a product emits the taxonomy path, not the Arabic one', () => {
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo({
      id: 'P-C', title: 'غرفة نوم', price: 2000, image: '/a.png', stock_status: 'in-stock',
      departmentSlug: 'bedrooms', departmentName: 'غرف النوم', categoryName: 'غرف نوم ملكي'
    }, 'SAR', null);
    const product = JSON.parse(seo.jsonLd.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.strictEqual(product.category, 'Furniture > Furniture Sets > Bedroom Furniture Sets');
  });

  await test('an unmapped department publishes no category rather than a guess', () => {
    /* "العروض" is a promotion, not a kind of thing. A missing recommended
       field is a milder notice than an invalid value, and it is honest. */
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo({
      id: 'P-D', title: 'منتج', price: 100, image: '/a.png', stock_status: 'in-stock',
      departmentSlug: 'offers', departmentName: 'العروض'
    }, 'SAR', null);
    const product = JSON.parse(seo.jsonLd.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.strictEqual(product.category, undefined, 'a category was invented: ' + product.category);
  });

  await test('the Arabic path a shopper reads is still published as a breadcrumb', () => {
    // Moving category to English must not cost the human-readable trail.
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo({
      id: 'P-E', title: 'غرفة نوم', price: 2000, image: '/a.png', stock_status: 'in-stock',
      departmentSlug: 'bedrooms', departmentName: 'غرف النوم', categoryName: 'غرف نوم ملكي'
    }, 'SAR', null);
    assert.ok(/BreadcrumbList/.test(seo.jsonLd), 'the breadcrumb is gone');
    assert.ok(/غرف نوم ملكي/.test(seo.jsonLd), 'the Arabic category vanished from the page entirely');
  });

  // --- The delivery window Search Console asked for ----------------------

  await test('shippingDetails publishes a delivery time', () => {
    /* Search Console, on every product: "deliveryTime not included in
       offers.shippingDetails". It was omitted on purpose -- the product rows
       cannot support it, with 47 of 57 empty and 10 holding the letter "T" --
       but the page itself promises "2-5 أيام عمل" in the trust row beside the
       price, and structured data that says what the page says is exactly the
       version worth publishing. */
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo(
      { id: 'P-T', title: 'منتج', price: 1000, image: '/a.png', stock_status: 'in-stock' },
      'SAR', null
    );
    const block = seo.jsonLd.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
    const product = JSON.parse(block);
    const ship = product.offers.shippingDetails;

    assert.ok(ship, 'there is no shippingDetails at all');
    assert.ok(ship.deliveryTime, 'deliveryTime is still missing');
    assert.strictEqual(ship.deliveryTime['@type'], 'ShippingDeliveryTime');

    const t = ship.deliveryTime.transitTime;
    assert.ok(t, 'no transitTime');
    assert.strictEqual(t['@type'], 'QuantitativeValue');
    assert.strictEqual(t.unitCode, 'DAY', 'Google expects day counts');
    assert.ok(Number.isFinite(t.minValue) && Number.isFinite(t.maxValue),
      'the day counts are not numbers');
    assert.ok(t.minValue <= t.maxValue, 'the window runs backwards');
  });

  await test('the published delivery window is the one the page promises', () => {
    /* If these ever drift, the shop tells Google one thing and the shopper
       another. The trust row on product.html is the source. */
    const html = fs.readFileSync(path.join(REPO, 'product.html'), 'utf8');
    const promise = html.match(/(\d+)\s*-\s*(\d+)\s*أيام عمل/);
    assert.ok(promise, 'the page no longer promises a delivery window — update the constant');

    const { DELIVERY_FALLBACK_SAR } = require('../config/constants');
    assert.strictEqual(DELIVERY_FALLBACK_SAR.transitDays.min, Number(promise[1]),
      'the schema and the page disagree about the fastest delivery');
    assert.strictEqual(DELIVERY_FALLBACK_SAR.transitDays.max, Number(promise[2]),
      'the schema and the page disagree about the slowest delivery');
  });

  await test('no handling time is invented alongside it', () => {
    /* Google reads total delivery as handling + transit. Nothing records a
       handling time, and adding one would silently widen the promise. */
    const { buildProductSeo } = require('../services/product-seo-service');
    const seo = buildProductSeo(
      { id: 'P-T', title: 'منتج', price: 1000, image: '/a.png', stock_status: 'in-stock' },
      'SAR', null
    );
    const product = JSON.parse(seo.jsonLd.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.strictEqual(product.offers.shippingDetails.deliveryTime.handlingTime, undefined,
      'a handling time was invented');
  });

  // --- The icon Google shows beside a result ------------------------------

  await test('/favicon.ico exists at the site root', () => {
    /* Every browser and crawler requests this path directly, whatever the
       <link> tags say. Ours returned 404, which is one of the two reasons
       search results showed the default globe instead of the gold Z. */
    const ico = path.join(REPO, 'favicon.ico');
    assert.ok(fs.existsSync(ico), 'there is no /favicon.ico');

    const b = fs.readFileSync(ico);
    assert.ok(b.length > 100, 'favicon.ico is empty');
    assert.strictEqual(b.readUInt16LE(0), 0, 'not an ICO: reserved field');
    assert.strictEqual(b.readUInt16LE(2), 1, 'not an ICO: type field');

    const count = b.readUInt16LE(4);
    assert.ok(count >= 1, 'the ICO contains no images');

    const sizes = [];
    for (let i = 0; i < count; i++) {
      const at = 6 + i * 16;
      sizes.push(b.readUInt8(at) || 256);
    }
    assert.ok(sizes.includes(48),
      'the ICO has no 48x48 image, which is the size Google reads: ' + sizes.join(', '));
  });

  await test('a declared icon meets Google\'s multiple-of-48 rule', () => {
    /* Google states the favicon must be square and a multiple of 48 pixels.
       The set used to be 32, 180, 192 and 512 -- only the 192 qualified, and
       the tag a crawler reads first pointed at the 32. */
    const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    const declared = [...html.matchAll(/<link[^>]*rel="icon"[^>]*>/g)].map((m) => m[0]);
    assert.ok(declared.length, 'no icon is declared at all');

    const multiples = declared.filter((tag) => {
      const m = tag.match(/sizes="(\d+)x(\d+)"/);
      if (!m) return false;
      const w = Number(m[1]), h = Number(m[2]);
      return w === h && w % 48 === 0;
    });
    assert.ok(multiples.length > 0,
      'no declared PNG icon is a square multiple of 48: ' + declared.join(' '));
  });

  await test('every page declares the root icon, not just the home page', () => {
    const pages = fs.readdirSync(REPO).filter((f) => f.endsWith('.html'));
    const missing = pages.filter((f) => {
      const html = fs.readFileSync(path.join(REPO, f), 'utf8');
      return !html.includes('href="/favicon.ico"');
    });
    assert.deepStrictEqual(missing, [],
      'these pages do not point at the root icon: ' + missing.join(', '));
  });

  await test('the 48 and 96 icons exist on disk and are the size they claim', () => {
    for (const [name, expected] of [['favicon-48.png', 48], ['favicon-96.png', 96]]) {
      const file = path.join(REPO, 'assets', 'brand', name);
      assert.ok(fs.existsSync(file), name + ' is missing');
      const b = fs.readFileSync(file);
      // PNG IHDR: width at byte 16, height at byte 20.
      assert.strictEqual(b.readUInt32BE(16), expected, name + ' is the wrong width');
      assert.strictEqual(b.readUInt32BE(20), expected, name + ' is the wrong height');
    }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
