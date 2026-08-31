# Admin Panel Audit

## Root cause of the reported "media broken" bugs

`views/admin/products/form.ejs:501` opens a `DOMContentLoaded` listener that is never closed — line 888 closes a different, inner listener instead. Result: `SyntaxError: Unexpected end of input`, and the browser discards the *entire* inline `<script>` block. Every `onclick` handler on the page (image picker, primary-image toggle, video field, duplicate button, etc.) is therefore undefined at click time. This single defect is the root cause of the owner-reported bugs #1 and #2.

A second, latent defect sits behind it: the listener at `:736` is nested inside the `:501` handler, so even after the syntax fix it still wouldn't fire — needs hoisting to module scope alongside the fix.

**The media plumbing itself is not missing** — `form.ejs:155` already has the `multiple` attribute; `routes/admin/products.js:111-114` already uses `.fields([images ×30, images[], video_file])`; `:212` already writes `is_primary`; the `product_images` table already has `is_primary BOOLEAN` and `sort_order`. These are integration/semantics bugs, not missing features. See `MEDIA-AUDIT.md` for the media-specific breakdown.

## Video upload crash

`middleware/upload.js:120` reads `MAX_FILE_SIZE` from `.env:7`, which is set to `10485760` (10 MB) despite a code comment claiming 50 MB. Any realistic product video exceeds this, multer rejects it, and the rejection path issues a redirect while the browser is still streaming the request body — the client sees `ECONNRESET`, which looks exactly like a server crash. The flash message that would explain this says "per image", further hiding the cause.

`UPLOAD_DIR=./uploads` in `.env:6` resolves relative to `process.cwd()`, while cleanup code elsewhere hardcodes `backend/uploads` — two divergent upload trees can exist on disk depending on launch directory, and deletions silently no-op against the wrong tree.

## Access control

- `routes/admin/index.js:83` only gates `:view` permission at mount time — an Editor with `products:view` can `POST /admin/products/:id/delete` with no further check.
- `/coupons`, `/delivery`, `/requests`, `/customer-reports`, `/frame-products` have **no** `checkPermission` middleware at all — any authenticated admin session can hit them regardless of role.
- CSRF protection is explicitly bypassed for all multipart POST routes (`middleware/csrf.js:24-26`).
- `routes/admin/media.js:66-68` takes an unsanitised `folder` field from the request body and uses it in a filesystem path — path traversal.

## Static file exposure

`server.js:38` serves the repository root as static files, exposing `backend/db/zeyad.db` (admin bcrypt hashes + customer PII) and SQL backup dumps under `backend/db/backups/`. This mount also shadows the intended `/uploads` mount declared at `:41`. `.env` itself is not exposed because serve-static excludes dotfiles by default, but nothing else is protected.

## Broken / orphan admin features

- Product "duplicate" button posts to a route that doesn't exist.
- The non-AJAX media upload path persists nothing (only the AJAX path writes to the DB).
- AJAX set-primary / delete-image endpoints exist server-side but have no caller in the (broken) client script.
- `verify-consistency` has no UI entry point at all.

## Pagination / counts

11 sites write `await x.get(...).count`, which parses as `await (x.get(...).count)` — the `.count` property access happens on the unresolved Promise, not on its resolved value, so every count is `undefined`. Breaks all admin list pagination and the `ensureDefaultAdmin` bootstrap check.

Remediation sequencing: Wave 5 (media/products), Wave 6 (remaining admin CRUD, RBAC, CSRF, path traversal) in `MASTER-IMPLEMENTATION-PLAN.md`.
