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

  await test('category is a path, and neither it nor the name carries stray spaces', () => {
    const p = productLd();
    assert.strictEqual(p.category, 'غرف النوم > غرف نوم ماليزي (مودرن )',
      'category should be department > category, tidied');
    assert.ok(!/^\s|\s$/.test(p.name), 'the product name has leading or trailing space');
    assert.ok(!/^\s|\s$/.test(p.brand.name), 'the brand has leading or trailing space');
  });

  await test('a product with no department still gets a usable category', () => {
    const p = productLd({ departmentName: null });
    assert.strictEqual(p.category, 'غرف نوم ماليزي (مودرن )');
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
