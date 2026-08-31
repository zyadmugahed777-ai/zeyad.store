/**
 * Link mobile-first.css into every storefront page.
 *
 * The site already loads its CSS in layers -- styles.css, then
 * production-polish.css, then responsive-pro.css -- so the corrections go in a
 * fourth layer loaded last rather than by editing rules the other pages share.
 * responsive-pro.css uses !important throughout; load order is the only way to
 * correct it without touching it.
 *
 * Inserted immediately after the responsive-pro.css link so the cascade reads
 * in the order it is written. Pages without that link get it after their last
 * stylesheet instead.
 *
 * Safe to re-run: a page that already has the link is left alone.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');

/**
 * The cache-busting stamp is derived from the file's own contents, not written
 * by hand.
 *
 * The site's other stylesheets carry stamps like ?v=20260820-v51 that someone
 * has to remember to bump. With CSS now cached for a week, a forgotten bump
 * means every returning visitor sees the old stylesheet for seven days -- which
 * happened here during development and cost a full verification round before it
 * was spotted. A content hash cannot be forgotten: change the file and the URL
 * changes with it; leave it alone and the cache still hits.
 */
/**
 * Assets whose ?v= stamp this script owns.
 *
 * These are cached for a week by the server, so a change that does not move
 * the stamp does not reach a returning visitor for seven days. Deriving each
 * stamp from the file's own bytes makes that impossible to get wrong -- which
 * it already was once during development, costing a full verification round
 * against a stylesheet the browser was refusing to re-fetch.
 *
 * The site's older stamps (?v=20260820-v51 and friends) are still written by
 * hand and still carry that risk; they are left alone here rather than
 * rewritten wholesale before a launch.
 */
const STAMPED = ['mobile-first.css', 'product-engine.js'];

const hashOf = (file) => crypto
  .createHash('sha1')
  .update(fs.readFileSync(path.join(ROOT, file)))
  .digest('hex')
  .slice(0, 8);

const VERSIONS = Object.fromEntries(STAMPED.map((f) => [f, hashOf(f)]));
const VERSION = VERSIONS['mobile-first.css'];

const LINK = `  <link rel="stylesheet" href="mobile-first.css?v=${VERSION}">`;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'backend' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

let linked = 0, already = 0, skipped = 0, restamped = 0, assetStamps = 0;

/** Point every reference to a stamped asset at its current hash. */
function restampAssets(src) {
  let out = src;
  for (const asset of STAMPED) {
    const v = VERSIONS[asset];
    // Escape every character that means something to a regular expression, so
    // a filename's dot matches a dot rather than any character.
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Matches src="...asset" or href="...asset", with or without an existing
    // ?v= stamp, and rewrites the stamp to the current hash.
    const re = new RegExp('((?:src|href)="[^"]*' + escaped + ')(\\?v=[^"]*)?(")', 'g');
    out = out.replace(re, (m, head, stamp, tail) => head + '?v=' + v + tail);
  }
  return out;
}

for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, 'utf8');

  // Refresh the stamps on every asset this script owns, whatever else the
  // page needs.
  const stamped = restampAssets(src);
  if (stamped !== src) { src = stamped; fs.writeFileSync(file, src, 'utf8'); assetStamps++; }

  // Already linked: refresh the stamp if the stylesheet has changed since,
  // then move on. This is what makes the script the single place the version
  // lives.
  const existing = src.match(/(<link[^>]+href="[^"]*mobile-first\.css)\?v=[^"]*(")/);
  if (existing) {
    const updated = src.replace(existing[0], existing[1] + '?v=' + VERSION + existing[2]);
    if (updated !== src) { fs.writeFileSync(file, updated, 'utf8'); restamped++; }
    else already++;
    continue;
  }
  if (src.includes('mobile-first.css')) { already++; continue; }

  // Depth of the file decides how the href has to be written.
  const rel = path.relative(path.dirname(file), ROOT).replace(/\\/g, '/');
  const prefix = rel ? rel + '/' : '';
  const link = LINK.replace('href="mobile-first.css', `href="${prefix}mobile-first.css`);

  // Preferred anchor: straight after the responsive layer.
  const responsive = src.match(/^.*<link[^>]+responsive-pro\.css[^>]*>.*$/m);
  let out;

  if (responsive) {
    out = src.replace(responsive[0], responsive[0] + '\n' + link);
  } else {
    // Otherwise after the last stylesheet on the page.
    const all = [...src.matchAll(/^.*<link[^>]+rel=["']stylesheet["'][^>]*>.*$/gm)];
    if (all.length === 0) { skipped++; continue; }
    const last = all[all.length - 1][0];
    out = src.replace(last, last + '\n' + link);
  }

  fs.writeFileSync(file, out, 'utf8');
  linked++;
}

console.log(`stamps ${JSON.stringify(VERSIONS)} — linked ${linked}, restamped ${restamped}, asset stamps refreshed on ${assetStamps} page(s), skipped ${skipped}.`);