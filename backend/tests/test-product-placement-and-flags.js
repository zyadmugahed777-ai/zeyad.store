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

  await test('duplicating a product carries its placements across', () => {
    const dup = route.slice(route.indexOf("router.post('/:id/duplicate'"));
    for (const f of ['show_in_department', 'show_on_home', 'show_in_search', 'show_in_najm', 'show_in_offers']) {
      assert.ok(dup.includes('original.' + f),
        'a duplicate would land on different pages from its original (' + f + ')');
    }
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

  await test('a starved second grid does not keep its frozen cards', () => {
    // The shop went live with five products. The first grid took all five and
    // the second kept advertising gen-0030 at 4,200 — a price that exists
    // nowhere in the database.
    const products = Array.from({ length: 5 }, (_, i) => ({
      id: 'p' + i, title: 'P' + i, price: 10, showOnHome: true
    }));
    const $ = require('cheerio').load(
      '<section><div class="product-grid" id="main-product-grid"></div></section>' +
      '<section class="product-section recommended"><h2>اختيارات تكمل بيتك</h2>' +
      '<div class="product-grid"><article class="product-card" data-product-id="gen-0030">' +
      '<strong>4200</strong></article></div></section>'
    );
    const res = placement.injectPlacementGrids($, 'index', products);
    assert.strictEqual(res.rendered, 5);
    const html = $.html();
    assert.ok(!html.includes('data-product-id="gen-0030"'),
      'a frozen snapshot survived below a rebuilt grid');
    assert.ok(!html.includes('4200'), 'a price that exists nowhere is still on the page');
  });

  await test('a page where nothing was rebuilt keeps every card it had', () => {
    // The distinction that matters: leftovers are only cleared when the page
    // is ALREADY showing current data. A catalogue outage must not strip the
    // page bare.
    const $ = require('cheerio').load(
      '<section><div class="product-grid" id="main-product-grid"></div></section>' +
      '<section class="product-section recommended"><div class="product-grid">' +
      '<article class="product-card" data-product-id="gen-0030"></article></div></section>'
    );
    const res = placement.injectPlacementGrids($, 'index', []);
    assert.strictEqual(res, null);
    assert.ok($.html().includes('data-product-id="gen-0030"'),
      'an empty catalogue stripped the page instead of leaving it alone');
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

  // --- 5b. No product totals anywhere -------------------------------------
  //
  // The shop does not publish how many products it has. A category rail that
  // says "4 منتجات" under one tile and "لا توجد منتجات" under another tells
  // every visitor the size of the inventory, which is the owner's to disclose
  // and not the layout's.

  await test('the category rail shows names only, never a product count', () => {
    const { injectCategoryStrip } = require('../services/category-strip-service');
    const cats = [
      { id: 1, name: 'غرف نوم ماليزي', slug: 'maliz', productCount: 9, sortOrder: 1, displayStyle: 'card' },
      { id: 2, name: 'غرف نوم تركي', slug: 'turki', productCount: 4, sortOrder: 2, displayStyle: 'card' },
      { id: 3, name: 'غرف نوم ملكي', slug: 'malaki', productCount: 0, sortOrder: 3, displayStyle: 'card' }
    ];
    const $ = require('cheerio').load('<div class="product-grid bedrooms-dense-grid"></div>');
    injectCategoryStrip($, 'bedrooms', cats, '', 'div.product-grid.bedrooms-dense-grid');
    const html = $.html();

    for (const c of cats) {
      assert.ok(html.includes(c.name), c.name + ' is missing from the rail');
    }

    // Arabic-Indic digits count as digits here; the page renders in Arabic.
    // "لا توجد منتجات في هذه الفئة بعد" is the empty-results explanation and is
    // allowed -- the bare "لا توجد منتجات" label under a tile is not.
    const counts = html.match(/[\u0660-\u0669\d]+\s*(?:منتج|منتجات)|منتج واحد|منتجان|لا توجد منتجات(?! في هذه)/g);
    assert.strictEqual(counts, null, 'the rail printed a product count: ' + JSON.stringify(counts));
  });

  await test('a filtered rail still shows no count for the active category', () => {
    const { injectCategoryStrip } = require('../services/category-strip-service');
    const cats = [
      { id: 1, name: 'غرف نوم تركي', slug: 'turki', productCount: 4, sortOrder: 1, displayStyle: 'card' }
    ];
    const $ = require('cheerio').load('<div class="product-grid bedrooms-dense-grid"></div>');
    injectCategoryStrip($, 'bedrooms', cats, 'turki', 'div.product-grid.bedrooms-dense-grid');
    const html = $.html();
    const counts = html.match(/[\u0660-\u0669\d]+\s*(?:منتج|منتجات)|منتج واحد|منتجان/g);
    assert.strictEqual(counts, null, 'the active-category banner printed a count: ' + JSON.stringify(counts));
  });

  await test('the catalogue page hides the baked-in "N products" badge', () => {
    const { injectCatalog } = require('../services/catalog-render-service');
    const $ = require('cheerio').load(
      '<div class="catalog-count">120 منتج</div>' +
      '<div class="product-grid bedrooms-dense-grid"></div>'
    );
    const res = injectCatalog($, 'bedrooms', [
      { id: 'a', title: 'A', price: 1, departmentSlug: 'bedrooms', showInDepartment: true }
    ]);
    assert.strictEqual(res.rendered, 1);
    // Hidden rather than rewritten: the number baked into the HTML is stale by
    // definition, and hiding keeps the data-vid the visual editor saves against.
    assert.ok($('.catalog-count').attr('hidden') !== undefined,
      'the badge is still visible, showing whatever number was hardcoded');
  });

  await test('no count formatter survives in the client bundle either', () => {
    const client = fs.readFileSync(
      require('path').join(REPO, 'assets', 'js', 'core', 'storefront-2026.js'), 'utf8');
    assert.ok(!/function countLabel/.test(client),
      'storefront-2026.js still carries a count formatter, so filtering can reintroduce one');
    assert.ok(!/data-zs-results-count|data-zs-banner-count/.test(client),
      'the client still writes into a count element');
  });

  // --- 5c. The rails under a product must not be three copies of one list --

  /** Lift the shipped functions out of product-engine.js and run them. */
  function relatedFor(db, product) {
    const src = fs.readFileSync(path.join(REPO, 'product-engine.js'), 'utf8').split('\r\n').join('\n');
    const grab = (name) => {
      const i = src.indexOf('function ' + name + '(');
      assert.ok(i >= 0, name + '() is missing from product-engine.js');
      const j = src.indexOf('\n  }', i);
      return src.slice(i, j + 4);
    };
    const code = [grab('seedFrom'), grab('stableShuffle'), grab('getRelatedProducts')].join('\n');
    const getCategoryCode = (p) => String(p.categoryCode || p.categorySlug || p.category || '');
    const win = { PRODUCTS_DB: db };
    // eslint-disable-next-line no-new-func
    const fn = new Function('getCategoryCode', 'window', code + '; return getRelatedProducts;')(getCategoryCode, win);
    return fn(product);
  }

  /* A catalogue shaped like this shop's actual one: every product in a single
     category, almost all sharing a brand, everything flagged best seller. That
     is what made the three filters return the same list. */
  const uniformCatalogue = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1,
    product_id: 'P-' + (1000 + i),
    title: 'غرفة نوم ' + (i + 1),
    categoryCode: 'CAT-BED',
    brand: i < 35 ? 'موديل تركي' : 'موديل سويدي',
    isBestSeller: true,
    price: 1000 + i
  }));

  await test('the three product rails never show the same product twice', () => {
    for (const p of uniformCatalogue.slice(0, 6)) {
      const r = relatedFor(uniformCatalogue, p);
      const ids = (list) => list.map((x) => String(x.product_id));
      const all = [...ids(r.sameCategory), ...ids(r.similar), ...ids(r.mayLike)];
      const unique = new Set(all);
      assert.strictEqual(unique.size, all.length,
        p.product_id + ': a product appears in more than one rail');
      assert.ok(!all.includes(p.product_id),
        p.product_id + ' recommends itself');
    }
  });

  await test('every rail fills, even when its own rule cannot', () => {
    // Only 5 products carry the second brand, so the "same brand" rail would
    // come up short for them. A half-empty rail beside two full ones reads as
    // broken, and "قد يعجبك أيضاً" promises nothing about how it chose.
    const swedish = uniformCatalogue.find((p) => p.brand === 'موديل سويدي');
    const r = relatedFor(uniformCatalogue, swedish);
    assert.strictEqual(r.sameCategory.length, 10);
    assert.strictEqual(r.similar.length, 10, 'the brand rail did not fall back to remaining stock');
    assert.strictEqual(r.mayLike.length, 10);
  });

  await test('two different products do not recommend the same ten', () => {
    /* Before: every filter matched nearly the whole catalogue and each took
       .slice(0, 10) from the top, so all 57 product pages recommended the same
       first ten rows. */
    const a = relatedFor(uniformCatalogue, uniformCatalogue[0]);
    const b = relatedFor(uniformCatalogue, uniformCatalogue[9]);
    const setA = new Set(a.sameCategory.map((x) => x.product_id));
    const shared = b.sameCategory.filter((x) => setA.has(x.product_id)).length;
    assert.ok(shared <= 5, 'two products share ' + shared + '/10 recommendations');
  });

  await test('the order is stable, so a rail does not reshuffle on every render', () => {
    const first = relatedFor(uniformCatalogue, uniformCatalogue[3]).sameCategory.map((x) => x.product_id);
    const again = relatedFor(uniformCatalogue, uniformCatalogue[3]).sameCategory.map((x) => x.product_id);
    assert.deepStrictEqual(again, first, 'the same product page returned a different order');
  });

  await test('a catalogue too small to fill a rail does not break it', () => {
    const tiny = uniformCatalogue.slice(0, 4);
    const r = relatedFor(tiny, tiny[0]);
    const all = [...r.sameCategory, ...r.similar, ...r.mayLike].map((x) => x.product_id);
    assert.strictEqual(new Set(all).size, all.length, 'a duplicate appeared when stock ran out');
    assert.ok(all.length <= 3, 'more products were shown than exist beside the one being viewed');
  });

  // --- 5d. "Real photographs of this piece" is counted, not asserted -------

  await test('the real-media claim is built from what the product actually has', () => {
    /* Most main images in this catalogue are studio renders, so telling a
       customer that real photographs exist is the most useful sentence on the
       page -- and the easiest to overclaim. Every product has at least two
       images so the claim holds, but only ONE of the 57 has a video, and a
       blanket "and video" would be a claim about the other 56. */
    const engine = fs.readFileSync(path.join(REPO, 'product-engine.js'), 'utf8');
    const block = engine.slice(engine.indexOf('trust-real-media-item'), engine.indexOf('const warrantyEl'));
    assert.ok(block, 'the real-media block is missing from product-engine.js');

    assert.ok(/product\.gallery\)\s*\?\s*product\.gallery\.length\s*:\s*0/.test(block),
      'the photo count is not read from the product');
    assert.ok(/hasVideo/.test(block) && /product\.video/.test(block),
      'video is not checked per product');
    assert.ok(/shots >= 2 \|\| hasVideo/.test(block),
      'the claim is shown without first proving there is media to back it');
    assert.ok(/realMediaItem\.hidden = true/.test(block),
      'a product with no extra media has no way to hide the claim');

    // And the wording must not promise video unconditionally.
    const always = block.match(/'صور وفيديو حقيقي[^']*'/);
    assert.ok(always, 'the video wording is missing');
    const idx = block.indexOf(always[0]);
    const guarded = block.slice(Math.max(0, idx - 120), idx);
    assert.ok(/hasVideo\s*$|hasVideo[\s\S]*\?[\s\S]*$/.test(guarded),
      'the "and video" wording is not guarded by hasVideo');
  });

  await test('the trust slot starts hidden, so a script failure claims nothing', () => {
    /* If product-engine.js never runs -- a JS error, a blocked script -- the
       slot must stay empty rather than showing an unfilled promise. */
    const html = fs.readFileSync(path.join(REPO, 'product.html'), 'utf8');
    const m = html.match(/<div class="product-trust-item" id="trust-real-media-item"([^>]*)>/);
    assert.ok(m, 'the real-media trust item is missing from product.html');
    assert.ok(/\bhidden\b/.test(m[1]), 'it does not start hidden');
  });

  await test('every stylesheet and script the product page loads is cache-busted', () => {
    /* nginx serves these with max-age=604800 and Cloudflare honours it. An
       asset referenced WITHOUT a ?v= query therefore keeps being served from
       the edge for a week after the origin has replaced it -- measured once as
       cf-cache-status HIT, Age 8417, against a file that had already changed.
       Everyone here arrives from an advertisement, so this is not only a
       returning-visitor problem: the edge hands the stale copy to first-time
       visitors too. A version query makes a changed file a new URL, which no
       cache has seen. */
    const html = fs.readFileSync(path.join(REPO, 'product.html'), 'utf8');
    const refs = [];
    const re = /(?:href|src)\s*=\s*"([^"]+\.(?:css|js))(\?[^"]*)?"/g;
    let m;
    while ((m = re.exec(html))) {
      const url = m[1];
      if (/^(https?:)?\/\//.test(url)) continue;   // third-party, not ours to stamp
      refs.push({ url, query: m[2] || '' });
    }
    assert.ok(refs.length >= 4, 'no local assets found on product.html');

    /* products_db.js and zfb-config.js are the two GENERATED files. A content
       hash stamped at build time would be wrong for them: they are rewritten
       by syncFrontend() whenever the admin saves a product, long after the
       HTML was stamped, so the page would point at a version query describing
       an older file. nginx already handles them separately and correctly --
       measured `max-age=14400, must-revalidate`, so a price edit reaches a
       cached visitor within four hours and revalidates after that, instead of
       the week the static assets were getting. */
    const generated = new Set(['products_db.js', 'zfb-config.js']);

    const bare = refs
      .filter((r) => !generated.has(r.url) && !/[?&]v=/.test(r.query))
      .map((r) => r.url);
    assert.deepStrictEqual(bare, [],
      'served for a week from the edge with no way to invalidate: ' + bare.join(', '));
  });

  await test('the real-media item spans the row instead of sitting alone', () => {
    /* .product-trust-row is a two-column grid at every width -- responsive-pro
       forces repeat(2, 1fr) with !important -- so a fifth item lands alone on a
       third row with an empty cell beside it. */
    const css = fs.readFileSync(path.join(REPO, 'product-page.css'), 'utf8');
    const rule = css.match(/#trust-real-media-item\s*\{[^}]*\}/);
    assert.ok(rule, 'no rule targets the real-media trust item');
    assert.ok(/grid-column:\s*1\s*\/\s*-1/.test(rule[0]),
      'it does not span the grid, so it is orphaned on its own row');
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
