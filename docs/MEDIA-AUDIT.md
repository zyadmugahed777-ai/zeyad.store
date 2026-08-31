# Media / Product Images Audit

## What already works (do not rebuild)

- `views/admin/products/form.ejs:155` — file input already has `multiple`.
- `routes/admin/products.js:111-114` — multer `.fields([{name: 'images', maxCount: 30}, {name: 'video_file', maxCount: 1}])` already configured.
- `routes/admin/products.js:212` — insert path already writes `is_primary` per image.
- Schema: `product_images` table already has `is_primary BOOLEAN` and `sort_order` columns.

## What's actually broken

1. **Multi-image selection appears broken in the browser** — not a plumbing gap. Root cause is `form.ejs:501-888`'s unterminated `DOMContentLoaded` listener (see `ADMIN-AUDIT.md`), which throws a `SyntaxError` and drops the entire inline script, including the image-picker JS that would normally preview/stage the multiple selected files client-side.
2. **Primary-image selection doesn't stick** — two layers:
   - Client: same script-death as above kills the primary-image toggle UI.
   - Server: no evidence the insert path clears a previously-set `is_primary=true` row before setting a new one — needs verification during implementation that setting a new primary doesn't leave two rows marked primary for the same product.
3. **Video upload crashes the panel** — not a real crash. `MAX_FILE_SIZE=10485760` (10 MB) in `.env:7` vs. a 50 MB comment in code; multer's rejection redirect fires while the client is still streaming the body, producing `ECONNRESET`. Confirmed not caused by sharp (not applied to video), multer storage engine (disk storage, no memory buffering issue), or `express.json` limits (don't apply to multipart).
4. **Upload directory split** — `UPLOAD_DIR=./uploads` (relative) vs. hardcoded `backend/uploads` in cleanup code; divergent trees depending on process launch directory.
5. **AJAX set-primary / delete-image endpoints exist but are orphaned** — no client-side caller wires them up (again traceable to the dead script block).
6. **Non-AJAX upload path persists nothing** — only the AJAX path actually writes image rows.

## Fix strategy (Wave 5, depends on Wave 1 boolean normalization)

1. Fix the `form.ejs` script scope (close `DOMContentLoaded` correctly, hoist the `:736` listener out of it) — syntax-only, no markup/style changes.
2. Normalize `is_primary` boolean comparisons per Wave 1's 13-column fix.
3. On setting a new primary image, explicitly clear the previous primary for that product in the same write (transactionally, once Wave 3 transactions are real).
4. Correct `MAX_FILE_SIZE` to match the intended 50 MB and apply it as a per-field multer limit; ensure the rejection path drains/aborts the request before responding so the client doesn't see `ECONNRESET`.
5. Make `UPLOAD_DIR` absolute (resolve once at boot) and reconcile the two existing upload trees on disk before or during the fix (human review before deleting either tree).

## Tests required

- Multi-file select in the real browser produces N `product_images` rows.
- Setting image B as primary flips `is_primary` to exactly one row per product.
- Uploading a video between 10MB and 50MB succeeds; one over 50MB fails with a clean error response, not a connection reset.
- Deleting an image removes both the DB row and the file from the correct (single, absolute) upload directory.
