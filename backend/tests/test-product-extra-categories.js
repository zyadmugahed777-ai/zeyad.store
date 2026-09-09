/**
 * A product in more than one category, end to end.
 *
 * The request: "add the ability to put the product in an additional department
 * or category -- for example put it in the Malaysian one and the Swedish one.
 * And of course this option is optional."
 *
 * Until now products.category_id held exactly one category, so listing a piece
 * in a second meant duplicating the product: two rows, two sets of
 * photographs, two prices to keep in step, and one physical item appearing
 * twice in a shopper's search results.
 *
 * The word that carries the most weight here is "optional". A product nobody
 * ticks a box for must behave exactly as it did before -- same category page,
 * same breadcrumb, same everything -- and most of these tests are about that
 * rather than about the new feature.
 *
 * The whole path, with nothing stubbed: post the real admin form, read the
 * real table, run the real storefront sync, and ask the real catalogue
 * renderer what a category page would show. It creates its own products and
 * removes them in a finally.
 *
 *   node tests/test-product-extra-categories.js
 */
const assert = require('assert');
const path = require('path');
const express = require('express');
const session = require('express-session');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { getRepositories } = require('../repositories');

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

function buildApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'extracats', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.admin = {
      id: 1, username: 'admin', full_name: 'مدير النظام',
      role_id: 1, role_name: 'Super Admin'
    };
    res.locals.admin = req.session.admin;
    res.locals.flash = null;
    res.locals.csrfToken = 'test-csrf';
    req.csrfToken = () => 'test-csrf';
    res.locals.helpers = require('../utils/helpers');
    res.locals.currentCurrency = 'SAR';
    res.locals.exchangeRate = 140;
    next();
  });
  app.use('/admin/products', require('../routes/admin/products'));
  return app;
}

async function postForm(base, url, fields) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => body.append(k, x));
    else if (v !== undefined) body.append(k, String(v));
  }
  return fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual'
  });
}

