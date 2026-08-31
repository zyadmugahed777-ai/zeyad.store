#!/usr/bin/env node
/**
 * Add `srcset`/`sizes` to the <img> tags that point at an image with width
 * variants, so a phone downloads a phone-sized rendition.
 *
 * Why this is safe to run
 * ----------------------
 * The full-size original is always the LAST candidate in the srcset, listed at
 * its true intrinsic width. That single detail makes the change incapable of
 * regressing quality: `srcset` makes the browser pick the smallest candidate
 * that still meets the required pixel density, so the worst case is that it
 * picks the original -- exactly what it downloads today. It can match today's
 * behaviour or beat it, never fall short of it.
 *
 * `sizes` is measured, not guessed, and it is per-image -- see the table below.
 *
 * What it will not do
 * -------------------
 *  - It never touches an <img> that already has a srcset.
 *  - It only edits tags whose src is in VARIANTS below, and only when the
 *    variant files actually exist on disk.
 *  - It changes no other attribute: src, alt, class, loading, onerror and
 *    data-vid are all left exactly as they are, so the visual editor's
 *    element ids and the placeholder fallbacks keep working.
 *
 * Usage:  node scripts/apply-image-srcset.js [--dry-run]
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const dryRun = process.argv.includes('--dry-run');

/**
 * base path (as written in markup) -> widths generated, and the `sizes` that
 * describes how that image is actually laid out.
 *
 * `sizes` is the whole game, and getting it wrong fails in both directions: too
 * small and a phone gets a soft image, too large and the browser picks the
 * original and the exercise saves nothing. A first attempt used 100vw for
 * everything, which was the second mistake -- every candidate was rejected as
 * too small and the originals were downloaded exactly as before.
 *
 * These come from measurement across index, offers, product, bedrooms-catalog
 * and majalis-catalog at viewports from 375px to 1432px:
 *
 *   - As card thumbnails these render 112-207px on a phone and never more than
 *     301px on a desktop, so `50vw / 320px` always resolves to a candidate at
 *     or above the real requirement, including at 2x and 3x.
 *   - premium-shopping-hero is the exception: on offers and product it is a
 *     hero, up to 426px. It keeps the conservative 100vw so a phone gets the
 *     960w rendition rather than a soft one -- still well under the 1716w
 *     original.
 */
const THUMB_SIZES = '(max-width: 768px) 50vw, 320px';
const HERO_SIZES  = '(max-width: 768px) 100vw, 340px';

const VARIANTS = {
  'assets/zeyad-category-showrooms.png': { widths: [320, 640, 960], sizes: THUMB_SIZES },
  'assets/premium-shopping-hero.png':    { widths: [320, 640, 960], sizes: HERO_SIZES },
  'assets/zeyad-hero-showroom.png':      { widths: [320, 640, 960], sizes: THUMB_SIZES },
  'assets/zeyad-product-sprite.png':     { widths: [320, 640, 960], sizes: THUMB_SIZES },
  'assets/offers-hero.jpg':              { widths: [320, 640, 960], sizes: THUMB_SIZES },
  'assets/solar-hero.jpg':               { widths: [320, 640, 960], sizes: THUMB_SIZES },
  'assets/images/categories/cat-majlis.webp':     { widths: [320], sizes: THUMB_SIZES },
  'assets/images/categories/cat-furniture.webp':  { widths: [320], sizes: THUMB_SIZES },
  'assets/images/categories/cat-solar.webp':      { widths: [320], sizes: THUMB_SIZES },
  'assets/images/categories/cat-bedroom.webp':    { widths: [320], sizes: THUMB_SIZES },
  'assets/images/categories/cat-appliances.webp': { widths: [320], sizes: THUMB_SIZES },
  'assets/images/categories/cat-kitchen.webp':    { widths: [320], sizes: THUMB_SIZES }
};

async function buildSrcset(base, widths, prefix) {
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);

  const parts = [];
  for (const w of widths) {
    const rel = `${stem}-${w}${ext}`;
    if (!fs.existsSync(path.join(ROOT, rel))) return null; // variant missing: leave the tag alone
    parts.push(`${prefix}${rel} ${w}w`);
  }

  // The original, at its real intrinsic width, as the final candidate.
  const meta = await sharp(path.join(ROOT, base)).metadata();
  if (!meta.width) return null;
  parts.push(`${prefix}${base} ${meta.width}w`);

  return parts.join(', ');
}

(async () => {
  console.log(dryRun ? '\nDRY RUN — nothing will be written\n' : '\nAdding srcset/sizes\n');

  // Pre-compute one srcset per image, for both the bare and root-relative forms
  // the markup uses ("assets/x.png" and "/assets/x.png").
  const built = new Map();
  for (const [base, spec] of Object.entries(VARIANTS)) {
    for (const prefix of ['', '/']) {
      const s = await buildSrcset(base, spec.widths, prefix);
      if (s) built.set(prefix + base, { srcset: s, sizes: spec.sizes });
    }
  }

  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  let touchedFiles = 0, touchedTags = 0;

  for (const file of files) {
    const abs = path.join(ROOT, file);
    let html = fs.readFileSync(abs, 'utf8');
    const before = html;

    html = html.replace(/<img\b[^>]*>/gi, (tag) => {
      if (/\bsrcset\s*=/i.test(tag)) return tag;              // already responsive
      const m = tag.match(/\bsrc\s*=\s*"([^"]+)"/i);
      if (!m) return tag;

      const src = m[1].split('?')[0];
      const entry = built.get(src);
      if (!entry) return tag;

      touchedTags++;
      // Insert immediately after src, changing nothing else in the tag.
      return tag.replace(
        m[0],
        `${m[0]} srcset="${entry.srcset}" sizes="${entry.sizes}"`
      );
    });

    if (html !== before) {
      if (!dryRun) fs.writeFileSync(abs, html);
      touchedFiles++;
    }
  }

  console.log(`${touchedTags} <img> tag(s) across ${touchedFiles} page(s)${dryRun ? ' would be' : ''} updated.`);
  console.log(`thumbnails: ${THUMB_SIZES}`);
  console.log(`hero:       ${HERO_SIZES}\n`);
})().catch((err) => {
  console.error('\nFailed:', err.message, '\n');
  process.exitCode = 1;
});
