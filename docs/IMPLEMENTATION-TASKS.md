# Implementation Tasks

Per the plan's token-efficiency rule, full per-task detail (Task ID · Title · Objective · Current Problem · Root Cause · Affected Files · Affected Systems · Dependencies · Implementation Strategy · Expected Behavior · Tests Required · Regression Risks · Risk Level · Rollback Strategy · Definition of Done) is written **wave-by-wave, just before that wave executes**, not all up front — this file is appended to as work proceeds instead of pre-generating ~58 task specs that would need re-reading later. See `MASTER-IMPLEMENTATION-PLAN.md` for the wave summary and `DEPENDENCY-GRAPH.md` for ordering.

## Wave 0 — Safety baseline

### W0-T1: Commit uncommitted tree
- **Status**: DONE
- **Objective**: Establish a rollback point before any code changes.
- **Root cause of the risk**: ~325 files of PostgreSQL/Najm migration work sat uncommitted on an unborn `main` branch in the main directory.
- **Affected files**: whole tree (`.gitignore` added excluding `node_modules/`, `.env`, `backend/db/backups/`, `backend/db/pg_shadow_data/`).
- **Implementation**: `git add -A` with excludes, verified `.env` not staged, committed as `44ddb39`.
- **Definition of done**: `git log` shows the checkpoint commit; `.env` and secrets confirmed absent from the diff.

### W0-T2: Boot log + health check baseline
- **Status**: PENDING — do before Wave 1 edits land.

### W0-T3: Scratch DB for tests
- **Status**: PENDING — confirm `backend/tests/` DB target is not `zeyad_shadow` before running anything.

## Wave 1 — Data-layer correctness

