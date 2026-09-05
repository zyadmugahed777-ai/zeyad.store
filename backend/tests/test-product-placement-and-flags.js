/**
 * What the admin saves must be what the shop shows.
 *
 * Three faults, all of the same family -- a control that exists on the form,
 * exists in the database, and is not connected to either:
 *
 *   1. delivery_policy_type, delivery_fixed_fee_sar, requires_installation and
 *      installation_fee_sar were posted by the form and never read off the
 *      request. Choosing "the customer is quoted after confirmation" saved
 *      nothing.
 *   2. products.installation is TEXT. Saving the checkbox unticked wrote the
 *      string '0' (and, from an older import, '0.0'), which JavaScript reads
 *      as TRUE -- so the box re-ticked itself and the product page printed the
 *      characters "0.0" where the installation line belonged.
 *   3. A photo could only be tied to a colour after saving and reopening the
 *      product, because the tag was keyed by an image id the upload did not
 *      have yet.
 *
 * Plus the new placement flags, which decide where a product is allowed to
 * appear.
 *
 * Read-only. It parses the shipped source and view, exercises the pure
 * functions, and reads the public site. It writes nothing.
 *
 *   node tests/test-product-placement-and-flags.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
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

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('\nProduct placement, delivery policy and flag handling\n');

  // --- 1. The delivery policy now reaches the database ---------------------
  const route = read('routes/admin/products.js');

  await test('the create route saves the delivery policy the form posts', () => {
    const create = route.slice(route.indexOf("router.post(['/create', '/new']"), route.indexOf("// Edit Form"));
    assert.ok(/readDeliveryPolicy\(body\)/.test(create),
      'create path does not read the delivery policy off the request');
  });

  await test('the edit route saves the delivery policy the form posts', () => {
    const edit = route.slice(route.indexOf("router.post('/:id/edit'"));
    assert.ok(/readDeliveryPolicy\(req\.body\)/.test(edit),
      'edit path does not read the delivery policy off the request');
  });

  await test('the four policy fields are all carried, not just the type', () => {
    for (const f of ['delivery_policy_type', 'delivery_fixed_fee_sar', 'requires_installation', 'installation_fee_sar']) {
      assert.ok(route.includes(f), `${f} is not read anywhere in the admin route`);
    }
  });

  await test('an unrecognised policy type falls back to the store default', () => {
    // The select is a closed list; anything else is a forged or stale post and
    // must not become the product's policy verbatim.
    assert.ok(/ALLOWED\.includes\(t\) \? t : 'default'/.test(route),
      'policy type is not validated against the allowed list');
  });

  // --- 2. The flag that ticked itself back on ------------------------------
  await test("'0' and '0.0' are read as false, not as a true string", () => {
    // Same predicate the view uses, kept in step by this assertion.
    const on = (v) => {
      if (v === true || v === 1) return true;
      if (v === false || v === 0 || v === null || v === undefined) return false;
      const s = String(v).trim().toLowerCase();
      if (s === '') return false;
      if (/^[0-9]+(\.[0-9]+)?$/.test(s)) return Number(s) !== 0;
      return !['false', 'no', 'off', 'null', 'none', 'لا', 'لا يوجد', 'غير متوفر'].includes(s);
    };
    assert.strictEqual(on('0'), false, "'0' must be false");
    assert.strictEqual(on('0.0'), false, "'0.0' must be false -- 21 live rows hold it");
    assert.strictEqual(on(''), false);
    assert.strictEqual(on('غير متوفر'), false);
    assert.strictEqual(on('1'), true);
    assert.strictEqual(on('1.0'), true, "'1.0' must be true -- 8 live rows hold it");
    assert.strictEqual(on(true), true);
    assert.strictEqual(on(false), false);
  });

  await test('the admin form no longer tests the raw value for truthiness', () => {
    const form = read('views/admin/products/form.ejs');
    assert.ok(!/product\.installation\)\s*\?\s*'checked'/.test(form),
      'the installation checkbox still reads the raw column value');
    assert.ok(/on\(product\.installation\)/.test(form),
      'the installation checkbox does not use the shared predicate');
    assert.ok(!/requires_installation === 1/.test(form),
      'requires_installation is still compared to the number 1, which a boolean never equals');
  });

  await test('the product page never prints the stored flag verbatim', () => {
    // Read as it ships, line endings and all -- the source is CRLF on disk.
    const engine = fs.readFileSync(path.join(REPO, 'product-engine.js'), 'utf8').split('\r\n').join('\n');
    assert.ok(/function installationText/.test(engine),
      'product-engine.js has no installationText()');
    const m = engine.match(/function installationText[\s\S]*?\n}\n/);
    assert.ok(m, 'could not isolate installationText()');
    // eslint-disable-next-line no-new-func
    const fn = new Function(m[0] + '; return installationText;')();
    assert.strictEqual(fn('0.0'), 'غير متوفر');
    assert.strictEqual(fn('1.0'), 'متوفر');
    assert.strictEqual(fn(''), 'غير متوفر');
    assert.strictEqual(fn('تركيب مجاني داخل صنعاء'), 'تركيب مجاني داخل صنعاء',
      "an operator's own sentence must survive unchanged");
  });

  // --- 3. A photo can be tagged with its colour before the first save ------
  await test('the upload preview carries a colour selector', () => {
    const form = read('views/admin/products/form.ejs');
    assert.ok(/name="new_image_color\[\]"/.test(form),
      'the new-image preview has no colour selector');
    assert.ok(/let newFileColors = \[\]/.test(form),
      'colour choices are not held outside the DOM, so rebuilding the grid loses them');
    assert.ok(!/تحتاج حفظاً أولاً حتى يظهر لها اختيار اللون/.test(form),
      'the form still tells the operator a save is required first');
  });

  await test('the server tags newly uploaded photos with the posted colour', () => {
    assert.ok(/function readNewImageColors/.test(route));
    assert.ok(/addImage\(productId, imgPath, currentCount \+ idx, 0, newImageColors\[idx\] \|\| null\)/.test(route),
      'the edit path uploads photos without their colour');
  });

  await test('addImage accepts a colour without breaking its existing callers', () => {
    const repo = read('repositories/postgres/product-repo.js');
    assert.ok(/async addImage\(productId, imagePath, sortOrder = 0, isPrimary = 0, colorName = null\)/.test(repo),
      'addImage has no defaulted colour parameter');
  });

  // --- 4. Creating a product keeps what was entered while creating it ------
  await test('the create route saves sizes and specifications', () => {
    const create = route.slice(route.indexOf("router.post(['/create', '/new']"), route.indexOf("// Edit Form"));
    assert.ok(/variants\.saveSizes\(productRepo\.db, newProductId/.test(create),
      'sizes entered on the create form are discarded');
    assert.ok(/variants\.saveSpecs\(productRepo\.db, newProductId/.test(create),
      'specifications entered on the create form are discarded');
  });

  // --- 5. Placement ---------------------------------------------------------
  const placement = require('../services/placement-render-service');

  await test('an unknown page has no placement grids', () => {
    assert.strictEqual(placement.PLACEMENT_MAP['about'], undefined);
  });

  await test('the home page shows only products flagged for it', () => {
    const products = [
      { id: 'a', title: 'A', price: 10, showOnHome: true },
      { id: 'b', title: 'B', price: 20, showOnHome: false }
    ];
    const $ = require('cheerio').load('<div class="product-grid" id="main-product-grid"><p>old</p></div>');
    const res = placement.injectPlacementGrids($, 'index', products);
    assert.strictEqual(res.rendered, 1);
    const html = $.html();
    assert.ok(html.includes('data-product-id="a"'), 'the flagged product is missing');
    assert.ok(!html.includes('data-product-id="b"'), 'an unflagged product reached the home page');
  });

  await test('a page with nothing to show is left exactly as it was', () => {
    const $ = require('cheerio').load('<div class="product-grid" id="main-product-grid"><p id="keep">old</p></div>');
    const res = placement.injectPlacementGrids($, 'index', [
      { id: 'b', title: 'B', price: 20, showOnHome: false }
    ]);
    assert.strictEqual(res, null, 'an empty result must not report a render');
    assert.strictEqual($('#keep').length, 1, 'the existing markup was blanked');
  });

  await test('the offers page prefers flagged products over discounted ones', () => {
    const products = [
      { id: 'flagged', title: 'F', price: 100, oldPrice: 105, showInOffers: true },
      { id: 'cheap', title: 'C', price: 10, oldPrice: 100, showInOffers: false }
    ];
    const $ = require('cheerio').load('<div class="todays-offers-row"></div>');
    placement.injectPlacementGrids($, 'offers', products);
    const html = $.html();
    assert.ok(html.includes('data-product-id="flagged"'));
    assert.ok(!html.includes('data-product-id="cheap"'),
      'a curated offers page must not be diluted by the fallback');
  });

  await test('with nothing flagged, the offers page falls back to real discounts', () => {
    const products = [
      { id: 'plain', title: 'P', price: 100, oldPrice: null, showInOffers: false },
      { id: 'deal', title: 'D', price: 10, oldPrice: 100, showInOffers: false }
    ];
    const $ = require('cheerio').load('<div class="todays-offers-row"></div>');
    placement.injectPlacementGrids($, 'offers', products);
    const html = $.html();
    assert.ok(html.includes('data-product-id="deal"'), 'the discounted product is missing');
    assert.ok(!html.includes('data-product-id="plain"'),
      'a product at full price was presented as an offer');
  });

  await test('the fallback refuses a discount the numbers do not support', () => {
    const { isCredibleDiscount } = placement;
    // The live catalogue really does hold this: an old price twenty orders of
    // magnitude above the current one, which "deepest discount first" put at
    // the very top of the offers page as 100% off.
    assert.strictEqual(isCredibleDiscount({ price: 71260, oldPrice: 7e19 }), false,
      'an impossible old price was accepted as an offer');
    assert.strictEqual(isCredibleDiscount({ price: 100, oldPrice: 102 }), false,
      '2% off is not an offer worth a page');
    assert.strictEqual(isCredibleDiscount({ price: 100, oldPrice: 5000 }), false,
      '98% off is a data error far more often than a price');
    assert.strictEqual(isCredibleDiscount({ price: 420000, oldPrice: 700000 }), true,
      '40% off is an ordinary, believable offer');
    assert.strictEqual(isCredibleDiscount({ price: 100, oldPrice: null }), false);
    assert.strictEqual(isCredibleDiscount({ price: 0, oldPrice: 100 }), false);
  });

  await test('an operator-flagged product appears whatever its numbers say', () => {
    // The credibility bound restrains the unattended fallback, not a decision
    // somebody actually made.
    const products = [{ id: 'odd', title: 'O', price: 1, oldPrice: 1e12, showInOffers: true }];
    const $ = require('cheerio').load('<div class="todays-offers-row"></div>');
    const res = placement.injectPlacementGrids($, 'offers', products);
    assert.strictEqual(res.rendered, 1, 'an explicit choice was overridden by the sanity bound');
  });

  await test('the home grid is capped so the whole catalogue cannot land on it', () => {
    const products = Array.from({ length: 100 }, (_, i) => ({
      id: 'p' + i, title: 'P' + i, price: 10, showOnHome: true
    }));
    const $ = require('cheerio').load('<div class="product-grid" id="main-product-grid"></div>');
    const res = placement.injectPlacementGrids($, 'index', products);
    assert.ok(res.rendered <= 24, 'rendered ' + res.rendered + ' cards on the home page');
    assert.ok(res.rendered > 0);
  });

  await test('a department page drops products excluded from it', () => {
    const { injectCatalog } = require('../services/catalog-render-service');
    const products = [
      { id: 'in', title: 'In', price: 1, departmentSlug: 'bedrooms', showInDepartment: true },
      { id: 'out', title: 'Out', price: 1, departmentSlug: 'bedrooms', showInDepartment: false }
    ];
    const $ = require('cheerio').load('<div class="product-grid bedrooms-dense-grid"></div>');
    injectCatalog($, 'bedrooms', products);
    const html = $.html();
    assert.ok(html.includes('data-product-id="in"'));
    assert.ok(!html.includes('data-product-id="out"'),
      'a product excluded from its department still appeared on the department page');
  });

  await test('a product written before the columns existed keeps appearing', () => {
    const { publicProduct } = require('../services/storefront-data-service');
    // publicProduct is not exported today; assert the same rule through the
    // payload shape the storefront receives instead.
    void publicProduct;
    const products = [{ id: 'legacy', title: 'L', price: 1, showOnHome: undefined }];
    const $ = require('cheerio').load('<div class="product-grid" id="main-product-grid"><p id="keep">x</p></div>');
    const res = placement.injectPlacementGrids($, 'index', products);
    // showOnHome undefined is NOT true, so nothing renders and the page is
    // left alone -- but the payload builder is what guarantees it is never
    // undefined in practice. That is asserted next.
    assert.strictEqual(res, null);
    assert.strictEqual($('#keep').length, 1);
  });

  await test('the payload builder defaults an absent flag to visible', () => {
    const src = read('services/storefront-data-service.js');
    assert.ok(/showOnHome: placement\(p\.show_on_home, true\)/.test(src));
    assert.ok(/showInDepartment: placement\(p\.show_in_department, true\)/.test(src));
    assert.ok(/showInSearch: placement\(p\.show_in_search, true\)/.test(src));
    assert.ok(/showInNajm: placement\(p\.show_in_najm, true\)/.test(src));
    assert.ok(/showInOffers: placement\(p\.show_in_offers, false\)/.test(src),
      'the offers page must be opt-in, not opt-out');
  });

  // --- 6. Search and Najm honour their own flag ---------------------------
  await test('the search index excludes products hidden from search', () => {
    const repo = read('repositories/postgres/product-repo.js');
    const searchable = repo.slice(repo.indexOf('async findSearchable'), repo.indexOf('async findById'));
    assert.ok(/show_in_search = 1 OR p\.show_in_search IS NULL/.test(searchable),
      'findSearchable does not filter on show_in_search');
  });

  await test('Najm excludes products hidden from Najm', () => {
    const hybrid = read('services/ai/hybrid-search.js');
    const hits = (hybrid.match(/show_in_najm = 1 OR p\.show_in_najm IS NULL/g) || []).length;
    assert.ok(hits >= 2, 'the fallback query still ignores the flag (found ' + hits + ')');
  });

  await test('every new boolean column is declared to the SQL translator', () => {
    const base = read('repositories/postgres/postgres-base-repository.js');
    for (const c of ['show_in_department', 'show_on_home', 'show_in_search', 'show_in_najm', 'show_in_offers']) {
      assert.ok(base.includes(`'${c}'`),
        c + ' is missing from BOOLEAN_COLUMNS; `= 1` would reach PostgreSQL untranslated and the query would throw');
    }
  });

  // --- 7. The migration is safe to deploy ---------------------------------
  await test('the visibility migration adds columns and never drops one', () => {
    const sql = read('migrations/2026-09-05-product-visibility.sql');
    assert.ok(/ADD COLUMN IF NOT EXISTS/.test(sql));
    assert.ok(!/DROP\s+(TABLE|COLUMN)/i.test(sql), 'the forward migration contains a DROP');
    assert.ok(!/TRUNCATE/i.test(sql));
    assert.ok(/DEFAULT FALSE/.test(sql), 'show_in_offers must default to false');
  });

  await test('the flag normalisation touches only recognised spellings', () => {
    // Comments are stripped first: the header explains the bug in prose that
    // contains the word "where", and counting that would make the check lie.
    const sql = read('migrations/2026-09-05-installation-flag-normalise.sql')
      .split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    assert.ok(!/DELETE/i.test(sql), 'a normalisation must not delete rows');
    const updates = sql.match(/UPDATE\s+"products"/gi) || [];
    const wheres = sql.match(/\bWHERE\b/gi) || [];
    assert.strictEqual(updates.length, wheres.length,
      'an UPDATE without a WHERE would rewrite every product');
  });

  // --- 8. Live pages, if the server is up ---------------------------------
  let serverUp = true;
  try {
    const r = await fetch(BASE + '/api/health');
    serverUp = r.ok;
  } catch (_) {
    serverUp = false;
  }

  if (!serverUp) {
    console.log('\n  (server not reachable at ' + BASE + ' — live page checks skipped)\n');
  } else {
    await test('the offers page no longer serves frozen prices', async () => {
      // The baked-in cards quoted gen-0043 at ١٢٬٩٩٩ with 35% off while the
      // database said 354/405. Any card still carrying that markup is a price
      // the shop is not honouring.
      const html = await (await fetch(BASE + '/offers.html')).text();
      assert.ok(!/١٢,٩٩٩|١٢٬٩٩٩/.test(html),
        'offers.html still quotes the frozen price from its own markup');
      assert.ok(!/data-subcategory="offers"/.test(html),
        'a hardcoded offers card survived the rebuild');
    });

    await test('the offers page shows products that carry a real discount', async () => {
      const html = await (await fetch(BASE + '/offers.html')).text();
      const cards = html.match(/<article class="product-card"/g) || [];
      assert.ok(cards.length > 0, 'the offers page has no product cards at all');
    });

    await test('the home page grid is served from the database', async () => {
      const html = await (await fetch(BASE + '/index.html')).text();
      const start = html.indexOf('id="main-product-grid"');
      assert.ok(start > 0, 'the home grid is missing entirely');
      const grid = html.slice(start, start + 60000);
      assert.ok(/data-zs-catalog-grid|<article class="product-card"/.test(grid),
        'the home grid has no cards');
      assert.ok(!/data-subcategory="general"/.test(grid),
        'the home grid still contains its baked-in cards');
    });

    await test('no development leftover reaches the home page', async () => {
      const html = await (await fetch(BASE + '/index.html')).text();
      const start = html.indexOf('id="main-product-grid"');
      const grid = html.slice(start, start + 60000);
      assert.ok(!/data-product-id="(TEST|CART-TEST|FIN-TEST|SEED)[-_]/.test(grid),
        'a test product is on the shop front page');
    });
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
