/**
 * The admin product list, filtered — does the department actually narrow it?
 *
 * The complaint: "I choose to show the categories for bedrooms and it shows me
 * everything." It did, and the filter itself was never broken. The value never
 * arrived. Three places in the panel link into this list and each spells the
 * parameter differently --
 *
 *   /admin/products?department_id=2   (departments list, the "N منتج" badge)
 *   /admin/products?category_id=7     (categories list, same badge)
 *   /admin/products?department=2      (a department's detail card)
 *
 * -- while the route read only `department` and `category`. The other two
 * matched nothing, so the page answered with the whole catalogue, which is
 * indistinguishable from a filter that does not work.
 *
 * Three more ways the same filter got dropped, all of which produce the same
 * "it shows me everything" report a click later: the pagination links carried
 * `q` and `category` but not `department`; the department <select> had no
 * `selected` branch so it snapped back to "all departments" after a successful
 * filter; and the clear-filters button only appeared for a search or a
 * category.
 *
 * Nothing short of rendering the real route proves this, so that is what this
 * does: the real router, the real repository, real PostgreSQL rows. It creates
 * three products of its own across two departments -- the shadow database has
 * no department_id populated, and a test that depends on ambient data is a
 * test that passes for the wrong reason -- and deletes them in a finally.
 *
 *   node tests/test-admin-list-filters.js
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
  app.use(session({ secret: 'listfilters', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.admin = {
      id: 1, username: 'admin', full_name: 'مدير النظام',
      role_id: 1, role_name: 'Super Admin'
    };
    res.locals.admin = req.session.admin;
    res.locals.flash = null;
    res.locals.csrfToken = 'test-csrf';
    req.csrfToken = () => 'test-csrf';
    /* The whole helpers module, not a hand-picked subset: routes/admin/index.js
       supplies these to every admin view, and a list that drifts from it makes
       this suite fail on a missing helper rather than on the thing it tests. */
    res.locals.helpers = require('../utils/helpers');
    res.locals.currentCurrency = 'SAR';
    res.locals.exchangeRate = 140;
    next();
  });
  app.use('/admin/products', require('../routes/admin/products'));
  return app;
}

