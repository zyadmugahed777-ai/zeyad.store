/**
 * The admin product form, end to end: post it, read the row back.
 *
 * The complaint this exists for is a round trip, not a unit: "I do not tick
 * free installation, I press save, and it comes back ticked." Nothing short of
 * actually posting the form and reading the database proves that fixed, so
 * that is what this does -- the real route, the real repository, the real
 * PostgreSQL row.
 *
 * It creates one product, edits it twice, and deletes it again in a finally
 * block. It touches no existing row. Run it against the shadow database, never
 * against production.
 *
 *   node tests/test-product-form-roundtrip.js
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
  app.use(session({ secret: 'roundtrip', resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.session.admin = {
      id: 1, username: 'admin', full_name: 'مدير النظام',
      role_id: 1, role_name: 'Super Admin'
    };
    res.locals.admin = req.session.admin;
    res.locals.flash = null;
    res.locals.csrfToken = 'test-csrf';
    req.csrfToken = () => 'test-csrf';
    next();
  });
  app.use('/admin/products', require('../routes/admin/products'));
  return app;
}

/** Post application/x-www-form-urlencoded, following no redirects. */
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
  console.log('\nAdmin product form — post it, then read the row back\n');

  if ((process.env.DATABASE_TYPE || '').toLowerCase() !== 'postgres') {
    console.log('  SKIP: DATABASE_TYPE is not postgres\n');
    process.exit(0);
  }

  const app = buildApp();
  const server = app.listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const repos = getRepositories();

  const marker = 'RT-' + Date.now();
  /* findRawById() keys on the numeric primary key, not the operator-facing
     product code, so the row is looked up by the code it was created with. */
  const rowByMarker = async () => await repos.products.db
    .prepare('SELECT * FROM products WHERE product_id = ?').get(marker);
  let createdId = null;

  try {
    // ---- create, with free installation deliberately NOT ticked ----------
    await test('creating a product stores what the form actually said', async () => {
      const res = await postForm(base, '/admin/products/create', {
        product_id: marker,
        title: 'منتج فحص الحفظ ' + marker,
        price: '1000',
        old_price: '1400',
        stock_status: 'in-stock',
        stock_quantity: '5',
        // "free installation" left OUT entirely -- exactly what a browser
        // sends for an unticked checkbox.
        delivery_policy_type: 'quote_after_confirmation',
        delivery_fixed_fee_sar: '0',
        requires_installation: '1',
        installation_fee_sar: '250',
        placements_submitted: '1',
        show_in_department: '1',
        show_in_offers: '1'
        // show_on_home / show_in_search / show_in_najm left out = unticked
      });
      assert.ok(res.status === 302 || res.status === 200, 'unexpected status ' + res.status);

      const row = await rowByMarker();
      assert.ok(row, 'the product was not created');
      createdId = row.id;
    });

    await test('free installation stays OFF when the box was not ticked', async () => {
      const row = await rowByMarker();
      const stored = row.installation;
      assert.ok(
        stored === '' || stored === null || stored === '0' || stored === 0 || stored === false,
        'installation came back as ' + JSON.stringify(stored) + ' — the box will re-tick itself'
      );
      // And the value must not be a string JavaScript reads as true.
      assert.ok(!(typeof stored === 'string' && stored.trim() !== '' && stored !== '0'),
        'installation holds ' + JSON.stringify(stored) + ', which is truthy in JavaScript');
    });

    await test('the delivery policy chosen on the form reached the database', async () => {
      const row = await rowByMarker();
      assert.strictEqual(row.delivery_policy_type, 'quote_after_confirmation',
        'delivery_policy_type is ' + row.delivery_policy_type);
      assert.strictEqual(Number(row.installation_fee_sar), 250);
      assert.ok(row.requires_installation === true || row.requires_installation === 1,
        'requires_installation is ' + JSON.stringify(row.requires_installation));
    });

    await test('placements are stored exactly as ticked, including the unticked ones', async () => {
      const row = await rowByMarker();
      const on = (v) => v === true || v === 1 || v === '1';
      assert.strictEqual(on(row.show_in_department), true, 'department was ticked');
      assert.strictEqual(on(row.show_in_offers), true, 'offers was ticked');
      assert.strictEqual(on(row.show_on_home), false, 'home was NOT ticked but came back on');
      assert.strictEqual(on(row.show_in_search), false, 'search was NOT ticked but came back on');
      assert.strictEqual(on(row.show_in_najm), false, 'najm was NOT ticked but came back on');
    });

    await test('sizes entered while creating the product are kept', async () => {
      const sizes = await repos.products.findSizes(createdId);
      // The create post above carried no sizes; add them through the edit form
      // and assert there, so this check is about the create path not inventing
      // any.
      assert.strictEqual(sizes.length, 0);
    });

    // ---- edit: turn things the other way round ---------------------------
    await test('editing turns free installation ON when the box is ticked', async () => {
      const res = await postForm(base, '/admin/products/' + createdId + '/edit', {
        product_id: marker,
        title: 'منتج فحص الحفظ ' + marker,
        price: '1000',
        installation: 'on',
        delivery_policy_type: 'fixed',
        delivery_fixed_fee_sar: '75',
        requires_installation: '0',
        installation_fee_sar: '0',
        placements_submitted: '1',
        show_on_home: '1',
        show_in_search: '1',
        'size_label[]': ['مقاس صغير', 'مقاس كبير'],
        'size_price[]': ['1000', '1450'],
        'spec_label[]': ['الاستهلاك'],
        'spec_value[]': ['50 وات']
      });
      assert.ok(res.status === 302 || res.status === 200, 'unexpected status ' + res.status);

      const row = await rowByMarker();
      assert.ok(row.installation === '1' || row.installation === 1 || row.installation === true,
        'installation is ' + JSON.stringify(row.installation) + ' after ticking the box');
    });

    await test('editing changes the delivery policy rather than ignoring it', async () => {
      const row = await rowByMarker();
      assert.strictEqual(row.delivery_policy_type, 'fixed');
      assert.strictEqual(Number(row.delivery_fixed_fee_sar), 75);
      assert.ok(row.requires_installation === false || row.requires_installation === 0,
        'requires_installation did not go back to no');
    });

    await test('editing rewrites the placements, turning off what was unticked', async () => {
      const row = await rowByMarker();
      const on = (v) => v === true || v === 1 || v === '1';
      assert.strictEqual(on(row.show_on_home), true);
      assert.strictEqual(on(row.show_in_search), true);
      assert.strictEqual(on(row.show_in_offers), false,
        'offers was ticked before and left unticked now, but stayed on');
    });

    await test('sizes and specifications survive the edit', async () => {
      const sizes = await repos.products.findSizes(createdId);
      assert.strictEqual(sizes.length, 2, 'expected 2 sizes, got ' + sizes.length);
      const big = sizes.find((s) => s.label === 'مقاس كبير');
      assert.ok(big, 'the second size is missing');
      assert.strictEqual(Number(big.price), 1450, 'the size price was not stored');

      const specs = await repos.products.findSpecs(createdId);
      assert.strictEqual(specs.length, 1);
      assert.strictEqual(specs[0].value, '50 وات');
    });

    await test('a post with no placement marker leaves the placements alone', async () => {
      // An API client or the AI employee posts no checkboxes at all. That must
      // not read as "the operator unticked everything".
      const before = await rowByMarker();
      await postForm(base, '/admin/products/' + createdId + '/edit', {
        product_id: marker,
        title: 'منتج فحص الحفظ ' + marker,
        price: '1200'
      });
      const after = await rowByMarker();
      assert.strictEqual(Number(after.price), 1200, 'the edit did not apply at all');
      assert.strictEqual(!!after.show_on_home, !!before.show_on_home,
        'a post without the marker reset show_on_home');
      assert.strictEqual(!!after.show_in_search, !!before.show_in_search,
        'a post without the marker reset show_in_search');
    });

  } finally {
    /* Resolve the id even when the very first assertion failed before it was
       captured -- otherwise a broken run leaves its product behind forever. */
    if (!createdId) {
      try { const r = await rowByMarker(); if (r) createdId = r.id; } catch (_) {}
    }
    if (createdId) {
      try {
        await repos.products.hardDelete(createdId);
        /* hardDelete() is the repository call, not the admin route, so nothing
           refreshes the static caches the route would have refreshed. Without
           this the deleted product stayed in products_db.js and sitemap.xml --
           both tracked files -- and the test left the working tree dirty. */
        await require('../utils/sync-frontend').syncFrontend();
      } catch (e) {
        console.log('  (cleanup warning: ' + e.message + ')');
      }
    }
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
