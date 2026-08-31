# زياد ستور — Zeyad Store

Arabic-first e-commerce storefront and admin panel: furniture, home appliances,
kitchens, majalis and solar systems, with delivery across Yemen.

- **Storefront** — static HTML pages, rendered from the database on each request
  by the Express layer (categories, product grids, offers, banners).
- **Admin** — Express + EJS at `/admin`.
- **Database** — PostgreSQL. There is no SQLite path and no fallback.

---

## Running it

```bash
cd backend
npm ci --omit=dev
cp .env.example .env      # then fill it in — see the comments in that file
node server.js
```

The site is then on `http://localhost:3000` and the admin on `/admin`.

`.env.example` documents every variable the application reads and marks which
are required in production. `NODE_ENV=production` makes the server refuse to
start if `SESSION_SECRET` or any `PG_*` setting is missing, rather than booting
with an insecure default.

---

## Deploying an update to a live server

The full procedure, including backups and rollback, is in
[`docs/DEPLOY-RUNBOOK.md`](docs/DEPLOY-RUNBOOK.md). The short version:

```bash
git pull
cd backend && npm ci --omit=dev
node scripts/migrate.js --dry-run     # review; then run without --dry-run
```

Then restart the process.

### What a deploy never touches

A code update must not disturb what the shop has accumulated. Three things keep
that true, and all three matter:

| Not in git | Why |
|---|---|
| `backend/.env` | Real credentials. Lives only on the server. |
| `uploads/` | Product, category and banner images the operator uploaded. If git tracked this, a `git pull` could delete images customers are being shown. |
| The database | Nothing in a deploy writes to it. Migrations are a separate, explicit step. |

Schema changes are **never** applied on startup. `scripts/migrate.js` runs them
in order, each in its own transaction, records what it applied in
`schema_migrations`, refuses a migration file that was edited after it was
applied, and refuses destructive statements (`DROP`, `TRUNCATE`, unqualified
`DELETE`) unless the file explicitly opts in.

So: pulling new code and restarting changes the code and nothing else. Products,
customers, orders, categories, offers and uploaded images survive untouched.

---

## Layout

```
*.html                     storefront pages
assets/                    css, js, images
  css/storefront-2026.css  the current design layer — loaded last
  js/core/                 theme, currency, auth, global UX, storefront layer
backend/
  server.js                entry point
  routes/api/              public API
  routes/admin/            admin panel
  services/                business logic
  repositories/postgres/   data access
  migrations/              versioned schema changes
  scripts/migrate.js       the migration runner
  views/admin/             EJS templates
docs/                      runbook and design notes
scripts/                   build helpers
```

After editing anything under `assets/` or the root `*.js`, run:

```bash
node scripts/inject-storefront-2026.js
```

It re-stamps each asset URL with a hash of that file's contents, so returning
visitors get the new file and nothing else is re-downloaded. It is idempotent.

---

## Tests

```bash
cd backend && node tests/run-tests.js
```

Requires a reachable PostgreSQL and, for the HTTP suites, the server running.
`tests/run-tests.js` declares which scripts are part of the supported suite and
lists the legacy ones it excludes, with the reason for each.
