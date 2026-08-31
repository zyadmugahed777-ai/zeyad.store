# ZeyadStore — Critical Findings

Source: Engineering audit of the PostgreSQL migration (uncommitted tree as of the Wave 0 checkpoint commit `44ddb39`). Ordered by blast radius. All verified against code; top items re-verified first-hand by the planning session.

## The central architectural finding

The migration did not rewrite queries for PostgreSQL. `backend/repositories/postgres/postgres-base-repository.js` is a **regex-based SQLite→PostgreSQL translation shim** emulating the `better-sqlite3` API (`.prepare(sql).get()/.all()/.run()`, `?` placeholders, `lastInsertRowid`) on top of `pg`. Every "PostgreSQL repository" is still SQLite-dialect code depending on that shim translating correctly at runtime.

Two consequences produce most of the reported instability:

1. **Sync→async contract break.** better-sqlite3 is synchronous; `pg` is not. Postgres repo files still carry copy-pasted `@returns {import('better-sqlite3').RunResult}` docblocks and "Methods are synchronous" headers. Callers were written against the sync contract, so ~60 sites treat a Promise as a value. A Promise is always truthy, so null-guards die silently rather than crashing loudly.
2. **Boolean/type semantics drift.** The shim rewrites literal SQL (`is_active = 1` → `TRUE`) but cannot touch JavaScript. PostgreSQL returns `true`/`false` and `NUMERIC` as strings; SQLite returned `1`/`0` and numbers. Every `=== 1` comparison in JS is now permanently false.

