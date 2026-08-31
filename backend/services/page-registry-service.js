/**
 * Page registry synchroniser.
 *
 * Why this exists
 * ---------------
 * The list of pages the visual editor offers came from a hardcoded array of 36
 * entries in config/database.js. The storefront has 71 HTML files. Nine of them
 * were in no registry at all -- category, confirmation, shipping, platforms,
 * report-issue, reservation-policy, najm, account-reservation-detail,
 * appliances_test -- so they could not be opened in the editor by any means,
 * and every page added to the site from now on would have inherited the same
 * blind spot until someone remembered to edit that array.
 *
 * This scans the storefront directory instead and registers whatever is
 * actually there. Adding a page to the site is now all it takes to make it
 * editable.
 *
 * What it deliberately does NOT do:
 *   - it never overwrites title_ar, editable or sort_order on a row that
 *     already exists, because an operator may have set those by hand;
 *   - it never deletes rows for files that have gone, since drafts and
 *     published elements hang off cms_pages by foreign key. Those are reported
 *     instead.
 */

const fs = require('fs');
const path = require('path');

const STOREFRONT_DIR = path.join(__dirname, '..', '..');

/** Files that are build artefacts or fragments, not pages of the site. */
const IGNORED = new Set(['test_output']);

/**
 * Pages whose behaviour is driven by scripts (cart totals, checkout, login).
 * They stay registered and editable -- visual edits are confined to text and
 * styling by element id -- but are typed so the UI can flag them.
 */
const FUNCTIONAL = new Set([
  'cart', 'checkout', 'login', 'search', 'track-order', 'confirmation',
  'account', 'account-profile', 'account-reservations', 'account-support',
  'account-reservation-detail'
]);

/** Read the <title> of an HTML file, minus the site suffix. */
function titleOf(filePath, slug) {
  try {
    // The <title> is always in the first few KB; no need to read a 400KB page.
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8192);
    const read = fs.readSync(fd, buf, 0, 8192, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, read).toString('utf8');
    const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return slug;
    return m[1]
      .replace(/\s+/g, ' ')
      .split(/[|–—-]/)[0]   // drop " | زياد ستور" style suffixes
      .trim() || slug;
  } catch (_) {
    return slug;
  }
}

function pageTypeOf(slug) {
  if (slug === 'index') return 'main';
  if (FUNCTIONAL.has(slug)) return 'functional';
  if (slug.endsWith('-catalog')) return 'catalog';
  return 'static';
}

/** Every storefront page present on disk. */
function scanStorefront() {
  return fs
    .readdirSync(STOREFRONT_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, ''))
    .filter((slug) => !IGNORED.has(slug))
    .map((slug) => ({
      slug,
      route: slug === 'index' ? '/' : `/${slug}.html`,
      title_ar: titleOf(path.join(STOREFRONT_DIR, `${slug}.html`), slug),
      page_type: pageTypeOf(slug)
    }));
}

/**
 * Register any storefront page missing from cms_pages.
 *
 * @param {Object} repos repository bundle from getRepositories()
 * @returns {Promise<{scanned:number, added:Array<string>, orphaned:Array<string>}>}
 */
async function syncPageRegistry(repos) {
  const onDisk = scanStorefront();
  const existing = (await repos.cms.getPages()) || [];
  const knownSlugs = new Set(existing.map((p) => p.slug));

  const added = [];
  for (const page of onDisk) {
    if (knownSlugs.has(page.slug)) continue;
    await repos.cms.registerPage({
      slug: page.slug,
      route: page.route,
      title_ar: page.title_ar,
      title_en: null,
      page_type: page.page_type,
      editable: true,
      sort_order: 500
    });
    added.push(page.slug);
  }

  // One-time promotion of the pages the old registry locked out of the editor.
  const promoted = typeof repos.cms.promoteProtectedPages === 'function'
    ? await repos.cms.promoteProtectedPages()
    : 0;

  const diskSlugs = new Set(onDisk.map((p) => p.slug));
  const orphaned = existing.filter((p) => !diskSlugs.has(p.slug)).map((p) => p.slug);

  return { scanned: onDisk.length, added, promoted, orphaned };
}

module.exports = { syncPageRegistry, scanStorefront, FUNCTIONAL };
