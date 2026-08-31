# Backend Audit

Scope: `backend/repositories`, `backend/services`, `backend/routes/api`, `backend/utils`.

## Data layer

- `backend/repositories/postgres/postgres-base-repository.js` is a regex SQLite→PostgreSQL translation shim emulating `better-sqlite3`'s sync API (`.prepare().get()/.all()/.run()`, `?` placeholders, `lastInsertRowid`) on top of async `pg`.
- Boolean rewrite covers only 6 of 13 boolean columns; includes a dead rule for a nonexistent `is_featured` column (real column is `is_best_seller`).
- No `pg.types.setTypeParser` registered — `NUMERIC`/`DECIMAL` (42 columns, including all order money) come back as strings.
- `repositories/index.js:118,131` — adapter selection silently falls back to `'sqlite'` on an unrecognised/missing `DATABASE_TYPE` via `|| 'sqlite'` and a catch-all `else`.

## Async contract violations (~60 sites)

Repositories return Promises; many call sites were written against the synchronous better-sqlite3 contract and never added `await`. Because a Promise is truthy, null/falsy guards downstream silently pass instead of throwing. Confirmed instances: `settings-service.js:47-50`, `coupon-service.js:216-225`, `cart-service.js:104-105`, `products.js:113`, `categories.js:15,43`, 11 `await x.get(...).count` precedence bugs, `services/ai/tools.js` (14 permission-gate sites).

## Transactions

Two independent, both-broken mechanisms:
1. `routes/api/orders.js:182-309` issues `BEGIN` on a checked-out client but all repo writes go through the pool — different connections, so `BEGIN`/`ROLLBACK` affect nothing.
2. `postgres-base-repository.js:153-167`'s transaction helper binds `this`, but callers pass arrow functions (lexical `this`), so writes still hit the pool instead of the transaction client. Confirmed at `product-repo.js:606,624,662`.

## Financial integrity

- `order-number.js` reads the frozen SQLite `orders` table for the next sequence number while orders are written to PostgreSQL — collides with the DB's unique index after the first order ever placed against Postgres.
- No stock decrement, no `SELECT ... FOR UPDATE` anywhere — unlimited overselling possible.
- Coupon usage increment un-awaited — max-uses cap unenforced.
- Settings service silently returns hardcoded defaults instead of DB values under PostgreSQL — exchange rate and delivery fee are frozen regardless of admin changes.

## Auth

- `routes/api/auth.js:24-48,92,130` — new-customer branch is unreachable; sessions can be created with `{id: undefined}`.
- `ensureDefaultAdmin` (`middleware/auth.js:89-91`) compares `undefined === 0` due to the count-precedence bug, so it may never bootstrap a fresh DB.

## Operational

- No `process.on('unhandledRejection')` handler while ~40 fire-and-forget writes are in flight; on Node ≥15 an unhandled rejection terminates the process.
- `NODE_ENV=development` in the deployed `.env` — full stack traces returned to clients, session cookies non-`secure`.
- SQLite (`initDatabase()`) still opened/written unconditionally on every boot regardless of `DATABASE_TYPE`.

See `CRITICAL-FINDINGS.md` items 1-9 for the commerce-fatal subset and exact remediation ordering in `MASTER-IMPLEMENTATION-PLAN.md` Waves 1-4.