The shim's boolean rewrite covers only 6 columns (`is_active`, `is_archived`, `is_default`, `is_primary`, `is_featured`, `is_visible`); the schema has 13 booleans. `is_featured` doesn't even exist (it's `is_best_seller`) — a dead rule masking a live gap.

## Commerce-fatal

1. **Checkout dies permanently after one order.** `backend/utils/order-number.js:6,13-20` generates order numbers by querying the frozen SQLite `orders` table via `getDb()`, while the order is written to PostgreSQL. Called live at `routes/api/orders.js:235`. SQLite never grows → `nextNum` is constant → collides with `CREATE UNIQUE INDEX uq_orders_order_id`. First order succeeds; every subsequent one 400s.
2. **Every transaction in the codebase is a no-op.** (a) `routes/api/orders.js:182-309` opens a client and issues `BEGIN`, but all writes use pool-bound `repos.*`, not the `db` client — autocommit on separate connections. (b) `postgres-base-repository.js:153-167` binds `this` to a transaction repo, but every caller passes an arrow function, which lexically captures the outer `this` and keeps using the pool (`product-repo.js:606,624,662`). `ROLLBACK` rolls back nothing.
3. **Unlimited overselling.** No stock decrement anywhere in order creation, and no `SELECT ... FOR UPDATE` anywhere in the repositories.
4. **Unlimited coupon redemption.** `services/coupon-service.js:216-225` — `incrementUsage` un-awaited; truthy Promise makes the max-uses guard dead.
5. **Exchange rate frozen at the hardcoded default.** `services/settings-service.js:47-50` — `if (rowsOrPromise instanceof Promise) return defaultValue;` is always true under PostgreSQL. `currency-service.js:30` → `exchange_rate` permanently 140; `:160,170` → `express_delivery_fee` permanently 500.
6. **Cart shows everything out of stock.** `services/cart-service.js:104-105` — `item.is_active === 1` against a PG boolean.
7. **Deactivated products stay purchasable.** `routes/api/products.js:113`, `currency-service.js:98` — `is_active === 0` guard never fires.
8. **`GET /api/categories` throws.** `routes/api/categories.js:15,43` — `.map()` on a Promise.
9. **Customer login writes `{id: undefined}` sessions.** `routes/api/auth.js:24-48,92,130` — the "create new customer" branch never runs.

## Admin panel

10. **Entire product-form script is a JS syntax error.** `views/admin/products/form.ejs:501` opens `DOMContentLoaded` and never closes it; line 888 closes an inner listener instead. Browser throws `SyntaxError` and discards the whole `<script>`. Root cause of the multi-image/primary-image UI bugs. Secondary defect: listener at `:736` is nested inside `:501`'s handler — needs hoisting too.
11. **Video upload limit is 10 MB, not 50 MB.** `middleware/upload.js:120` reads `MAX_FILE_SIZE`; `.env:7` sets `10485760`. Rejection path writes a redirect mid-stream → `ECONNRESET` → looks like a crash.
12. **`UPLOAD_DIR` is relative.** `.env:6` = `./uploads`, resolved against `process.cwd()`, while cleanup paths hardcode `backend/uploads`. Two divergent upload trees.
13. **Static mount publishes the backend.** `server.js:38` serves the repo root, exposing `backend/db/zeyad.db` and SQL backups. Shadows the `/uploads` mount at `:41`.
14. **All counts return `undefined`.** `await x.get(...).count` parses as `await (x.get(...).count)`. 11 sites; breaks pagination and `ensureDefaultAdmin`.
15. **RBAC has no write-level checks.** `routes/admin/index.js:83` gates only `:view` at mount time. `/coupons`, `/delivery`, `/requests`, `/customer-reports`, `/frame-products` have no `checkPermission` at all. CSRF bypassed for multipart POSTs. `routes/admin/media.js:66-68` path-traversal on unsanitised `folder`.

## Najm / AI

16. **Account-takeover-grade identity flaw.** `routes/api/customer-ai.js:20` accepts `req.body.userId` as identity fallback with no `requireAuth`.
17. **Order-tracking IDOR.** `customer-tools.js:729-736` applies the phone check only `if (phone)`; two callers omit it. Sequential order IDs → enumerable.
18. **Order drafts: TTL/ownership/idempotency written but unenforced.** `najm-order-drafts-repo.js:45-47` selects on `draft_token` alone. `confirm_order` reuses frozen draft prices with no re-price, no row lock; `createCustomerOrder` resolves customer by phone.
19. **Every Admin-AI permission gate is a no-op.** `services/ai/tools.js` — 14 sites do `if (!hasAiPermission(k))` where the function is async. **Ordering constraint: fix gates before fixing the un-awaited downstream writes**, or a live unauthenticated write path opens.
20. **Retrieval layer fabricates store facts.** `hybrid-search.js:337-341` injects fallback rating/reviews/warranty/delivery-time into grounding data presented to the model as fact. `:257-274` — failed category filter silently returns top-100 best-sellers as hits.

## Also confirmed

- No rate limiting anywhere; `/api/ai/customer-chat` unauthenticated.
- `NODE_ENV=development` in deployed `.env` → stack traces leak, cookies non-secure.
- No `unhandledRejection` handler while ~40 fire-and-forget writes are in flight — plausible cause of "admin panel crashes" on Node ≥15.
- `NUMERIC` returned as strings (no `pg.types.setTypeParser`); 42 columns affected including all order money.
- Adapter can silently fall back to SQLite: `repositories/index.js:118,131` — `|| 'sqlite'` with catch-all `else`.
- SQLite still opened/written every boot (`server.js:48` → `initDatabase()` unconditional).
- Gemini adapter puts API key in URL query string (`providers.js:304`).
- `createProvider` falls through to Bedrock for unrecognised provider strings; Bedrock/Gemini adapters return no tool calls.
- Broken/orphan admin features: product "duplicate" posts to nonexistent route; non-AJAX media upload persists nothing; AJAX set-primary/delete-image endpoints have no caller; `verify-consistency` has no UI.

## Corrected non-findings (don't chase these)

- Referential integrity is intact — 49 FKs via `ALTER TABLE` at `db/postgres-schema.sql:1439-1487`.
- Media plumbing already exists: `form.ejs:155` has `multiple`; `routes/admin/products.js:111-114` uses `.fields([images ×30, images[], video_file])`; `:212` writes `is_primary`; `product_images` has `is_primary BOOLEAN` + `sort_order`. Bugs are integration/semantics defects, not missing features.
- `sqlite-session-store.js` is correctly dynamic/async; only the class name is misleading.
- No exploitable SQL injection — dynamic `ORDER BY`/`IN` use allow-lists and bound placeholders.
- Price manipulation via Najm not possible — no tool accepts a price argument.
- sharp not applied to video; multer uses disk storage; `express.json` limits don't apply to multipart — all ruled out as video-crash causes.