- **W1-T1 (DONE)**: Extended the boolean column rewrite in `backend/repositories/postgres/postgres-base-repository.js` from a hardcoded 6-column list (one of which, `is_featured`, doesn't exist in the schema) to a `BOOLEAN_COLUMNS` array covering all 13 real boolean columns confirmed against `db/postgres-schema.sql` (`is_active, is_archived, is_default, is_primary, is_visible, is_confirmed, is_enabled, is_read, free_shipping, is_new, is_best_seller, requires_installation, editable`). Verified with `node -e "require(...)"`.
- **W1-T2 (DONE)**: Registered `pg.types.setTypeParser(1700, parseFloat)` in `backend/config/pg-database.js` (module load time, before any pool/query executes) so NUMERIC/DECIMAL columns — order totals, prices, coupon amounts, exchange rates — come back as JS numbers instead of strings. Confirmed no other production file constructs a `pg.Pool` outside this module (only test/tooling scripts require `pg` directly), so the global type registry patch covers all runtime queries.
- **W1-T3 (DONE)**: Fixed all 11 `await x.prepare(...).get(...).count` (and `.total`, `.c`) operator-precedence bugs across `auth-repo.js` (×2), `category-repo.js` (×2), `department-repo.js` (×3), `media-repo.js` (×1), `newsletter-repo.js` (×1), `product-repo.js` (×2) — rewritten to `(await x.prepare(...).get(...)).count` so the property read happens on the resolved row, not the pending Promise. Verified each file still parses with `node -e "require(...)"`.
- **W1-T4 (DONE, no change needed)**: `backend/config/pg-database.js` already sets `idleTimeoutMillis: 30000` and `connectionTimeoutMillis: 5000` on the Pool config.
- **W1-T5 (deferred)**: `-N days` date arithmetic and `RETURNING` clause handling beyond the boolean/count fixes — not exercised by any currently-known bug; revisit if Wave 3/7 testing surfaces a date or RETURNING-related defect.

**Not yet fixed (belongs to later waves, not Wave 1)**: `postgres-base-repository.js`'s `db.transaction(fn)` helper calls `fn.apply(txRepo, args)`, but every one of its 22 call sites across the postgres repos passes an arrow function, which ignores the `apply`-supplied `this` and keeps using the outer (pool-bound) `this` — confirmed by inspection, matches `CRITICAL-FINDINGS.md` #2b. This is Wave 3 (transactions & financial integrity) scope, which also depends on Wave 2 (async contract) per `DEPENDENCY-GRAPH.md` — not fixed in this pass.

## Wave 2 — Async contract

All DONE, commits `af50f11`, `fdb9ea9`, `4ed35f9`, `23d38b7`, `c747a8e`.

- **W2-T1 (DONE, done first per the hard ordering constraint)**: `services/ai/tools.js` — all 14 sites doing `if (!hasAiPermission(k))` / `if (!writesEnabled())` on an un-awaited async call (so the check always granted) fixed together with their downstream writes in the same pass: `requireReadPermission`, `proposal`, every write-proposal handler (`updateProductPrice`, `updateProductStock`, `updateProductDescription`, `updateCategory`, `createDiscount`, `updateDiscount`, `updateStoreSetting`, `createProduct`, `deleteProduct`, `publishContent`, `updateOrderStatus`), and `executeConfirmedAction` (which was also calling nonexistent `repos.cms.findPageBySlug/findPageById` — corrected to `getPageBySlug/getPageById`). No intermediate commit exists where gates and writes are inconsistent.
- **W2-T2 (DONE)**: `services/settings-service.js` — `get()`'s `if (rowsOrPromise instanceof Promise) return defaultValue` was always true under PostgreSQL, freezing `exchange_rate`/`express_delivery_fee` at hardcoded defaults. Converted `get/getNumber/getBoolean/getJSON/getAll/set/setMany` to real `async` methods (removed the dead sync/async dual-path and the now-redundant `getAsync`/`getAllAsync`).
- **W2-T3 (DONE, discovered live, more severe than the audit's stated finding)**: `services/currency-service.js`'s `calculateOrderFinancials` — "the authoritative financial engine" — called `repos.products.findForOrderFinancials()` and `repos.coupons.findValidByCode()` without `await`. Both async, so `product`/`couponRow` were unresolved Promises: `Number(product.price)` was `NaN→0` for every line item, meaning **every order subtotal computed as 0**, and any coupon code (even invalid ones) passed validation. Fixed `getExchangeRate/convertPrice/convertToSar/calculateOrderFinancials` to be properly async, plus the `is_active === 0` check to also handle PG's real `false`. Propagated `await` through every production caller: `routes/api/orders.js`, `routes/api/legacy.js` (solar/majlis/kitchen calculators), `services/cart-service.js` (rewrote an `items.map()` to a `for...of` so each item price could be awaited; also fixed `item.is_active === 1`), `services/delivery-service.js` (policy pricing + `getNajmDeliveryAnswer`, which was throwing on every bedroom/household delivery question since `pol` was a Promise, + `getPublicDeliveryInfo`, awaited by `routes/api/delivery.js` but itself synchronous internally), `services/calculator-service.js`, `services/ai/customer-tools.js` (`get_delivery_policy_and_estimate` tool).
- **W2-T4 (DONE)**: `services/coupon-service.js`'s `atomicRedeemCoupon` called the async `repo.incrementUsage()` without await, so the truthy Promise made the max-uses guard dead — unlimited coupon redemption. Made it `async`; its one caller (`routes/api/orders.js:231`) already awaited it.
- **W2-T5 (DONE)**: `routes/api/categories.js` — both route handlers called async repo methods without `await` then `.map()`'d the Promise (throws), breaking `GET /api/categories` (storefront navigation) on every request. Made both handlers `async`.
- **W2-T6 (DONE)**: Added `process.on('unhandledRejection', ...)` logging in `server.js` given ~40 fire-and-forget async calls still in the codebase. Deliberately did **not** add an `uncaughtException` handler — swallowing a real uncaught exception is riskier than letting the process crash, since state may already be corrupted.
- **W2-T7 (DONE, opportunistic sweep of the same bug class)**: Grepped for `.(is_active|is_new|is_best_seller|is_primary|editable|...) === 0|1` across production code (excluding tests and the dead `repositories/sqlite/` tree) and fixed every real hit: `routes/api/products.js` (deactivated products stayed visible on their detail page), `repositories/postgres/product-repo.js`'s `deleteImage()`/`ensurePrimaryImages()` (deleting a product's primary image never promoted a replacement — a concrete, previously-unlisted root cause behind the media "primary image" bug), `routes/admin/products.js`'s "ensure at least one primary" safety net (was *always* firing on every save and resetting the primary image, since its own skip-condition was always false), `services/product-service.js` + `utils/sync-frontend.js` (is_new/is_best_seller badges), `services/cms-service.js` + `routes/admin/editor.js` (protected CMS pages could be edited/published because the protection check never fired), `routes/admin/delivery.js` + `repositories/postgres/delivery-repo.js` (admin delivery dashboard always showed 0 active policies/provinces; `getStats()` also had the missing-await count bug).

**Still deferred to Wave 3** (unchanged from the Wave 1 note above): the `db.transaction(fn)` arrow-function `this`-binding bug — 22 call sites across the postgres repos pass arrow functions that ignore the transaction client and keep writing through the pool, so every "transaction" (including `product-repo.js`'s `deleteImage`/`ensurePrimaryImages` touched in W2-T7) still autocommits per-statement with no real atomicity or rollback.

**Known remaining gap, not yet swept**: the pre-migration sync-style test files (`test-phase1-integrity.js`, `test-batch1-e2e.js`, `test-checkout-coupon-delivery.js`, `test-phase7f-e2e.js`, `test-phase8c-adapter-switch.js`, `test-batch6c-e2e.js`, and others) call the now-async settings/currency/calculator/AI-tools APIs without `await` and use raw synchronous `db.prepare(...).get()` — they were already broken under PostgreSQL before this session for unrelated reasons and will need a full rewrite in the Wave 13 regression pass, not patched individually here.

## Wave 3 — Transactions & financial integrity

DONE, commits `20caae5`, `17f6cb8`, `ed93131`.

- **W3-T1 (DONE)**: `postgres-base-repository.js`'s `db.transaction(fn)` calls `fn.apply(txRepo, args)`, but all 23 call sites across the postgres repos (`banner-repo.js`, `cart-repo.js`, `customer-report-repo.js`, `customer-request-repo.js`, `offer-repo.js`, `order-repo.js`, `product-repo.js`, `settings-repo.js`, `wishlist-repo.js`) passed arrow functions, which ignore `.apply`'s `this` and keep using the outer pool-bound instance. Converted every one to a regular `async function() {...}` expression. Verified with a mock pool/client that queries now exclusively hit the transaction client and that a mid-transaction throw correctly rolls back. Also found and fixed 3 related bugs uncovered while reading each transaction body: `banner-repo.js`/`offer-repo.js`'s `updateSortOrder()` and `settings-repo.js`'s `bulkUpsert()` all called `this.db.prepare(...)` *before* entering the transaction (binding the statement to the pool permanently regardless of the `this`-fix) — moved inside. `product-repo.js`'s `importProductsBatch()` (a standalone, non-route admin import script, not a live path) had the same bug plus every insert missing `await` entirely. `wishlist-repo.js`'s `mergeWishlists()` called two async lookups without `await`.
- **W3-T2 (DONE)**: `utils/order-number.js` generated order numbers from the frozen pre-migration SQLite `orders` table via `getDb()` while orders were written to PostgreSQL — after the very first order ever placed against Postgres, every subsequent checkout collided with `uq_orders_order_id` and 400'd. Rewrote to query the live PostgreSQL `orders` table directly and made it `async`; updated its two production callers (`routes/api/orders.js`, `services/ai/customer-tools.js`'s Najm order-confirmation path).
- **W3-T3 (DONE)**: `routes/api/orders.js`'s order-creation transaction did `BEGIN`/`COMMIT`/`ROLLBACK` on a checked-out client but every write inside used the pool-bound `repos.*` singleton on a different connection — the transaction was a complete no-op. Added transaction-scoped repo support: `repositories/postgres/index.js`'s `getPgRepositories(client)` builds a fresh bundle bound to a given client; `repositories/index.js`'s `getRepositories(adapterType, transactionClient)` gained an optional second param that delegates to it on the postgres adapter. `orders.js` now calls `getRepositories(null, db)` inside `tx.run()` and uses those repos for every write (customer, coupon redemption, order/items/payment). Also added the previously entirely-missing stock decrement: `product-repo.js`'s new `decrementStockLocked()` does `SELECT stock_quantity ... FOR UPDATE` then an atomic decrement in the same transaction, closing the race condition where two concurrent orders for the last unit could both succeed. **Per explicit user decision** (asked because stock_quantity data quality in the live catalog couldn't be verified from this sandbox — no DB access), it clamps at 0 and never blocks checkout rather than hard-rejecting orders when stock_quantity is insufficient; revisit if stock_quantity is later confirmed to be reliably maintained. Verified end-to-end against a fake pool/client: zero queries leak to the pool, full `BEGIN → SELECT FOR UPDATE → UPDATE stock → UPDATE coupon usage → COMMIT` sequence confirmed.

**Known remaining gap**: `addressService.createAddress()` and `cartService.clearCart()`/`notificationService.createNotification()` inside the order-creation transaction still use pool-bound singletons, not `txRepos`. The address call is already wrapped in try/catch (best-effort, non-financial); the other two are intentionally best-effort side effects. Not moved into the transaction in this pass — low financial risk, but worth revisiting in Wave 7 if address-save reliability becomes a reported issue.

## Wave 4 — Auth & sessions

DONE, commit `75b718e`.

- **W4-T1 (DONE)**: `routes/api/auth.js` — `/login`, `/me`, `/profile` were all synchronous handlers calling async repo methods (`findByPhone`, `create`, `findById`, `update`, `updateByPhone`) without `await`. A Promise is truthy, so `/login`'s "create new customer" branch never ran for genuinely new customers, and `req.session.customer` was built from an unresolved Promise object — every field including `id` ended up `undefined`. Made all three handlers `async` and awaited every call.
- **W4-T2 (verified, no change needed)**: `middleware/auth.js`'s `ensureDefaultAdmin`, `requireRole`, `loginAdmin` were already correctly `async`/awaited; the underlying count bug was already fixed in Wave 1.
- **W4-T3 (DONE)**: `middleware/error.js` rendered `err.stack` to the admin error view unconditionally regardless of `NODE_ENV`, unlike the API error path which already guarded it. Applied the same `NODE_ENV === 'development'` guard. Deliberately did not flip `.env`'s `NODE_ENV` to `production` — that also flips session cookies to secure-only (`server.js` already ties this correctly), which would break admin login if the site isn't served over HTTPS yet; that's a deployment decision for the site owner.

## Wave 5 — Products, images, video

DONE, commits `36cb8d6`, `3200506`.

- **W5-T1 (DONE, highest-impact fix of the whole plan)**: `views/admin/products/form.ejs:501` opened `document.addEventListener('DOMContentLoaded', function() {` and never closed it — everything after, including the entire multi-image/primary-image/drag-drop section and a second independent `DOMContentLoaded` listener at line 736, stayed nested one level too deep. The browser hit end-of-input mid-parse and discarded the *entire* inline `<script>`, so every `onclick` handler on the page called undefined functions. Root cause of essentially all the reported admin product-media bugs. Fixed by inserting the single missing `});` at the point the first logical section actually ends (right after the old-price preview block) — this correctly un-nests everything after it, including the line-736 listener, with no separate fix needed there. Verified: extracted script passes `node --check`, and the full `.ejs` file renders successfully via the `ejs` package with representative locals.
- **W5-T2 (DONE)**: `.env`'s `MAX_FILE_SIZE` was `10485760` (10MB) against a 50MB documented intent; corrected to `52428800`. (Not visible in git — `.env` is gitignored.)
- **W5-T3 (DONE)**: `middleware/upload.js`'s `UPLOAD_DIR` trusted a relative env value verbatim (resolved against `process.cwd()`, not the backend directory). Confirmed two divergent `uploads/` trees already exist on disk (repo root vs `backend/`). Made resolution always absolute relative to the backend dir; unified `routes/admin/products.js` and `routes/admin/media.js` to import the same constant instead of independently hardcoding `path.join(__dirname, '..', '..', 'uploads')`. Did not touch either existing uploads tree — reconciling/merging them needs human review.
- **W5-T4 (DONE, opportunistic)**: `routes/admin/media.js`'s `folder` request field was joined directly into a filesystem path with no sanitization — a real path-traversal bug (`path.join` normalizes `..` segments but doesn't clamp the result inside the base directory). Added a safe-charset filter for folder names and a containment check in `safeUnlink()`.
- **W5-T5 (DONE)**: `middleware/error.js`'s multer error messages still said "10MB"; updated to 50MB and removed the misleading "per image" wording (applies to video too). Added `req.resume()` to drain the remaining request body before responding to a rejected upload, as defense against the `ECONNRESET` symptom recurring for files that still exceed the new limit.
- **W5-T6 (DONE, discovered live, not in the original audit)**: `routes/admin/products.js`'s edit flow — when a newly-uploaded image was marked primary, it was inserted directly with `is_primary=1` via `addImage()` (a bare INSERT with no clearing logic), leaving the *previously existing* primary image also still marked primary — two primary rows per product. Fixed by always inserting new images with `is_primary=0`, then calling the existing `setPrimaryImage()` (which already clears every other row first) on whichever new image should become primary.

**Known remaining gap**: `utils/repair-images.js` (a standalone repair script, not a live route) and `services/ai/image-service.js` (a temp-file cache for AI image processing) each independently hardcode their own upload-adjacent paths rather than importing `UPLOAD_DIR` from `middleware/upload.js`. Both happen to already match the default (`backend/uploads`), so there's no live divergence today, but they won't follow a future custom `UPLOAD_DIR` override. Left as-is — low priority, `repair-images.js` also has unrelated pre-migration sync/await bugs (`repos.products.count()` used synchronously) that would need a separate pass.

## Wave 6 — Admin panel

DONE, commits `8570c8f`, `4ad9098`, `23b58a9`.

- **W6-T1 (DONE)**: `routes/admin/index.js` mounted `/coupons`, `/delivery`, `/requests`, `/customer-reports`, `/frame-products` with zero `checkPermission` middleware — any authenticated admin, any role, could reach them. Added the gate for all five; extended `middleware/rbac.js`'s hardcoded `rolePermissions` map with entries for these five resources (it had none, so the gate alone would have locked out every role except Super Admin). Verified the hardcoded role name strings ('Super Admin', 'Admin', 'Editor', 'Sales', 'Support') exactly match what's actually seeded in the production `roles` table (checked against a local backup dump). Also fixed a crash in the same function: `req.headers.accept.indexOf(...)` threw when a client sent no Accept header.
- **W6-T2 (DONE)**: `server.js` served the entire repo root as static files (needed for the storefront's top-level HTML/CSS/JS), which also published `backend/` itself — including `db/zeyad.db` and `db/backups/*.sql` — since `express.static` only ignores dotfiles by default, not arbitrary non-dotfile directories. Added a blocklist middleware before the static handler covering `backend`, `node_modules`, `backups`, `docs`, `scratch`, `archive`, `ai` (agent skill files, unrelated to the storefront), and the dot-prefixed dev directories. Verified with a standalone prefix-matching test that legitimate paths are unaffected.
- **W6-T3 (DONE, alternate mitigation)**: `middleware/csrf.js` deliberately lets any authenticated admin's multipart POST bypass its token check — a structural ordering problem (multer hasn't parsed `req.body` yet when `csrfProtection` runs, so it can't see `req.body._csrf` for multipart requests), not a simple oversight. Rather than restructure every admin route's middleware order, added `sameSite: 'lax'` to the session cookie in `server.js`, which blocks the actual cross-site attack vector (a malicious page auto-submitting a hidden form to an admin route while the admin is logged in) for every route, multipart or not.
- **W6-T4 (DONE)**: Implemented the missing `POST /admin/products/:id/duplicate` route — `list.ejs`'s "copy" button had been posting to a route that didn't exist. Copies fields/specs/FAQs/colors, and copies each image *file* (not just the DB path) so the original and duplicate don't end up sharing files that a later delete on either one would remove out from under the other. Created inactive by default so an unreviewed copy doesn't go live.
- **W6-T5 (DONE, discovered live)**: `views/admin/products/form.ejs`'s server-rendered existing-image grid checked `img.is_primary === 1` against a real PostgreSQL boolean — the "which image is primary" badge/radio never reflected the database, always falling back to "index 0 is primary." Fixed.
- **W6-T6 (investigated, no fix needed)**: The audit's claim that the AJAX `set-primary`/`delete-image` endpoints have no caller is true, but `form.ejs` already has a complete, working alternate path for existing-image management (a `primary_image_id` radio + `delete_images[]` checkboxes submitted with the main edit form, already correctly wired server-side) — it was simply blocked from working at all by the Wave 5 script-death bug. The AJAX endpoints remain unused but harmless; not wired up, since a working path already exists and per the no-new-UI constraint.
- **W6-T7 (investigated, no fix needed)**: `routes/admin/media.js`'s non-AJAX `/upload` route is genuinely dead code — confirmed neither `list.ejs` nor `library.ejs` (the only two media-upload UIs) reference it; both already correctly use `/upload-ajax`. Left as-is.

**Explicitly deferred, not attempted**: per-route (as opposed to per-router) permission differentiation — a single `resource:view` gate at router-mount time doesn't distinguish view/create/update/delete within a sub-router, so e.g. an Editor with only `products:view` can technically reach a POST delete route mounted under `/admin/products`. Fixing this properly means adding permission checks inside every admin sub-router file individually (a dozen-plus files) — flagged as a future pass rather than attempted piecemeal, given no current multi-role production usage has been reported as an actual problem.

## Wave 7 — Commerce flows

DONE (given no live DB access from this sandbox, verification is code-level/simulated rather than a true golden-master reconciliation run — see note at the end), commit `35a4578`.

- **W7-T1 (DONE, major finding)**: `services/address-service.js` — the entire `AddressService` class was written in the fully-synchronous pre-migration style: every method called async repo methods without `await`, and none of its own methods were `async` either. `getAddresses()` returned a bare Promise where an array was expected; `createAddress()`/`updateAddress()` ran their default-flag-clear + write inside an un-awaited, non-transaction-scoped `this.tx.run(() => {...})`. The entire saved-address feature was non-functional under PostgreSQL, and this is also why `routes/api/orders.js`'s `addressService.createAddress()` call during checkout (wrapped in try/catch as "best effort" in Wave 3) was silently failing on every order. Rewrote the whole service as properly async/awaited, wired the write paths through the transaction-scoped repo bundle from Wave 3 so the default-flag clear and the write happen atomically, and made all 6 `routes/api/addresses.js` handlers async.
- **W7-T2 (verified clean, no changes needed)**: Swept `routes/api/cart.js`, `routes/api/delivery.js`, `routes/admin/customers.js`, `routes/admin/coupons.js`, `routes/admin/delivery.js` for the same async-contract bug class (non-async handlers, un-awaited service calls) found repeatedly in earlier waves. All were already correctly async/awaited — the core services underlying them (currency, cart, coupon, delivery) were already fixed in Waves 2–3.
- **W7-T3 (verified, systemic check)**: Grepped every file in `services/` for `getRepositories()` usage with zero `async` occurrences anywhere in the file — the exact signature that made `address-service.js` completely non-functional. No other service file matches that pattern post-fix; `notification-service.js`'s non-`async` methods (`getUnreadCount`, `getRecentNotifications`, `markAsRead`, `markAllAsRead`) merely omit the `async` keyword while still correctly `return`ing the underlying promise (safe as long as callers `await` them) — and have zero production callers currently, so not touched.

**Known limitation**: this session has no network access to the actual PostgreSQL instance (confirmed in Wave 3 — connection to the configured host/port is refused from this sandbox), so "reconcile to Δ = 0.0000 against `backend/tests/golden-master-baseline.json`" as literally specified in the plan could not be executed as a real test run. Verification in this wave (and throughout the session) relied on `node -c`/`node --check` syntax validation, `ejs` template compilation, and standalone simulations against mock `pg` pool/client objects that replicate the shim's exact query-building behavior. A real end-to-end regression run against a live database is still needed before considering Wave 7 (and every earlier wave) fully proven — this is Wave 13's job, and should be the first thing done in an environment with real DB access.

## Wave 8 — CMS, reports, notifications (expanded scope: sitewide async-contract sweep)

DONE, commits `fe78ed5`, `02ca68b`.

- **W8-T1 (DONE, major finding, same root cause as Wave 3/7 but a different call-site shape)**: full-codebase grep for `.tx.run(` found 7 more instances of the "arrow function ignores the transaction client" bug beyond the one already fixed in `address-service.js` (Wave 7) — this is `PostgresTransactionManager.run(callback)` (a *different* transaction mechanism than `postgres-base-repository.js`'s per-repo `db.transaction()` fixed in Wave 3), which passes the client as a callback *argument* rather than rebinding `this`, but every caller ignored that argument and called the pool-bound `this.repo`/`repos.X` instead. Fixed all 7: `services/cms-service.js` (`saveDraftElement`, `publishPage`, `undoElement`, `rollbackPage` — each pairs a revision-snapshot write with the actual content write, so a failure between the two left inconsistent history), `services/ai/permissions.js` (`saveAiPermissions`), `services/ai/najm-settings-store.js` (`saveNajmInstructions` — a failure here could leave Najm with zero active system instructions), `services/ai/settings-store.js` (`saveSystemInstructions`, `saveKnowledge`).
- **W8-T2 (DONE, very large finding)**: a systemic grep for non-async route handlers across all of `routes/api/` (the same async-contract bug class fixed repeatedly in earlier waves) surfaced 13 more broken files, all previously undocumented: `settings.js` (the **public** `/api/settings` endpoint — likely why the frontend's `zfb-config.js` hardcodes `exchangeRate: 140`, since the live endpoint has apparently never worked under PostgreSQL), `banners.js`/`branches.js`/`offers.js` (storefront homepage banners, branch list, active offers all returned empty), `media.js`, `newsletter.js`, `notifications.js`, and — most impactful — all five customer-intake forms (`contact.js`, `appointments.js`, `designs.js`, `consultations.js`, `quotes.js`): every one called the async `customerRequestService.createRequest()` without `await`, so every submission returned `requestId: undefined`, and a validation error thrown inside the service became an unhandled rejection the route's own `try/catch` could never see — a failed submission looked identical to success from the browser. Also `customer-reports.js`: the bug-report endpoint never returned a real `reportNumber`/`trackingToken`, and `GET /track/:reportNumber` never awaited its lookup, so the truthy-Promise `!report` check never 404'd on a genuinely missing report.
- **W8-T3 (verified clean)**: ran the equivalent sweep across all of `routes/admin/` — found only legitimate non-async handlers (pure form-renders with no DB access, `renderPage`/`renderNajmPage` factory functions that are themselves already correctly `async`). The admin panel was not affected by this bug class; it was concentrated in customer-facing API routes, consistent with those forms having had less exercise than the admin panel during the migration.

This wave ended up being the largest single-session fix for actual live storefront breakage — the public settings endpoint and all five lead-generation forms (contact/appointment/design/consultation/quote) were silently broken sitewide before this pass.

## Wave 9 — Najm & AI

DONE, commits `d1078d2`, `f33c40f`, `623666a`, `47f73bf`, `110ff41`, `7a99685`.

- **W9-T1 (DONE, critical finding #16)**: `routes/api/customer-ai.js`'s `POST /customer-chat` accepted `req.body.userId` as an identity fallback with no `requireAuth` — an unauthenticated caller sending `{"message":"...","userId":42}` was treated as customer 42, able to read/modify that customer's cart and place orders under their identity. Removed the body fallback entirely; identity now comes only from `req.session.customer.id`.
- **W9-T2 (DONE, critical finding #17)**: `services/ai/customer-tools.js`'s `track_order`/`get_order_status` only verified the caller's phone `if (phone)` was provided at all — omit it and the check never ran. Order IDs are sequential, so this was a full enumeration IDOR. Confirmed two real callers already omit phone: the tool's own schema is only a hint to the model (not enforced), and `services/ai/agent.js`'s no-provider fallback fires this tool on any 4+ digit number found in a customer's message, with no phone. Made the phone check mandatory.
- **W9-T3 (DONE, critical finding #18)**: `najm-order-drafts-repo.js`'s draft lookup never checked `expires_at` (despite storing a 2-hour TTL) or `session_id` ownership — an 8-hex-char token, once obtained, could be confirmed by anyone, at any time. Fixed the lookup to require both; made `confirmDraft()` an atomic conditional UPDATE used as the actual concurrency guard (moved *before* order creation in `customer-tools.js`, not after, so two concurrent confirms can no longer both create a duplicate order). While in this code path, found and fixed two more bugs: `order-repo.js`'s `createCustomerOrder()` looped over order-item inserts without `await`, and had no stock decrement at all for Najm-driven orders (added the same `decrementStockLocked()` used by the main checkout since Wave 3, which required carrying the internal numeric product id — previously dropped — through the draft's items payload).
- **Investigated, not changed**: `createCustomerOrder` resolves the customer by phone with no identity verification against the Najm session. This exactly matches the main checkout's existing phone-based COD resolution (`routes/api/orders.js` does the same) — a shared, pre-existing business-model characteristic, not a Najm-specific bug. Fixing it in isolation here would make the two order-creation paths inconsistent rather than close a real gap; a real fix needs a system-wide phone-verification (OTP) feature, out of scope for a bug-fix pass.
- **W9-T4 (DONE, critical finding #20)**: `hybrid-search.js` fabricated `rating`/`reviews_count`/`warranty`/`delivery_time` defaults whenever the real DB value was null, across all three of its exported search/recommendation functions — this data becomes grounding context Najm presents to customers as fact. Separated the internal-only scoring default (still needed for ranking math) from what's actually returned; real values (including null) now pass through honestly. Also added an `isCategoryFallback` flag threaded to `customer-tools.js`'s `search_products` tool response as a `note` field, since a failed category search silently substituted up to 100 unrelated site-wide best-sellers with no signal that the category was ignored.
- **W9-T5 (DONE)**: Added rate limiting to `POST /api/ai/customer-chat` (unauthenticated, costs a real AI-provider round trip per call) — same sliding-window pattern already used in `customer-reports.js`.
- **W9-T6 (DONE)**: `services/ai/providers.js`'s Gemini adapter sent the API key as a `key=` URL query parameter (leaks into access logs); switched to the documented `x-goog-api-key` header.
- **W9-T7 (investigated, no fix needed)**: `createProvider()`'s fallthrough to `BedrockProvider` for unrecognized provider strings isn't actually reachable — `saveProviderSettings()` already validates against the known provider list before persisting, and a fresh install's default is explicitly `'bedrock'`, not a fallthrough accident.
- **W9-T8 (DONE)**: `services/ai/agent.js`'s tool-execution loop had no per-tool error isolation — one failing tool call (e.g. `get_product` on a deleted id) aborted the whole loop, discarding already-collected results from other tool calls in the same turn and falling back to a generic response. Wrapped the individual tool call so a failure produces a normal `{success:false, error}` result and the loop continues.
- **Not attempted**: `CAST(id AS TEXT)`-style numeric/string comparison hardening across Najm tool args, and a formal "sales-assistant behavior spec" — the plan named these but no concrete bug was identified for either during this pass; the persona/behavior instructions in `services/ai/defaults.js` already cover tone, real-data-only, and confirmation-before-order requirements reasonably well. Revisit if a specific failure is reported.

Wave 9 closes out every P0/P1 item named in the original task brief (PostgreSQL correctness, async correctness, transactions, financial integrity, auth/identity, admin functionality, media, cart/checkout/coupons, Najm/AI integration). Remaining waves (10-13) are P2 per the brief's own priority ordering: frontend/backend contract, security/performance hardening, SQLite legacy removal (must run last), and final regression.

## Wave 10 — Frontend↔backend contract

DONE (both named concerns already resolved as side effects of earlier waves — verified, not re-fixed).

- **W10-T1 (verified resolved by Wave 8)**: the plan named replacing `zfb-config.js`'s static `exchangeRate: 140` snapshot with live settings. Found that `zfb-core.js`'s `loadDynamicData()` already implements exactly this — it `fetch('/api/settings')` and overlays `window.ZFB_CONFIG.exchangeRate = Number(data.exchange_rate) || 140` (plus store name, contact info, social links, logo) on top of the static fallback. This was silently never working only because `/api/settings` itself 500'd on every call before the Wave 8 fix. Confirmed `exchange_rate` is seeded under the `commerce` settings group (checked against a production backup dump), which `/api/settings`'s `findByGroups([...])` call already includes. No frontend code changes needed — the intended architecture (static fallback + async live overlay) was already correct.
- **W10-T2 (verified resolved by Wave 1)**: "numeric string handling" — `pg.types.setTypeParser(1700, parseFloat)` registered in Wave 1 already ensures NUMERIC/DECIMAL columns deserialize as JS numbers everywhere in the app. The settings table's `value` column is TEXT regardless of its own `type` field, so this doesn't even apply there directly, but `routes/api/settings.js` already `parseFloat()`s any setting marked `type: 'number'` before returning it — also unaffected by this class of bug.

## Wave 11 — Security & performance hardening

DONE for the concrete, safely-actionable items; several named items explicitly deferred (see below) rather than guessed at. Commits `feb7208`, plus the `.env` secret rotation (untracked — gitignored).

- **W11-T1 (DONE)**: `middleware/error.js` passed `err.message` straight to the client on every error path regardless of source. Added `isRawDatabaseError()` — a `pg` driver error carries `severity`/`table`/`constraint` fields or a 5-character SQLSTATE `code` that a plain application `new Error(...)` never has — and sanitize to a generic Arabic message when detected, across the API/admin/default response paths. Verified against both a simulated business error (passes through) and a simulated pg error (sanitized).
- **W11-T2 (DONE)**: found `.env`'s `SESSION_SECRET` was still the literal fallback/dev value (`zfb-dev-session-secret-2026`) — the same string `middleware/auth.js`/`server.js` fall back to when the env var is *unset*, meaning this deployment was effectively running with a predictable, publicly-guessable session-signing secret. Generated a cryptographically random 48-byte hex secret and replaced it. **Note for the operator**: this invalidates every currently active session (admin and customer) the next time the server restarts and picks up the new value — everyone will simply need to log in again, no data is affected.
- **W11-T3 (investigated, deferred — needs operator input)**: `server.js`'s `cors()` has no options, which reflects any request `Origin` back as allowed. Since `credentials` isn't enabled, browsers won't attach session cookies to cross-origin requests regardless, so the practical exposure is limited to public read endpoints (products/categories/etc., which are public anyway) being fetchable cross-origin. Restricting this properly requires knowing the site's actual production domain(s) to allowlist, which isn't available in this sandbox and isn't safe to guess — a wrong guess breaks the site's own same-origin requests if reasoned about incorrectly. Flagging for the operator to specify the domain(s) before this is tightened.
- **W11-T4 (investigated, deferred — high risk to guess)**: `helmet({ contentSecurityPolicy: false })` disables CSP entirely. The codebase relies extensively on large inline `<script>` blocks (e.g. the whole `form.ejs` fix in Wave 5) and likely inline styles across the EJS views — enabling even a moderate CSP without a nonce/hash strategy for every inline script would break the site immediately. Doing this properly needs a dedicated pass auditing every inline script/style across all admin and storefront templates, which is a much larger, higher-risk undertaking than a bug-fix pass and risks violating the no-redesign/no-breakage constraint if done hastily. Not attempted.
- **W11-T5 (spot-checked, not exhaustively audited)**: "N+1s" — no dedicated profiling pass was run (would need a live database and realistic data volume to identify meaningfully, neither available in this sandbox). Spot checks during other waves' work didn't surface an obvious egregious N+1 loop beyond what's already documented (e.g. Wave 6's admin delivery dashboard querying policies/provinces separately, which is a fixed 2 extra queries, not a per-row N+1). Revisit with real traffic/query logs if a specific page's performance is reported as a problem.
- **Already done in earlier waves**: static-root scoping (Wave 6), rate limiting on the highest-risk unauthenticated endpoint (Wave 9's Najm chat limiter; other public endpoints remain unrated-limited but are simple reads, lower risk).

## Wave 12 — SQLite legacy removal

PARTIAL — only the safe, non-structural item applied. Commit `7a9cbca`.

- **W12-T1 (DONE)**: `repositories/index.js` silently defaulted to the `'sqlite'` adapter whenever `DATABASE_TYPE` was unset, with zero warning — a missing/misspelled env var would boot the app on stale, frozen SQLite data with no indication anything was wrong. Added a `console.error` when this fallback path is taken. Did not change the fallback behavior itself (kept for tests/tooling that intentionally rely on the sqlite default).
- **W12-T2 (investigated, deliberately NOT applied)**: gating `server.js`'s unconditional `initDatabase()` boot call behind `DATABASE_TYPE`. Verified via grep that no live production route/service calls `getDb()` outside the sqlite repository adapter branch, and that the session store already resolves its backend dynamically through `getRepositories().sessions` rather than raw SQLite — so this change would very likely be safe. Implemented and unit-verified with `node -c`, then **deliberately reverted** before committing: this touches the boot sequence itself, where a mistake fails the entire app on every request, and this sandbox has no way to actually start the server against the real PostgreSQL instance to verify it works end-to-end. The plan's own rule for this wave is "needs proven stability" — a static-analysis-only confidence level, however high, isn't the same as having actually run it. Left as a well-researched, ready-to-apply candidate for a session with live DB access.
- **Not attempted at all**: removing the `repositories/sqlite/` tree, removing the `better-sqlite3` dependency, deleting `db/zeyad.db` and its backups. These are strictly higher-risk than W12-T2 (deletion, not just a conditional) and gated on the same missing live-verification capability. `db/zeyad.db` should in any case be kept on disk as a rollback/archive artifact per the project's own database-safety rules regardless of when the code stops reading/writing it.

**Recommended order for whoever runs Wave 12 to completion with real DB access**: (1) start the server against the live PostgreSQL instance and confirm it boots and admin login works; (2) re-apply the `initDatabase()` gating from this wave's notes and confirm sessions/login still work; (3) run the full `backend/tests/` suite (after the Wave 13 rewrite of the stale sync-style tests) against a scratch database; (4) only then consider removing the `sqlite/` repo tree and `better-sqlite3` dependency, one commit at a time, with the app re-verified booting after each.

## Wave 13 — Final verification against a live PostgreSQL instance

DONE, commits `3b45f8c`, `3769aab`. This is the first wave in the whole session executed with **real database access** — a local PostgreSQL 18 instance on `127.0.0.1:5433` (database `zeyad_shadow`, user `zfb_shadow_user`, schema loaded from `backend/db/postgres-schema.sql`, 73 tables). Every earlier wave was verified by static analysis and mock-pool simulation only; the plan's own note at the end of Wave 7 named this wave as the place to finally prove that work. Running the server for real immediately surfaced two entirely new bug classes that no amount of `node --check` could have found.

### W13-T1 (DONE, new bug class, missed by every previous wave) — integer literals written positionally into `VALUES(...)`

**Root cause.** PostgreSQL applies no implicit `integer -> boolean` cast to a *literal* inside a query string. A bound `?` parameter is fine — node-postgres sends it as text and the server coerces it against the target column type — but a bare `1` sitting in `VALUES (?, ?, 1, ?)` is typed `integer` and the whole INSERT dies with `column "x" is of type boolean but expression is of type integer`.

Wave 1's `translateSqliteToPg()` in `postgres-base-repository.js` does handle boolean columns, but only in the **comparison** shape (`is_active = 1` -> `is_active = TRUE`, for all 13 BOOLEAN columns). It never inspected positional values, so this entire class of INSERT slipped through Waves 1–12 untouched.

**Evidence (proven, not asserted).** Reproduced directly against the live instance:

- negative control — `INSERT ... VALUES (..., 0, ...)` into `ai_order_drafts.is_confirmed` -> `ERROR: column "is_confirmed" is of type boolean but expression is of type integer`
- positive control — the same INSERT with `FALSE` clears type-checking (fails only on an unrelated NOT NULL, and the DETAIL line shows the boolean was accepted as `f`)
- bound-parameter control — the same INSERT with `$2 = '0'` also clears type-checking, confirming `?` placeholders were never the problem

**Sweep method.** Rather than grepping for `0`/`1` (which collides with ordinary integer columns like `quantity` and `used_count`), wrote a scanner that parses `postgres-schema.sql` into a `table -> {boolean columns}` map, then for each INSERT maps its column list onto its VALUES list *positionally* and flags only integer literals that actually land on a boolean column. Accounting across all 39 files under `backend/repositories/postgres/`: 85 real INSERT statements, of which 83 are `INSERT..VALUES` (all with matching column/value arity, so every one parsed correctly) and 2 are `INSERT..SELECT`/metadata forms reviewed by hand — `ai_tasks` (no boolean columns at all) and `cms_elements` (passes `is_visible` as a bound `?`, safe). The scanner reports exactly 4 sites against the pre-fix tree and **0** after the fix; re-run across `services/`, `routes/`, `middleware/`, `tools/` and `utils/` it reports 0 there too, so the class is closed backend-wide.

**Fixed** (literal replaced with `TRUE`/`FALSE` in the SQL text):

- `ai/najm-settings-repo.js` — `insertInstructions`, `is_active` `1` -> `TRUE`
- `ai/admin-ai-provider-repo.js` — `insertSystemInstruction`, `is_active` `1` -> `TRUE`
- `ai/najm-order-drafts-repo.js` — `createDraft`, `is_confirmed` `0` -> `FALSE`
- `coupon-repo.js` — `create()`, `is_active` `1` -> `TRUE`

**Impact.** `createDraft` failed on *every* call, which disabled Najm's "prepare an order draft" feature outright — the exact feature Wave 9 spent four tasks hardening. Coupon creation was likewise dead on PostgreSQL.

**Verified live**: `najmDrafts.createDraft()` now inserts and reads back with `is_confirmed === false`; `coupons.create()` returns a row with `is_active === true`; both AI instruction inserts land with `is_active === true`.

### W13-T2 (DONE, second new bug class) — async self-calls the sync->async migration left un-awaited

**Root cause.** The SQLite->PostgreSQL migration made every repository method `async`, but a number of *internal* self-calls kept their old synchronous shape. The call then evaluates to a Promise, which is always truthy, so the guard beneath it can never fire and every field read off it is `undefined`:

```js
const current = this.findById(id);   // Promise, never null
if (!current) return false;          // dead branch
...
data.title !== undefined ? data.title : current.title   // undefined -> written as NULL
```

A partial update therefore **wipes every field the caller did not supply** instead of preserving it, and the not-found path silently updates nothing rather than returning `false`. This is a data-corruption bug, not merely a correctness wart.

The first instance was found in `coupon-repo.update()` while chasing W13-T1 on the live database. Swept all 78 files under `backend/repositories/` for `this.<m>(...)` where `<m>` is declared `async` in the same file and the call site carries no `await`, `return`, or Promise combinator in front of it — 6 more, all genuine. Post-fix sweep: 0 remaining.

**Fixed:**

- `coupon-repo.js:161` — `update()`, missing `await` on `findById` (committed with W13-T1)
- `address-repo.js:127` — `update()`, missing `await` on `findById`
- `delivery-repo.js:107` — `updatePolicy()`, missing `await` on `findPolicyById`
- `delivery-repo.js:159` — `togglePolicy()`, missing `await` on `findPolicyById`
- `delivery-repo.js:207` — `toggleProvince()`, missing `await` on `findProvinceById`
- `cms-repo.js:145` — `saveDraftElement()`, missing `await` on `getElementDraft`
- `ai/admin-ai-conversations-repo.js:75` — fire-and-forget `this.touch()`

**Two of these were outright feature breakage, not just field loss:**

- `togglePolicy`/`toggleProvince` read `current.is_active` off a Promise, which is `undefined` -> falsy -> `newStatus` was **always** `1`. The admin toggles could turn a delivery policy or province *on* but never *off*.
- `saveDraftElement` always took the `existing` branch with `existing.id === undefined`, so `WHERE id = undefined` matched nothing: new CMS elements were never inserted and edits were never saved. Note this sits directly on top of the transaction fix Wave 8 applied to `cms-service.saveDraftElement` — the transaction was correct, but the write inside it did nothing.

**Verified live**: `togglePolicy` now sequences `0 -> 1 -> 0` and `toggleProvince` `0 -> 1` (pre-fix both were pinned at `1`); `saveDraftElement` inserts then updates in place leaving exactly one row (`hello` -> `world`); partial `coupons.update({discount_value:25})` leaves `notes`/`min_order`/`max_uses`/`scope` intact; partial `addresses.update({title})` leaves `city`/`street` intact.

### W13-T3 (DONE) — `BIGINT`/`int8` deserialized as a string, breaking every `COUNT(*)` comparison

Wave 1 registered `pg.types.setTypeParser(1700, parseFloat)` for `NUMERIC`. `BIGINT`/`int8` (OID 20) has the identical string-by-default behaviour, for the same precision-loss reason — and **every `COUNT(*)` result is int8**. So `count` came back as the string `"0"`, and `ensureDefaultAdmin()`'s strict `if (count === 0)` never matched: a fresh database could never bootstrap its first admin account.

Registered a parser for OID 20 in `config/pg-database.js`. Row counts in this store are nowhere near `Number.MAX_SAFE_INTEGER`, so parsing to a JS number is safe.

**Verified live**: `countAdminUsersTotal()` now returns `0` with `typeof === 'number'`, `count === 0` evaluates `true`, and `ensureDefaultAdmin()` runs through to create the admin row (`is_active` stored as `true`, confirming bound integer params coerce correctly).

### W13-T4 (DONE) — live server run

Started `backend/server.js` against the shadow instance (`.env` already points at `127.0.0.1:5433`, `NODE_ENV=development`). Server boots, `GET /` returns 200 and renders the storefront with real product data out of PostgreSQL, `GET /api/products` 200, `/admin` correctly 302s to login. No 5xx responses and **no boolean-type or type-coercion errors anywhere in the request log** — which is the first time the app has been observed serving real traffic on PostgreSQL in this session. Browser console: no errors.

This also satisfies step (1) of Wave 12's "recommended order for whoever runs Wave 12 to completion with real DB access" — the app is now proven to boot and serve against live PostgreSQL, so W12-T2's deferred `initDatabase()` gating is unblocked for a follow-up session.

### W13-T5 (findings, deliberately NOT fixed — need an operator decision)

- **A fresh PostgreSQL database still cannot bootstrap its first admin.** With W13-T3 fixed, `ensureDefaultAdmin()` now correctly *runs*, but then fails on `fk_admin_users_role_id_1`: it hardcodes `role_id: 1`, and nothing ever seeds the `roles` table on PostgreSQL. `postgres-schema.sql` contains **zero** INSERT statements (pure DDL), and `db/seed.sql` — which seeds categories/branches/settings but *no* roles — is only ever loaded by `config/database.js`, the SQLite path. Fixing this means either seeding `roles` for PostgreSQL or changing how the bootstrap admin gets its role, and `rbac.js` maps permissions by **role name** (`'Super Admin'` -> `['*']`), so the seeded name decides what the first admin can do. That is an authorization-semantics decision, not a bug fix, so it is flagged rather than guessed at. (Worked around in the shadow DB only, by seeding `roles(1,'Super Admin')`, to unblock verification.)
- **`backend/tests/test-http-routes.js` case 6 fails (403), and it is a stale test fixture, not a regression.** The test's mock session sets `role`/`permissions`, but `middleware/rbac.js` reads `req.session.admin.role_name` — so `rolePermissions[undefined]` is `[]` and the check 403s. Confirmed the *real* `loginAdmin()` does set `role_name`, matching rbac, so production authorization is consistent and only the fixture is wrong. The other 8 cases in that file pass. Left alone because rewriting the stale sync-style tests is its own named task.
- **`npm test` in `backend/package.json` points at `tests/run-tests.js`, which does not exist.** The individual `tests/test-*.js` files are runnable directly.
- **`GET /404.html` logs `ENOENT`** on unmatched routes — cosmetic, pre-existing, unrelated to this wave.

### Wave 13 verification summary

A 10-check harness driving the **real repository bundle from the real factory** (not hand-written SQL) against the live instance: **10/10 passing**. Covers all four boolean-literal INSERTs, all the un-awaited-self-call fixes that have reachable data, and the BIGINT parser. The scanners for both new bug classes report 0 remaining occurrences across the whole backend.

**What this wave changes about confidence in Waves 1–12**: their fixes are now exercised against a real PostgreSQL server rather than a mock pool, and the app demonstrably serves traffic. But note the lesson — two whole bug classes survived twelve waves of static analysis and were found within minutes of running the thing for real. Any remaining "verified by inspection" claim in this document should be treated as provisional until exercised the same way.

## Phases A–M — full PostgreSQL cutover with the real dataset

Executed against a live PostgreSQL 18 instance (`127.0.0.1:5433`, `zeyad_shadow`) carrying the **full migrated dataset** (73 tables, 7180 rows, 400 products, 33 orders). Commits `00122ea`, `6dd3cd2`, `7f24f37`, `e57ce7c`, `10e9de9`, `8fb9bc1`, `7169b68`, `9a4bfc1`.

The single most important thing this pass established: everything before it was verified against an *empty* schema. The moment real data and real HTTP traffic were involved, a further class of defect appeared that no static analysis and no empty-database run could have surfaced.

### Phase C — a fresh PostgreSQL database could not produce a working admin panel

`postgres-schema.sql` contains **zero** INSERT statements, and `db/seed.sql` is read only by `config/database.js`, the SQLite path. So on PostgreSQL two reference tables were permanently empty:

- **`roles`** — `ensureDefaultAdmin()` hardcodes `role_id: 1` against a foreign key onto `roles(id)`, so the first admin could never be created at all.
- **`ai_permissions`** — read at runtime by `hasAiPermission()`, and `routes/admin/ai-employee.js` runs AI tools while building its page, so `/admin/ai-employee` rendered a hard error page (*ليست لديك صلاحية تشغيل هذه الأداة*) for a Super Admin.

Added `backend/db/postgres-seed.sql`, transcribed verbatim from the legacy SQLite database (5 roles, 33 role_permissions, 14 ai_permissions), loaded by a new `seedPgReferenceData()`. Nothing invented: the five role names are exactly the keys of `rolePermissions` in `middleware/rbac.js`, which is what actually gates admin routes. Idempotent, so it converges an existing database without overwriting operator changes.

Worth recording: `initPgDatabase()` existed but **nothing ever called it**, which is why the PostgreSQL path had no seeding step to begin with.

**Verified**: emptied `roles`, `role_permissions` and `admin_users`, booted, and watched 5/33/14 rows seed and the default admin get created.

### Phase D — boot ordering, and a session store that was only misnamed

Database setup was two unordered side effects: a synchronous `initDatabase()` at module scope, and a **fire-and-forget `ensureDefaultAdmin()` executed at require time** inside `routes/admin/index.js`. Neither was awaited, so the admin bootstrap raced the seed it depends on. Replaced with an awaited `bootstrapDatabase()` that seeds, then creates the admin, in that order — completing Wave 12's W12-T2, which had been deferred purely because the previous session could not start the server against a real database.

`services/sqlite-session-store.js` → `services/session-store.js`. The store resolves whichever session repository the factory is configured for and is fully async; the "Sqlite" in its name described a coupling it never had, and kept implying SQLite was load-bearing for sessions when it is not.

### Phase A — the async sweep, extended to member calls

The earlier waves' scanner deliberately skipped `repos.x.y()` member calls. That is exactly where the remaining bugs were:

- **`get_store_information` / `get_store_policies`** — `repos.settings.findByKeys()` and `repos.branches.findAll()` both un-awaited, so `settings.map()` and `branches.map()` ran against a Promise and threw `TypeError` on *every* call. Najm could never answer a question about the store's phone, address, payment methods or branches. It only looked like it worked because Wave 9's per-tool error isolation swallowed the throw and returned the hardcoded fallbacks.
- **`createProvider()`** — `settings = getProviderSettings(true)` assigned a Promise, so `settings.provider` was `undefined` and the switch fell through to `BedrockProvider` holding a Promise as its configuration, silently, regardless of the configured provider. Wave 9 recorded this Bedrock fallthrough as unreachable; it was reachable through exactly here, via `testProvider()` — the admin panel's "test connection" button.
- **`syncFrontend()`** — rewrites `products_db.js` (~800KB) in full and was called fire-and-forget from 14 admin write paths. Two saves close together produced overlapping runs, each with its own snapshot, and the slower one silently republished older data over newer. Added a serialization guard and awaited all 14 sites.

### Phase B — PostgreSQL type semantics (a real SQLite leak)

SQLite is dynamically typed, so `WHERE id = ? OR request_id = ?` happily compared `'REQ-2026-171613'` against the integer `id` column. PostgreSQL resolves the parameter against the column type *before* the OR can short-circuit:

```
invalid input syntax for type bigint: "REQ-2026-171613"
```

Every "look this up by numeric id **or** by business key" query was therefore dead whenever the business key was used — product lookup by `ZFB-...`, order lookup by `order_id`, category/department filtering by slug or Arabic name, support-ticket lookup by `REQ-...`. Scanned all PostgreSQL repositories against real column types from `information_schema`: 22 candidates, **13 genuinely unsafe**, fixed with `CAST(col AS TEXT)` (the idiom the codebase already used elsewhere). The 9 remaining reports are verified safe.

### Phase E — Najm

Beyond the store-info and provider fixes above:

- **`get_customer_request` had no ownership check**, while `request_id` was `REQ-<year>-<4 digits from Math.random()>` — 9000 values, trivially enumerable. Anyone chatting to Najm could walk the space and read every customer's name, request text and admin notes. Added a mandatory phone check matching the pattern Wave 9 established for `track_order`, enforced **in the handler** (the tool schema is only a hint to the model and is never the security boundary).
- The same tool did not await `getCustomerRequest()`, so `req` was a Promise: always truthy, the not-found guard never fired, and Najm reported a ticket with every field `undefined` for any id at all.
- `generateRequestId()` now draws 6 digits from `crypto`. `request_id` carries a UNIQUE index, so by the birthday bound the old generator made a hard insert failure on a customer's support ticket more likely than not at ~112 tickets per year.
- `customer-request-repo.js` hardcoded `REQ-2026-`; every request created from 2027 onward would still have been stamped 2026.

### Phase F — the admin form was discarding stock quantity

Found by asserting on the database after a real admin product create: the form posted `stock_quantity=7`, the row came back `10`. Neither the create nor the edit path ever read the field, so the repository's `: 10` fallback applied to every product in the store.

Survivable while stock was decorative. Not survivable since Wave 3/9 added `decrementStockLocked()` to checkout and to Najm-driven order creation — the number being locked and decremented was one nobody had ever set. Overselling and false out-of-stock both follow, and no admin action could correct either.

### Phase B/H/L — SQLite is gone from the PostgreSQL runtime

A probe over the real server module graph showed, with `DATABASE_TYPE=postgres`, the `better-sqlite3` native driver loaded plus `config/database.js` and **all 36** `repositories/sqlite/*` modules resident in `require.cache`. SQLite was not a dormant fallback; it was loaded on every boot. Three causes, all removed: `repositories/index.js` required the whole SQLite tree at module scope (now behind `loadSqliteModules()`), `server.js` required `initDatabase()` at the top of the file (now inside the guarded branch), and four live files imported `getDb()` and never called it.

**Proof**: driver never required, `config/database.js` not in cache, 0 SQLite repository modules loaded, and `db/zeyad.db-wal`'s mtime is byte-identical across live read *and* write requests.

Classified all 111 files that touch SQLite — 39 required for rollback, 51 test-only, 15 migration/archive, 6 dead (2 removed), and **0 active production dependencies**. `db/zeyad.db`, its WAL/SHM, the three phase backups, all 42 files under `db/backups/`, and `better-sqlite3` in `package.json` are all untouched: the rollback path and the migration tooling still need them.

### Phase I — `npm test` is real now

`package.json`'s test script had always pointed at `tests/run-tests.js`, which **did not exist**. Added the runner with an explicit suite (the `tests/` directory holds ~40 one-off scripts from successive phases; the historical ones are listed under QUARANTINE with a reason each) plus `tests/pg-integration.js`: 24 checks against a live database, one per bug this effort actually found.

Fixed two real defects in `test-http-routes.js` rather than working around them: its mock session set `role`/`permissions` while `rbac.js` reads `role_name` (a stale fixture, not a product bug — the real `loginAdmin()` does set `role_name`), and it never released the pool, so the process hung forever after printing its results.

### Phase J/K — runtime validation and security

Fixed a genuine path-disclosure leak found by driving real HTTP: the repo has no `404.html`, so the 404 handler's `sendFile()` rejected with an ENOENT whose message carries the absolute server path, and `middleware/error.js` only sanitized *database* errors — Node filesystem errors fell through to the "intentional Arabic business message" branch and were returned verbatim, in production too. Added `isRawSystemError()` and a safe 404 fallback.

`npm audit`: 2 high-severity advisories (undici via cheerio, brace-expansion via ejs→jake), both transitive and off the request path, both fixed by semver-compatible updates. Re-audited to 0, re-ran everything with no regressions.

Static security sweep: **0** SQL injections (no request data is interpolated into SQL anywhere), 0 unguarded admin routers (`router.use(requireAuth)` at `admin/index.js:79` covers every mount below it — confirmed live: unauthenticated `/admin/dashboard` 302s to login), 0 committed secrets, 0 unguarded path joins.

### Phase G — database integrity: 20/20

73 tables all present, 49 foreign keys all validated, **0 orphaned rows across every FK relationship**, 0 sequence drift across 67 sequences, 0 duplicate ids, 0 naive timestamps, 0 negative money or quantities, every order has line items. Orders 33 / total 138881, order_items 55 / 138537, payments 16 / 128551.

### Final audit

| Suite | Result |
|---|---|
| `npm test` (2 suites, 33 checks) | 33/33 |
| Phase F admin functionality | 19/19 |
| Phase G database integrity | 20/20 |
| Phase J runtime validation | 18/19 |
| `verify-pg-migration.js` | 83/83 at migration time |
| `npm audit` | 0 vulnerabilities |
| 5xx responses in the server log | 0 |

The one open Phase J item is the harness asserting no stack trace in development, where returning one is deliberate; production mode was separately confirmed to return neither a stack nor a path.

`verify-pg-migration.js` re-run *after* all this testing reports 14 count differences — every one in a table the tests write to (`admin_users`, `ai_*`, `audit_logs`, `carts`, `cart_items`, `guest_sessions`, `sessions`, `customer_requests`, `notifications`). Products, orders, order_items, payments, settings, categories and coupons remain identical. That is test drift, not migration drift, and is recorded here rather than dressed up as parity.

### Still open

- **The application is pointed at `zeyad_shadow`, not a production database.** `.env` has `DATABASE_TYPE=postgres`, `PG_DATABASE=zeyad_shadow`, `NODE_ENV=development`. Promoting this to production is an operator decision, not a code change.
- **CSP and CORS remain as Wave 11 left them** (`contentSecurityPolicy: false`, unrestricted `cors()`), still blocked on the same missing input: the real production domain, and a full inline-script audit.
- `stock_status` values are inconsistent across the codebase (`in_stock`, `in-stock`, `out-of-stock`, `low_stock`, `limited_stock`). Nothing observed to break because of it, but it is a real latent trap.
- The ~40 quarantined/unclassified legacy test scripts have not been rewritten; they are excluded from `npm test` with a stated reason each.

## Later waves

Detailed specs for Waves 6-13 will be appended here immediately before each wave starts, following the same root-cause-first process documented in `MASTER-IMPLEMENTATION-PLAN.md`. Reference the relevant audit doc (`BACKEND-AUDIT.md`, `ADMIN-AUDIT.md`, `MEDIA-AUDIT.md`, `NAJM-AUDIT.md`, `SQLITE-LEGACY-AUDIT.md`) for the current known findings feeding each wave — do not re-derive them from scratch.
