/**
 * Generate a WebP twin beside every large storefront image.
 *
 * The site's own photography is its heaviest payload by a wide margin. With
 * compression on, a catalogue page's HTML, CSS and JS together come to 196KB
 * -- while a single hero PNG is 1,964KB, and it appears on 28 pages. Four
 * images alone account for nearly 9MB.
 *
 * PNG is the wrong container for a photograph; it is lossless and stores no
 * perceptual model. WebP at quality 82 is visually indistinguishable at these
 * sizes and routinely 85-95% smaller.
 *
 * Nothing in the markup changes. The originals stay exactly where they are,
 * and middleware/webp.js serves the twin only to browsers that advertise WebP
 * support, falling back to the original otherwise. So the risk of this script
 * is bounded at "some extra files on disk".
 *
 * Safe to re-run: an up-to-date twin is skipped.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const DIRS = ['assets', 'uploads'];

// Below this, the twin rarely wins enough to be worth the extra file.
const MIN_BYTES = 40 * 1024;
const QUALITY = 82;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(png|jpe?g)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

(async () => {
  let converted = 0, skipped = 0, savedBytes = 0, originalBytes = 0;
  const biggest = [];

  for (const dir of DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const size = fs.statSync(file).size;
      if (size < MIN_BYTES) { skipped++; continue; }

      const twin = file.replace(/\.(png|jpe?g)$/i, '.webp');

      // Skip when the twin is already newer than its source.
      if (fs.existsSync(twin) && fs.statSync(twin).mtimeMs >= fs.statSync(file).mtimeMs) {
        skipped++;
        continue;
      }

      try {
        await sharp(file).webp({ quality: QUALITY }).toFile(twin);
      } catch (err) {
        console.log('  skipped (' + err.message.split('\n')[0] + '): ' + path.relative(ROOT, file));
        continue;
      }

      const newSize = fs.statSync(twin).size;

      // A twin that is not clearly smaller is not worth serving.
      if (newSize >= size * 0.9) {
        fs.unlinkSync(twin);
        skipped++;
        continue;
      }

      converted++;
      originalBytes += size;
      savedBytes += size - newSize;
      biggest.push({
        name: path.relative(ROOT, file).replace(/\\/g, '/'),
        from: size,
        to: newSize
      });
    }
  }

  biggest.sort((a, b) => (b.from - b.to) - (a.from - a.to));
  const kb = (n) => Math.round(n / 1024) + ' KB';

  console.log('Converted ' + converted + ' image(s), skipped ' + skipped + '.\n');
  for (const b of biggest.slice(0, 10)) {
    console.log(
      '  ' + b.name.padEnd(44) +
      kb(b.from).padStart(9) + '  ->' + kb(b.to).padStart(9) +
      '   -' + Math.round((1 - b.to / b.from) * 100) + '%'
    );
  }
  if (originalBytes > 0) {
    console.log('\n  total ' + kb(originalBytes) + ' -> ' + kb(originalBytes - savedBytes) +
      '   saved ' + kb(savedBytes) + ' (' + Math.round(savedBytes / originalBytes * 100) + '%)');
  }
})();
