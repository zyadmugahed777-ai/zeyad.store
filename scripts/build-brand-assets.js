#!/usr/bin/env node
/**
 * Build every brand asset from one definition.
 *
 * Why this exists
 * ---------------
 * The icon set was made by hand. When the mark changed from an olive Arabic
 * "ز" to a gold Latin "Z", six files had to be redrawn and the social card
 * rebuilt, and nothing recorded how any of them had been produced. The next
 * change would have been the same archaeology.
 *
 * Now the mark is defined once, in assets/brand/favicon.svg, and every raster
 * is rendered from it. The social card is composed here from the same colours.
 *
 *   node scripts/build-brand-assets.js
 *
 * Re-runnable and deterministic: running it twice produces identical files.
 *
 * Sizes and why each exists:
 *   favicon-32.png      the browser tab, and what Google shows beside a result
 *   apple-touch-icon    iOS home screen (180 is the size iOS actually asks for)
 *   icon-192 / icon-512 the web manifest; 512 doubles as Organization.logo
 *   og-default.png      1200x630, the card WhatsApp / Facebook / TikTok render
 *                       when the shop's link is shared. Every visitor arrives
 *                       from one of those, so this image is the shop's first
 *                       impression far more often than the home page is.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAND = path.join(ROOT, 'assets', 'brand');

// Resolved against the backend's node_modules, which is where sharp lives.
const sharp = require(path.join(ROOT, 'backend', 'node_modules', 'sharp'));

/** The brand's gold, as used across the stylesheets. */
const GOLD_LIGHT = '#e8c67d';
const GOLD = '#c79a52';
const GOLD_DEEP = '#a87c38';
/** The glyph colour. Dark warm brown reads 5.4:1 on the gold; cream reads 2.3. */
const GLYPH = '#3a2a12';
/** The card ground. Warm near-black, so the gold is the only bright thing. */
const CARD_BG = '#17120e';
const CREAM = '#fff8ed';

const ICONS = [
  ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512]
];

/** The social card, composed from the same palette as the mark. */
function cardSvg() {
  const W = 1200;
  const H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e1813"/>
      <stop offset="1" stop-color="${CARD_BG}"/>
    </linearGradient>
    <linearGradient id="disc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD_LIGHT}"/>
      <stop offset="0.55" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_DEEP}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.32" r="0.5">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- The mark, same geometry as favicon.svg scaled to a 96 radius disc. -->
  <g transform="translate(600 196)">
    <circle r="96" fill="url(#disc)"/>
    <g transform="translate(-96 -96) scale(3)">
      <path d="M17 16 L47 16 L47 25 L31 39 L47 39 L47 48 L17 48 L17 39 L33 25 L17 25 Z"
            fill="${GLYPH}"/>
    </g>
  </g>

  <text x="600" y="392" fill="${CREAM}" text-anchor="middle"
        font-family="Segoe UI, Tahoma, sans-serif" font-size="76" font-weight="700">زياد ستور</text>

  <text x="600" y="452" fill="${GOLD}" text-anchor="middle"
        font-family="Segoe UI, Tahoma, sans-serif" font-size="32">كل ما تحتاجه… في مكان واحد.</text>

  <line x1="490" y1="500" x2="710" y2="500" stroke="${GOLD_DEEP}" stroke-width="2"/>

  <text x="600" y="548" fill="#b9ada0" text-anchor="middle"
        font-family="Segoe UI, Tahoma, sans-serif" font-size="28" letter-spacing="3">zeyad.store</text>
</svg>`;
}

(async () => {
  const markSvg = fs.readFileSync(path.join(BRAND, 'favicon.svg'));

  for (const [name, px] of ICONS) {
    // density 600 so the vector is rasterised well above the target size and
    // downsampled, rather than rendered at size and looking soft.
    await sharp(markSvg, { density: 600 })
      .resize(px, px)
      .png({ compressionLevel: 9 })
      .toFile(path.join(BRAND, name));
    console.log('  ' + name.padEnd(24) + px + 'x' + px);
  }

  await sharp(Buffer.from(cardSvg()), { density: 300 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(BRAND, 'og-default.png'));
  console.log('  og-default.png          1200x630');

  console.log('\nbrand assets rebuilt from assets/brand/favicon.svg');
})().catch((e) => {
  console.error('brand build failed:', e.message);
  process.exit(1);
});
