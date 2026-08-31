# Storefront 2026 — Audit & Implementation Plan

Scope: product card, product page, category presentation, page composition,
image handling, and the production-safety work that has to exist before any of
it ships to a VPS holding real orders.

Method: every claim below was read off the running system (PostgreSQL
`zeyad_shadow`, the Express app, the live DOM at 375×812) rather than off the
documentation. Where documentation and code disagreed, the code won.

---

## A. Current architecture

| Layer | What it actually is |
|---|---|
| Storefront | 71 **static HTML files** at the repo root. No build step, no framework. |
| Styling | 4 stylesheets in a fixed cascade: `styles.css` → `production-polish.css` → `responsive-pro.css` → `mobile-first.css`, plus the new `assets/css/storefront-2026.css` last. |
| Server | Express. `middleware/visual-cms.js` parses each HTML page with cheerio on every request and rewrites parts of it from the database. |
| Data into pages | `window.ZFB_DATA` (departments, categories, offers, banners) injected per request; `catalog-render-service.js` rebuilds each department page's main grid from the DB; `category-strip-service.js` rebuilds its category tiles. |
| Client data | `/api/products`, `/api/settings`, and a generated `products_db.json` cache. |
| Database | PostgreSQL, 73 tables, `db/postgres-schema.sql` is pure `CREATE TABLE IF NOT EXISTS` DDL with **zero** `DROP`/`TRUNCATE`. |
| Admin | Express + EJS at `/admin`. |

**The seam that matters:** the storefront is static files, but the parts that
change — products, categories, images, prices — are already rewritten
server-side per request. That is the right place to make the site data-driven,
and it needs no framework and no CMS.

---

## B. Current problems (measured, not assumed)

### B1. Product card — the photograph was not the subject
Measured on `bedrooms.html` at 375px before any change:

| | Before | After |
|---|---|---|
| Card height | 373px | 319px |
| Photograph | 164px (**44%**) | 167px (**52%**) |
| Text block | 208px (**56%**) | 152px |
| Availability row | 79px (wrapped twice) | 40px, one row |

The availability row could not fit "متوفر" + compare + wishlist + add-to-cart on
one line at 155px, so it wrapped twice. The discount badge and the wishlist
button were absolutely positioned **on top of the photograph**.

### B2. `theme.js` was loading `production-polish.css` a second time
`ensureProductionPolishStylesheet()` appended a second `<link>` at runtime even
though all 71 pages already link it. That downloaded a 3,107-line sheet twice
**and moved it to the end of the cascade**, where it silently outranked every
stylesheet the markup loaded after it.

### B3. Sizes never reached the customer — three independent breaks
1. `/api/products/:id` never loaded `product_sizes`.
2. `product-engine.js` hardcoded `sizes: []` when mapping the API response.
3. `POST /api/orders` priced every line from the product's base price and never
   recorded which size was bought.

Product 498 had two sizes in the database (1300 / 1200) and a base price of
1500. A customer choosing either size was charged 1500 and the admin saw no size.

### B4. The old price was never converted
`<del>6,260</del>` ships without a currency symbol, so `currency.js` never
tagged it. Cards showed a converted current price beside an unconverted old one.

### B5. Two identical `delivery_time` inputs in the admin form
Duplicate field names post an array, stored verbatim, so the product page told
customers its delivery time was `{"2","2"}`.

### B6. The spec sheet came before the photograph on every phone
`product-page.css` gives the gallery `order:1` and the summary `order:2` below
1280px but leaves the spec card at the default `order:0`.

### B7. Category tiles were fiction
Two hardcoded strips of five tiles, naming categories that do not exist in the
database, with images baked into CSS classes no operator could change.

### B8. No migration ledger — the headline production risk
- `migrations/` holds exactly one migration, applied by hand.
- `migrate.js` is a one-off SQLite script pointing at a legacy path.
- There is no `schema_migrations` table and nothing that applies migrations in
  order.
- `config/database.js` does ad-hoc `ALTER TABLE … ADD COLUMN` at boot, but only
  on the **SQLite** path (it uses `PRAGMA`). Production is PostgreSQL, so those
  upgrades do not run there at all.

Mitigating: `initPgDatabase()` is exported but **never called at boot**, and the
schema file is non-destructive. So today's deploy does not damage data — but
there is also no supported way to evolve the schema.

### B9. `/uploads` static mount points at a directory that does not exist
Uploads are written to `<repo>/uploads` (`UPLOAD_DIR=./uploads` resolved against
`backend/..`) but `server.js` serves `/uploads` from `backend/uploads`. It works
only because an earlier `express.static(repo root)` mount catches the request
first. Reorder those two lines and every product image 404s.

### B10. Dead composition schema
`pages`, `page_sections`, `content_blocks` exist in the schema and are
referenced only by a seed script. Building on them would mean building a CMS,
which the brief rules out.

---

## C. Design direction

From the skill's own data (`products.csv` row 4, *E-commerce Luxury*):
primary style **Liquid Glass / premium materials**, palette **premium colours +
minimal accent**, key consideration *"elegance & sophistication"*. That is what
the site already has — olive/gold/cream on IBM Plex Sans Arabic. **The identity
is not the problem and is not being changed.** The problems are hierarchy,
density and data-drivenness.

