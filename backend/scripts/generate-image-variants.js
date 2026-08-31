#!/usr/bin/env node
/**
 * Generate small width variants for images the storefront shows as thumbnails.
 *
 * Why
 * ---
 * Measured on the home page: /assets/zeyad-category-showrooms.png is delivered
 * at 1536x1024 and displayed at 112 CSS px, twenty times over;
 * /assets/premium-shopping-hero.png is 1716x917 and never displayed wider than
 * 280 CSS px, twenty-one times over. Even as WebP those two are 210KB and
 * 101KB, and images are roughly two thirds of the page's transfer -- the one
 * part compression cannot help, because they are already compressed.
 *
 * The fix is to ship a size the layout actually uses. This script produces the
 * smaller renditions; the matching `srcset` on each <img> is what makes the
 * browser choose one.
 *
 * What it will and will not do
 * ----------------------------
 *  - Writes NEW files only, named `<name>-<width>.<ext>`. It never overwrites,
 *    never replaces and never deletes an original -- the full-size asset stays
 *    exactly as it is and remains the last candidate in every srcset.
 *  - Skips any variant that already exists, so re-running is free and cannot
 *    clobber a file someone has since hand-tuned.
 *  - Skips a width that is not actually smaller than the source, so a small
 *    image is never upscaled into a bigger file than the original.
 *  - Writes a .webp twin beside each variant, because middleware/webp.js serves
 *    `foo.webp` when `foo.png` is requested by a browser that accepts it. Both
 *    halves must exist or the variant would lose format negotiation that the
 *    original already has.
 *
 * Usage:  node scripts/generate-image-variants.js [--dry-run]
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');

/**
 * The images worth resizing, with the widths to emit.
 *
 * Widths come from measurement, not habit: no thumbnail on the site is laid
 * out wider than 280 CSS px, so 320 covers a 1x screen and 640 covers 2x. A 3x
 * phone falls back to the original, which is correct -- that is what it is for.
 * hero-living is the exception at 417 CSS px, so it gets 480/960 instead.
 */
const TARGETS = [
  { file: 'assets/zeyad-category-showrooms.png', widths: [320, 640, 960] },
  { file: 'assets/premium-shopping-hero.png',    widths: [320, 640, 960] },
  { file: 'assets/zeyad-hero-showroom.png',      widths: [320, 640, 960] },
  { file: 'assets/zeyad-product-sprite.png',     widths: [320, 640, 960] },
  { file: 'assets/offers-hero.jpg',              widths: [320, 640, 960] },
  { file: 'assets/solar-hero.jpg',               widths: [320, 640, 960] },
  { file: 'assets/images/categories/cat-majlis.webp',     widths: [320] },
  { file: 'assets/images/categories/cat-furniture.webp',  widths: [320] },
  { file: 'assets/images/categories/cat-solar.webp',      widths: [320] },
  { file: 'assets/images/categories/cat-bedroom.webp',    widths: [320] },
  { file: 'assets/images/categories/cat-appliances.webp', widths: [320] },
  { file: 'assets/images/categories/cat-kitchen.webp',    widths: [320] },
  { file: 'assets/images/najm-avatar.webp',               widths: [128] },
  { file: 'assets/images/hero-living-light.webp', widths: [480] },
  { file: 'assets/images/hero-living-dark.webp',  widths: [480] }
];

const dryRun = process.argv.includes('--dry-run');

function kb(bytes) {
  return Math.round(bytes / 1024) + 'KB';
}

async function emit(srcRel, width) {
  const srcAbs = path.join(ROOT, srcRel);
  if (!fs.existsSync(srcAbs)) {
    console.log(`  skip (missing)   ${srcRel}`);
    return null;
  }

  const ext = path.extname(srcRel);
  const outRel = srcRel.slice(0, -ext.length) + '-' + width + ext;
  const outAbs = path.join(ROOT, outRel);

  const meta = await sharp(srcAbs).metadata();
  if (!meta.width || meta.width <= width) {
    console.log(`  skip (already ${meta.width}px)  ${srcRel}`);
    return null;
  }

  // A variant that exists is left alone, always.
  const twinRel = outRel.replace(/\.(png|jpe?g)$/i, '.webp');
  const twinAbs = path.join(ROOT, twinRel);
  const needVariant = !fs.existsSync(outAbs);
  const needTwin = /\.(png|jpe?g)$/i.test(outRel) && !fs.existsSync(twinAbs);

  if (!needVariant && !needTwin) {
    console.log(`  exists           ${outRel}`);
    return null;
  }

  if (dryRun) {
    console.log(`  would write      ${outRel}${needTwin ? ' (+ .webp twin)' : ''}`);
    return null;
  }

  if (needVariant) {
    const pipeline = sharp(srcAbs).resize({ width, withoutEnlargement: true });
    if (/\.png$/i.test(outRel))       await pipeline.png({ quality: 82, compressionLevel: 9 }).toFile(outAbs);
    else if (/\.jpe?g$/i.test(outRel)) await pipeline.jpeg({ quality: 82, mozjpeg: true }).toFile(outAbs);
    else                               await pipeline.webp({ quality: 82 }).toFile(outAbs);
  }

  // The .webp twin exists so middleware/webp.js can negotiate format for the
  // variant exactly as it already does for the original.
  if (needTwin) {
    await sharp(srcAbs).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(twinAbs);
  }

  const before = fs.statSync(srcAbs).size;
  const after = fs.existsSync(twinAbs) ? fs.statSync(twinAbs).size : fs.statSync(outAbs).size;
  console.log(`  wrote ${String(width).padStart(4)}px    ${outRel}   ${kb(before)} -> ${kb(after)}`);
  return { before, after };
}

(async () => {
  console.log(dryRun ? '\nDRY RUN — nothing will be written\n' : '\nGenerating width variants (originals are never touched)\n');
  let saved = 0, count = 0;

  for (const t of TARGETS) {
    for (const w of t.widths) {
      const r = await emit(t.file, w);
      if (r) { saved += (r.before - r.after); count++; }
    }
  }

  console.log(`\n${count} variant(s) written.`);
  if (saved > 0) console.log(`Per-image saving where the small rendition is chosen: ~${kb(saved)} total across those images.\n`);
})().catch((err) => {
  console.error('\nFailed:', err.message, '\n');
  process.exitCode = 1;
});