(async () => {
  console.log('\nA product in more than one category — form, table, storefront\n');

  if ((process.env.DATABASE_TYPE || '').toLowerCase() !== 'postgres') {
    console.log('  SKIP: DATABASE_TYPE is not postgres\n');
    process.exit(0);
  }

  const app = buildApp();
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const repos = getRepositories();
  const db = repos.products.db;

  const hasTable = await db.prepare(
    "SELECT to_regclass('public.product_categories') AS t"
  ).get();
  if (!hasTable || !hasTable.t) {
    console.log('  SKIP: run migration 2026-09-09-product-extra-categories.sql first\n');
    server.close();
    process.exit(0);
  }

  /* Two categories under one department, and one under a different department
     -- the cross-department case is the half of "قسم او فىه اضافيه" that a
     same-department test would never exercise. */
  const pair = await db.prepare(`
    SELECT c.id, c.slug, c.department_id, d.slug AS dept_slug
    FROM categories c JOIN departments d ON d.id = c.department_id
    WHERE c.slug IS NOT NULL AND d.slug IS NOT NULL
    ORDER BY c.department_id, c.id
  `).all();

  const byDept = new Map();
  for (const c of pair) {
    if (!byDept.has(c.department_id)) byDept.set(c.department_id, []);
    byDept.get(c.department_id).push(c);
  }
  const homeDept = [...byDept.values()].find((list) => list.length >= 2);
  const otherDept = [...byDept.values()].find((list) => list.length >= 1 && list[0].department_id !== (homeDept && homeDept[0].department_id));

  if (!homeDept || !otherDept) {
    console.log('  SKIP: needs two categories in one department and one in another\n');
    server.close();
    process.exit(0);
  }

  const PRIMARY = homeDept[0];
  const SIBLING = homeDept[1];
  const FOREIGN = otherDept[0];

  const stamp = Date.now();
  const CODE_MULTI = 'XCAT-M-' + stamp;
  const CODE_PLAIN = 'XCAT-P-' + stamp;
  const created = [];

  const rowByCode = async (code) => await db
    .prepare('SELECT * FROM products WHERE product_id = ?').get(code);

  try {
    // ---- created through the real form, with two extra categories ---------

    await test('the form stores the additional categories that were ticked', async () => {
      const res = await postForm(base, '/admin/products/create', {
        product_id: CODE_MULTI,
        title: 'خزانة تظهر في أكثر من فئة',
        price: 1000,
        department_id: PRIMARY.department_id,
        category_id: PRIMARY.id,
        extra_categories_submitted: '1',
        'extra_category_ids[]': [SIBLING.id, FOREIGN.id],
        is_active: 'on'
      });
      assert.ok(res.status < 400, 'the form did not save: HTTP ' + res.status);

      const row = await rowByCode(CODE_MULTI);
      assert.ok(row, 'the product was not created');
      created.push(row.id);

      const extras = await repos.products.findExtraCategoryIds(row.id);
      assert.deepStrictEqual(extras.sort((a, b) => a - b),
        [SIBLING.id, FOREIGN.id].sort((a, b) => a - b),
        'the ticked categories were not stored');
    });

    await test('the primary category is not stored as an extra as well', async () => {
      /* Two places holding the same answer is two places that can disagree,
         and the product would be listed twice in its own category. */
      const row = await rowByCode(CODE_MULTI);
      const extras = await repos.products.findExtraCategoryIds(row.id);
      assert.ok(!extras.includes(PRIMARY.id),
        'the primary category was duplicated into the extras table');
    });

    await test('a product with nothing ticked has no extra rows at all', async () => {
      // This is what "optional" has to cost: nothing.
      const res = await postForm(base, '/admin/products/create', {
        product_id: CODE_PLAIN,
        title: 'منتج بفئة واحدة فقط',
        price: 500,
        department_id: PRIMARY.department_id,
        category_id: PRIMARY.id,
        extra_categories_submitted: '1',
        is_active: 'on'
      });
      assert.ok(res.status < 400, 'the form did not save: HTTP ' + res.status);

      const row = await rowByCode(CODE_PLAIN);
      assert.ok(row, 'the product was not created');
      created.push(row.id);
      assert.deepStrictEqual(await repos.products.findExtraCategoryIds(row.id), []);
    });

    // ---- what a shopper actually sees -------------------------------------

    await test('the storefront cache lists every category the product is in', async () => {
      const { syncFrontendUnsafe } = require('../utils/sync-frontend');
      await syncFrontendUnsafe();

      const cachePath = path.join(__dirname, '..', '..', 'products_db.json');
      const all = JSON.parse(require('fs').readFileSync(cachePath, 'utf8'));
      const multi = all.find((p) => p.product_id === CODE_MULTI);
      assert.ok(multi, 'the product is missing from the storefront cache');

      assert.strictEqual(multi.categorySlug, PRIMARY.slug,
        'the primary category changed — the breadcrumb reads this field');
      for (const slug of [PRIMARY.slug, SIBLING.slug, FOREIGN.slug]) {
        assert.ok(multi.categorySlugs.includes(slug), 'missing category ' + slug);
      }
      assert.ok(multi.departmentSlugs.includes(FOREIGN.dept_slug),
        'the other department was not reached, so its pages will filter the product out');

      const plain = all.find((p) => p.product_id === CODE_PLAIN);
      assert.deepStrictEqual(plain.categorySlugs, [PRIMARY.slug],
        'a product with no extras got more than its own category');
    });

    await test('the category page shows a product placed into it', async () => {
      /* The renderer gates on the department before it looks at the category,
         so this is the test that would fail if departmentSlugs were forgotten. */
      const { PAGE_MAP, injectCatalog } = require('../services/catalog-render-service');
      const cheerio = require('cheerio');
      const all = JSON.parse(require('fs').readFileSync(
        path.join(__dirname, '..', '..', 'products_db.json'), 'utf8'
      ));

      const slug = Object.keys(PAGE_MAP)
        .find((s) => PAGE_MAP[s].department === SIBLING.dept_slug);
      if (!slug) return; // no catalogue page ships for that department

      const $ = cheerio.load(require('fs').readFileSync(
        path.join(__dirname, '..', '..', slug + '.html'), 'utf8'
      ));
      const result = injectCatalog($, slug, all, SIBLING.slug);
      assert.ok(result, 'the catalogue grid was not found on ' + slug);
      assert.ok($.html().includes(CODE_MULTI) || $.html().includes('خزانة تظهر في أكثر من فئة'),
        'a product placed into this category is not on its page');
    });

    await test('a product still appears on its own category page', async () => {
      // The whole feature is worthless if it costs a product its own listing.
      const { PAGE_MAP, injectCatalog } = require('../services/catalog-render-service');
      const cheerio = require('cheerio');
      const all = JSON.parse(require('fs').readFileSync(
        path.join(__dirname, '..', '..', 'products_db.json'), 'utf8'
      ));

      const slug = Object.keys(PAGE_MAP)
        .find((s) => PAGE_MAP[s].department === PRIMARY.dept_slug);
      if (!slug) return;

      const $ = cheerio.load(require('fs').readFileSync(
        path.join(__dirname, '..', '..', slug + '.html'), 'utf8'
      ));
      injectCatalog($, slug, all, PRIMARY.slug);
      assert.ok($.html().includes('منتج بفئة واحدة فقط'),
        'a product with no extra categories vanished from its own category page');
    });

    await test('a cache with no categorySlugs still filters — older builds', () => {
      /* products_db.json is regenerated on every admin save, but a deploy that
         ships new code beside a cache written by the old one must not blank
         every category page in the shop. */
      const { PAGE_MAP, injectCatalog } = require('../services/catalog-render-service');
      const cheerio = require('cheerio');
      const slug = Object.keys(PAGE_MAP)[0];
      const dept = PAGE_MAP[slug].department;

      const legacy = [{
        product_id: 'LEGACY-1',
        title: 'منتج من نسخة قديمة',
        price: 100,
        departmentSlug: dept,
        categorySlug: 'legacy-cat'
        // no categorySlugs, no departmentSlugs
      }];
      const $ = cheerio.load(require('fs').readFileSync(
        path.join(__dirname, '..', '..', slug + '.html'), 'utf8'
      ));
      const result = injectCatalog($, slug, legacy, 'legacy-cat');
      assert.ok(result && result.rendered === 1,
        'a cache without the new fields rendered nothing');
    });

    // ---- editing ----------------------------------------------------------

    await test('unticking every box clears the extras', async () => {
      const row = await rowByCode(CODE_MULTI);
      const res = await postForm(base, '/admin/products/' + row.id + '/edit', {
        product_id: CODE_MULTI,
        title: 'خزانة تظهر في أكثر من فئة',
        price: 1000,
        department_id: PRIMARY.department_id,
        category_id: PRIMARY.id,
        extra_categories_submitted: '1',
        is_active: 'on'
      });
      assert.ok(res.status < 400, 'the edit did not save: HTTP ' + res.status);
      assert.deepStrictEqual(await repos.products.findExtraCategoryIds(row.id), [],
        'unticking every box did not clear the placements');
    });

    await test('a save that never drew the control leaves the extras alone', async () => {
      /* An API client, the AI employee, or an older form posts no marker.
         Treating that as "the operator cleared them" would wipe placements on
         every such save -- the same trap the visibility checkboxes had. */
      const row = await rowByCode(CODE_MULTI);
      await repos.products.setExtraCategories(row.id, [SIBLING.id], PRIMARY.id);

      const res = await postForm(base, '/admin/products/' + row.id + '/edit', {
        product_id: CODE_MULTI,
        title: 'خزانة تظهر في أكثر من فئة',
        price: 1200,
        department_id: PRIMARY.department_id,
        category_id: PRIMARY.id,
        is_active: 'on'
        // no extra_categories_submitted
      });
      assert.ok(res.status < 400, 'the edit did not save: HTTP ' + res.status);
      assert.deepStrictEqual(await repos.products.findExtraCategoryIds(row.id), [SIBLING.id],
        'a save that never drew the control wiped the placements');
    });

    await test('the edit form shows the boxes that are already ticked', async () => {
      const row = await rowByCode(CODE_MULTI);
      const res = await fetch(base + '/admin/products/' + row.id + '/edit');
      const html = await res.text();
      const box = html.match(
        new RegExp('<input[^>]*name="extra_category_ids\\[\\]"[^>]*value="' + SIBLING.id + '"[^>]*>')
      );
      assert.ok(box, 'the additional-categories control is not on the form');
      assert.ok(/checked/.test(box[0]),
        'a stored placement is not ticked when the form reopens: ' + box[0]);
    });

    await test('a category deleted behind the form does not fail the save', async () => {
      /* The table has a foreign key, so a stale id would be rejected by
         PostgreSQL and take the whole product save down with it. */
      const row = await rowByCode(CODE_MULTI);
      await repos.products.setExtraCategories(row.id, [SIBLING.id, 99999999], PRIMARY.id);
      assert.deepStrictEqual(await repos.products.findExtraCategoryIds(row.id), [SIBLING.id],
        'an unknown category id was stored or lost the whole set');
    });

    await test('the code survives a database where the migration has not run', async () => {
      /* Code and migrations do not land at the same instant. A box that pulled
         and restarted without migrating -- or a rollback, or a replica -- must
         degrade to "the feature is unavailable", not to every admin save and
         every storefront rebuild failing on a missing table. */
      const repo = repos.products;
      const realProbe = repo.__hasExtraCategories;
      repo.__hasExtraCategories = false;
      try {
        assert.deepStrictEqual(await repo.findExtraCategoryIds(1), [],
          'reading extras threw or returned rows without the table');
        assert.strictEqual((await repo.allExtraCategories()).size, 0,
          'the catalogue-wide lookup did not degrade cleanly');
        await repo.setExtraCategories(1, [2], 1); // must not throw

        const ok = await require('../utils/sync-frontend').syncFrontendUnsafe();
        assert.strictEqual(ok, true,
          'the storefront rebuild fails on a database without the table');
      } finally {
        repo.__hasExtraCategories = realProbe;
      }
    });

    await test('deleting a product takes its placements with it', async () => {
      const row = await rowByCode(CODE_PLAIN);
      await repos.products.setExtraCategories(row.id, [SIBLING.id], PRIMARY.id);
      await db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
      const left = await db.prepare(
        'SELECT COUNT(*) AS c FROM product_categories WHERE product_id = ?'
      ).get(row.id);
      assert.strictEqual(Number(left.c), 0,
        'the placements outlived the product and will list a ghost');
      created.splice(created.indexOf(row.id), 1);
    });
  } finally {
    for (const id of created) {
      try { await db.prepare('DELETE FROM products WHERE id = ?').run(id); } catch (_) {}
    }
    try { await db.prepare('DELETE FROM products WHERE product_id IN (?, ?)').run(CODE_MULTI, CODE_PLAIN); } catch (_) {}
    try { await require('../utils/sync-frontend').syncFrontendUnsafe(); } catch (_) {}
    server.close();
  }

  console.log(`\n  passed: ${passed}    failed: ${failed}\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
