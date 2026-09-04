/**
 * Where uploaded files live. One answer, imported by everything that needs it.
 *
 * The bug this exists to make impossible
 * --------------------------------------
 * Two files resolved UPLOAD_DIR themselves, with the same expression:
 *
 *   path.resolve(__dirname, '..', process.env.UPLOAD_DIR)
 *
 * server.js sits in backend/, so `..` is the repository root and it served
 * <repo>/uploads. middleware/upload.js sits in backend/middleware/, one level
 * deeper, so the same line resolved to backend/uploads -- and that is where it
 * wrote every file.
 *
 * So uploads were written to one directory and served from another. On the
 * server this meant a product image uploaded through the admin saved
 * successfully, recorded its path in the database, and then 404'd everywhere:
 * on the product page, in the catalogue, and in the admin's own list. Nothing
 * reported an error, because nothing was wrong except the two directories.
 *
 * Resolving it once, here, is what stops that from coming back the next time
 * someone adds a third caller.
 *
 * UPLOAD_DIR in .env is relative to the REPOSITORY ROOT (the default is
 * "./uploads"), which is also where a deploy expects the operator's media to
 * sit -- outside backend/, so it is obvious it is not application code.
 */
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(REPO_ROOT, process.env.UPLOAD_DIR)
  : path.join(REPO_ROOT, 'uploads');

/** Sub-directories every install is expected to have. */
const UPLOAD_SUBDIRS = [
  'products', 'videos', 'banners', 'offers', 'media',
  'consultations', 'quotes', 'reports', 'categories'
];

module.exports = { REPO_ROOT, UPLOAD_DIR, UPLOAD_SUBDIRS };