Binding guidelines applied from `ux-guidelines.csv`:

| # | Rule | Applied as |
|---|---|---|
| 69 | No horizontal scroll | Verified `scrollWidth === clientWidth` at every breakpoint |
| 65 | Test 320/375/414/768/1024/1440 | Extended to the brief's 320–430 set |
| 66 | Touch targets larger on mobile | Card actions 40px, size chips 44px |
| 23 | ≥8px between touch targets | 6–8px gaps, verified |
| 46/47 | Image sizing + lazy loading | `loading="lazy"` on tiles and cards; gallery eager + `fetchpriority=high` |
| 19 | Reserve space, no layout shift | Fixed media ratio box; title reserves 2 lines |
| 113 | Never clamp essential meaning without a full-detail path | Title clamps to 2 lines **and** carries a `title` attribute, and the card links to the full name |
| 116 | Chip/badge labels stay whole on one line | `white-space: nowrap` on chips and badges |

---

## D–I. Product card, images, categories, hero, offers, composition

**D. Product card.** One anatomy for all four generators (static HTML,
`zfb-core.js`, `search-page.js`, server-rendered catalogue), normalised at
runtime by `assets/js/core/storefront-2026.js` rather than by rewriting markup
in 30 files — because rewriting it would rewrite the `data-vid` attributes the
visual CMS keys its saved edits on. Order: photograph → name → rating +
availability → price + old price + discount → save + buy.

**E. Images.** The ratio is a **token**, not a constant:
`--zs-media-ratio`, defaulting to 1/1 and overridable per grid or department, so
no single ratio is enforced site-wide. Within that box the photograph is
`object-fit: contain` — never cropped, never distorted, whatever shape it was
shot in — and the space containment leaves is filled with a blurred copy of the
same photograph, so a landscape shot in a square box reads as a deliberate mount
instead of a small picture in a beige void. Transparent PNGs are detected and
rendered on a flat plate with **no** blur, because blurring a cut-out looks
broken.

**F. Categories.** Rendered from the department's real categories. Image, name,
order and existence are all admin decisions. A category with no uploaded image
falls back to a photograph of a product actually in it; with no products, to a
lettered plate — never stock artwork of something the shop may not sell.
Presentation becomes a small closed set of primitives selected per category
(`card` / `circle` / `pill` / `compact`), so bedrooms and appliances can look
different without new code.

**G. Hero.** Capped on mobile so it cannot eat the first screen, with the scrim
sized to the text rather than the whole image.

**H. Offers.** Already a state on the product (`old_price`/discount) plus an
`offers` table with a `placement` column. No product duplication is introduced.

**I. Composition.** No CMS. Instead: **any section whose content resolves to
nothing is removed server-side.** That delivers "do not render an empty section"
generically, for every page, with no new tables.

---

## J–L. Admin, database evolution, deployment safety

**J.** Category presentation and image are admin fields. Sizes, colours,
colour-per-image, placement and ordering already are.

**K.** One additive migration: `categories.display_style TEXT`. Nullable,
defaulted, no existing column altered, no row rewritten. Every existing category
renders exactly as it does today until someone changes it.

**L.** A real migration runner is added:
- `schema_migrations` ledger table.
- Applies `migrations/*.sql` in filename order, each in its own transaction,
  recording the filename and a checksum.
- Already-applied files are skipped; a file whose checksum changed is **refused**
  rather than reapplied.
- `--dry-run` prints the plan and touches nothing.
- Refuses to run without a backup marker unless `--i-have-a-backup` is passed.
- Never issues `DROP`/`TRUNCATE`; the runner rejects a migration containing them
  unless the file opts in explicitly.

Deployment order stays expand → migrate → deploy → verify → (contract later).

---

## M–Q. Security, performance, responsive, testing, risk

**M.** Uploads already generate their own filenames (timestamp + random),
allowlist extensions, and check MIME **and** extension; `originalname` never
reaches the stored path, so there is no traversal. SVG is not allowed, which
closes the main XSS vector. Order pricing is now re-derived server-side from
`product_sizes`; the posted price is ignored entirely. The `/uploads` mount is
corrected to the directory uploads are actually written to.

**N.** Lazy loading on tiles and grid cards; the gallery image is eager with
`fetchpriority="high"` because it is the LCP element. One duplicated 3,107-line
stylesheet request removed. Assets are versioned by content hash so caching is
safe and busts only on real change.

**O.** Mobile-first. Verified at 320/360/375/390/412/430 plus tablet/desktop.

**P.** `backend/tests/test-product-variants-pricing.js` (9 assertions, passing)
covers the pricing rule, the order route's server-side re-pricing, and the read
path. Layout is verified by measuring the live DOM, not by eye.

**Q. Regression risks and how each is handled**

| Risk | Handling |
|---|---|
| Runtime DOM normalisation fights a card generator | Every step is idempotent; a MutationObserver re-runs it after any generator writes |
| Removing the two hardcoded strips orphans saved CMS edits | Those `data-vid`s are gone by intent; the CMS simply finds nothing and skips |
| New CSS layer loses to four earlier `!important` layers | Specificity checked rule by rule against the live cascade |
| `:has()` support | Used only for a cosmetic price line break; degrades to the previous wrap |
| Migration half-applies | Each file runs in its own transaction and is only recorded on commit |
