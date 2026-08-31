# SQLite Legacy Audit

## Current runtime dependency on SQLite (must be eliminated)

- `server.js:48` calls `initDatabase()` unconditionally on every boot regardless of `DATABASE_TYPE` — SQLite (`backend/db/zeyad.db` + WAL) is opened and written to every time the app starts, even when PostgreSQL is the configured backend.
- `backend/utils/order-number.js:6,13-20` queries the **frozen SQLite** `orders` table live, during PostgreSQL order creation — see `CRITICAL-FINDINGS.md` #1. This is the most severe legacy dependency: it actively breaks production checkout.
- `repositories/index.js:118,131` — the repository adapter falls back to `'sqlite'` (`|| 'sqlite'`) on a missing/unrecognised `DATABASE_TYPE`, and has a catch-all `else` branch, so a config typo silently boots the app on the old, frozen SQLite database with no warning at all.
- `config/database.js` has no `DATABASE_TYPE` awareness at all — it doesn't know PostgreSQL exists as an alternative, which is how `server.js:48` gets called unconditionally.

## Not legacy-dependent (verified correct)

- `sqlite-session-store.js` — despite the misleading class name, it resolves `getRepositories().sessions` lazily and awaits correctly; it works against whichever backend is actually configured. No change needed beyond a possible rename for clarity (cosmetic, low priority).

## Removal plan (Wave 12 — must run last, after Waves 1-3 prove PostgreSQL exclusively serves traffic)

1. Replace `order-number.js`'s SQLite-backed sequence with a native PostgreSQL sequence (this is actually required earlier, in Wave 3, as part of fixing checkout — by the time Wave 12 runs, this dependency should already be gone).
2. Make the repository adapter fail loudly (throw at boot) on an unknown/misconfigured `DATABASE_TYPE` instead of silently falling back to `'sqlite'`.
3. Remove the unconditional `initDatabase()` call from `server.js`; gate SQLite initialization behind `DATABASE_TYPE === 'sqlite'` only, or remove entirely once PostgreSQL is proven stable.
4. Remove dead `getDb`/SQLite imports across the codebase.
5. Remove the `backend/repositories/sqlite/` tree and the `better-sqlite3` dependency once nothing references them.
6. Keep `backend/db/zeyad.db` and its backups on disk as a rollback/archive artifact — do not delete the file itself as part of this wave. It is explicitly a fallback until the plan proves removal is safe; it must simply stop being read/written at runtime.

## Guardrail

Per project rules: SQLite must never be reintroduced as a production data source. It exists only as a rollback/archive artifact until the plan proves its removal is safe (end of Wave 12, verified in Wave 13's full regression pass).