(async () => {
  console.log('\nAdmin list filters — does choosing a department narrow the list?\n');

  if ((process.env.DATABASE_TYPE || '').toLowerCase() !== 'postgres') {
    console.log('  SKIP: DATABASE_TYPE is not postgres\n');
    process.exit(0);
  }

  const app = buildApp();
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const repos = getRepositories();
  const db = repos.products.db;

  const get = async (url) => {
    const res = await fetch(base + url);
    return { status: res.status, html: await res.text() };
  };

  /* Two departments that really exist, and a category under the first. The
     panel joins on these, so inventing ids would render a page that proves
     nothing. */
  const depts = await db.prepare(
    'SELECT id FROM departments ORDER BY id LIMIT 2'
  ).all();
  const cats = await db.prepare(
    'SELECT id FROM categories WHERE department_id = ? ORDER BY id LIMIT 1'
  ).all(depts.length ? depts[0].id : 0);

  if (depts.length < 2 || cats.length < 1) {
    console.log('  SKIP: needs at least two departments and one category\n');
    server.close();
    process.exit(0);
  }

  const DEPT_A = depts[0].id;
  const DEPT_B = depts[1].id;
  const CAT_A = cats[0].id;

  const stamp = Date.now();
  const CODE_A1 = 'FILT-A1-' + stamp;
  const CODE_A2 = 'FILT-A2-' + stamp;
  const CODE_B1 = 'FILT-B1-' + stamp;

  const make = async (code, deptId, catId) => {
    await db.prepare(
      `INSERT INTO products (product_id, title, price, department_id, category_id, is_active, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(code, 'منتج فلترة ' + code, 100, deptId, catId, 1, 0);
  };

  try {
    await make(CODE_A1, DEPT_A, CAT_A);
    await make(CODE_A2, DEPT_A, CAT_A);
    await make(CODE_B1, DEPT_B, null);

    // --- the three spellings the panel actually links with ------------------

    await test('?department= narrows the list to that department', async () => {
      const { status, html } = await get('/admin/products?department=' + DEPT_A + '&limit=200');
      assert.strictEqual(status, 200);
      assert.ok(html.includes(CODE_A1), 'a product of that department is missing');
      assert.ok(html.includes(CODE_A2), 'a product of that department is missing');
      assert.ok(!html.includes(CODE_B1), 'a product from another department is listed');
    });

    await test('?department_id= narrows it too — the departments page links this way', async () => {
      /* This is the reported bug. The badge on /admin/departments reads
         "N منتج" and links here; the value arrived and was ignored. */
      const { status, html } = await get('/admin/products?department_id=' + DEPT_A + '&limit=200');
      assert.strictEqual(status, 200);
      assert.ok(html.includes(CODE_A1), 'the department filter was ignored');
      assert.ok(!html.includes(CODE_B1),
        'the whole catalogue came back — this is what "it shows me everything" looks like');
    });

    await test('?category_id= narrows it — the categories page links this way', async () => {
      const { status, html } = await get('/admin/products?category_id=' + CAT_A + '&limit=200');
      assert.strictEqual(status, 200);
      assert.ok(html.includes(CODE_A1), 'the category filter was ignored');
      assert.ok(!html.includes(CODE_B1), 'a product outside the category is listed');
    });

    // --- and the ways it used to get dropped again -------------------------

    await test('the department select shows which department is being filtered', async () => {
      /* Without this the control read "all departments" while the list showed
         one, so a filter that worked still looked broken. */
      const { html } = await get('/admin/products?department_id=' + DEPT_A);
      const opt = html.match(new RegExp('<option value="' + DEPT_A + '"[^>]*>'));
      assert.ok(opt, 'the department option is not rendered');
      assert.ok(/selected/.test(opt[0]),
        'the chosen department is not marked selected: ' + opt[0]);
    });

    await test('the pagination links carry the department', async () => {
      /* They used to carry q and category only, so filtering to one department
         and clicking page 2 quietly returned the whole catalogue. */
      const { html } = await get('/admin/products?department=' + DEPT_A + '&limit=1');
      const links = html.match(/\?page=\d+[^"]*/g) || [];
      assert.ok(links.length > 0, 'no pagination links rendered — cannot verify');
      const dropped = links.filter((l) => !l.includes('department='));
      assert.deepStrictEqual(dropped, [],
        'these links lose the department filter: ' + dropped.join(' , '));
    });

    await test('the clear-filters button appears for a department-only filter', async () => {
      const { html } = await get('/admin/products?department=' + DEPT_A);
      assert.ok(html.includes('إلغاء الفلترة'),
        'with only a department filter active there was no way to clear it');
    });

    await test('no filter still lists everything', async () => {
      // The fix must not turn an absent filter into a filter on empty string.
      const { html } = await get('/admin/products?limit=200');
      assert.ok(html.includes(CODE_A1) && html.includes(CODE_B1),
        'the unfiltered list is no longer showing every department');
    });

    // --- every link into this page must use a parameter the route reads -----

    await test('every link into the product list uses a parameter the route accepts', () => {
      /* The defect was a mismatch between two files, so this reads both. A new
         badge linking with a fourth spelling would fail here rather than in
         the panel. */
      const fs = require('fs');
      const viewsDir = path.join(__dirname, '..', 'views', 'admin');
      const routeSrc = fs.readFileSync(
        path.join(__dirname, '..', 'routes', 'admin', 'products.js'), 'utf8'
      );
      const listRoute = routeSrc.slice(0, routeSrc.indexOf('// New Form'));
      const accepted = new Set(
        (listRoute.match(/req\.query\.([A-Za-z_]+)/g) || [])
          .map((m) => m.replace('req.query.', ''))
      );
      accepted.add('page');
      accepted.add('limit');

      const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => (e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)]));

      const offenders = [];
      for (const file of walk(viewsDir).filter((f) => f.endsWith('.ejs'))) {
        const src = fs.readFileSync(file, 'utf8');
        const re = /admin\/products\?([^"'\s]+)/g;
        let m;
        while ((m = re.exec(src))) {
          for (const pair of m[1].split('&')) {
            const key = pair.split('=')[0];
            if (key && !accepted.has(key)) {
              offenders.push(path.basename(file) + ' -> ' + key);
            }
          }
        }
      }
      assert.deepStrictEqual(offenders, [],
        'links pass a parameter the list route never reads: ' + offenders.join(' , '));
    });
  } finally {
    for (const code of [CODE_A1, CODE_A2, CODE_B1]) {
      try {
        await db.prepare('DELETE FROM products WHERE product_id = ?').run(code);
      } catch (e) {
        console.log('  cleanup failed for ' + code + ': ' + e.message);
      }
    }
    server.close();
  }

  console.log(`\n  passed: ${passed}    failed: ${failed}\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
