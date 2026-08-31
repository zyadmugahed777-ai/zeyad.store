# Deployment Runbook

For updating a **live** ZeyadStore that already holds real products, customers
and orders. The whole point of this procedure is that application code is
deployed independently of production data, and no step ever destroys data.

---

## The rule

> Application versions change. Production data does not, unless a business
> action changes it.

Deployment never drops, truncates, reinitialises or reseeds anything.
`db/postgres-schema.sql` is `CREATE TABLE IF NOT EXISTS` throughout and
`initPgDatabase()` is **not** called at boot — deploying does not touch the
schema at all. Schema changes happen only when you deliberately run migrations.

---

## Order of operations

```
back up  →  dry-run migrations  →  apply migrations  →  deploy code  →  verify
```

Migrations run **before** the new code, and every migration is written so the
**old** code still works against the new schema (add columns, never remove;
nullable or defaulted). That ordering is what makes a rollback possible: if the
new code misbehaves you put the old code back, and it still runs.

---

## 1. Back up

```bash
pg_dump -h 127.0.0.1 -p 5433 -U zfb_shadow_user -d zeyad_shadow -Fc -f backup-$(date +%Y%m%d-%H%M).dump
```

Use the real host/port/user/database in production. Keep the dump off the same
machine. Verify it is non-empty before continuing — an unverified backup is not
a backup.

Uploaded files live outside the database and are not in that dump. Back up the
`uploads/` directory too:

```bash
tar -czf uploads-$(date +%Y%m%d-%H%M).tar.gz uploads/
```

## 2. See what would change

```bash
node backend/scripts/migrate.js --status
```

```bash
node backend/scripts/migrate.js --dry-run
```

`--dry-run` prints the exact files it would apply, in order, and touches
nothing. If it prints `Nothing to do`, skip to step 4.

## 3. Apply the migrations

```bash
node backend/scripts/migrate.js
```

What the runner guarantees:

- Files in `backend/migrations/*.sql` run in filename order.
- **Each file runs in its own transaction.** A failure rolls that file back
  completely and stops the run — a half-applied migration is not a state this
  can produce.
- Applied files are recorded in `schema_migrations` with a checksum, so
  re-running is safe and does nothing.
- **A file edited after it was applied is refused**, loudly. Never edit an
  applied migration; add a new one.
- **Destructive statements are refused** — `DROP TABLE`, `DROP COLUMN`,
  `TRUNCATE`, `DELETE` without a `WHERE`. A migration that genuinely needs one
  must opt in with the line `-- zfb:allow-destructive`, which is your signal
  that a verified backup is mandatory.

`.down.sql` files are never applied automatically. They exist so a human can
roll a change back deliberately.

## 4. Deploy the application code

```bash
git pull
npm ci --omit=dev --prefix backend
node scripts/inject-storefront-2026.js
```

`inject-storefront-2026.js` re-stamps the storefront asset URLs with a hash of
their contents. Run it whenever `assets/css/storefront-2026.css`,
`assets/js/core/storefront-2026.js`, `product-engine.js`, `zfb-core.js`,
`site.js`, `theme.js`, `premium-cards.js` or `currency.js` change — otherwise
returning visitors keep serving the old file from cache. It is idempotent.

Then restart the process (systemd, pm2, whatever runs it).

## 5. Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://zeyad.store/api/health
```

```bash
node backend/tests/run-tests.js
```

Then check by hand, on a phone:

- a department page lists products, and the category rail filters them
- a product page shows its photograph, sizes and colours
- adding to the cart and reaching checkout still works
- an uploaded product image loads (confirms `/uploads` is served correctly)

## 6. If it goes wrong

**The code is bad, the schema is fine** — the normal case. Redeploy the previous
commit and restart. The migrations already applied are backward compatible, so
the old code runs against the new schema unchanged. No data is touched.

**A migration failed** — it was rolled back in full and nothing after it ran.
Fix the file, or write a new one, and run `--dry-run` again.

**A migration succeeded but was wrong** — restore from the step-1 dump into a
scratch database first and confirm the restore is good before touching
production. Roll forward with a new corrective migration in preference to
running a `.down.sql` against live data.

---

## Environment notes

`backend/.env` carries `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`,
`PG_PASSWORD`, `DATABASE_TYPE=postgres` and `UPLOAD_DIR`. It is not in version
control and must never be. Changing any of them on production is a deliberate,
human decision — nothing in this runbook edits them.

### A password in `.env` is not authentication

`PG_PASSWORD` is only ever checked if PostgreSQL is configured to ask for it.
The development cluster ships with `pg_hba.conf` set to `trust`, which accepts
every local connection **without looking at the password at all** — so setting
`PG_PASSWORD` there changes nothing, and an empty one is not the hole it looks
like (that cluster also binds `listen_addresses = '127.0.0.1'`, so nothing off
the machine can reach it).

Production is where this matters, and it takes two changes, not one:

1. give the role a real password — `ALTER ROLE <user> WITH PASSWORD '<value>';`
2. make the server demand it — `scram-sha-256` (never `trust`, never `md5`)
   for that user/database in `pg_hba.conf`, then reload:
   `pg_ctl reload -D <data-dir>`

Confirm it is actually enforced before believing it:

```bash
PGPASSWORD=wrong psql -h <host> -p <port> -U <user> -d <db> -c 'select 1'
```

That command **must fail**. If it succeeds, the database is still on `trust`
and `PG_PASSWORD` is decorative regardless of what `.env` says.

Only then does `.env` matter: the app refuses to boot under
`NODE_ENV=production` with `PG_PASSWORD` unset, and also refuses if any
`PG_SHADOW_*` override is present, since those take precedence over `PG_*` and
would silently point the deployment at the wrong database.

`UPLOAD_DIR` is resolved against the repository root by both the writer
(`middleware/upload.js`) and the `/uploads` static mount in `server.js`. Those
two used to resolve it differently; keep them in step if either is edited.

## Development data must not reach production

`db/postgres-seed.sql` contains only reference rows a database cannot function
without (the RBAC role catalogue) and is idempotent
(`ON CONFLICT DO NOTHING`). Demo products, demo categories and test orders are
**not** seeded anywhere and must never be added to it.
