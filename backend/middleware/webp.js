/**
 * Serve a WebP twin to browsers that can read one, transparently.
 *
 * The alternative -- rewriting <img src> across the storefront, or wrapping
 * every image in a <picture> -- would have touched 28 pages of markup to save
 * bytes, and every one of those edits is a chance to break a layout. This
 * changes no markup at all: a request for /assets/hero.png is answered with
 * /assets/hero.webp when the browser says it accepts WebP and the twin exists
 * on disk. Anything else gets the original, byte for byte.
 *
 * Vary: Accept is essential here. Without it a shared cache could hand a WebP
 * body to a client that cannot decode it, and the image would simply fail to
 * appear.
 *
 * Twins are produced by scripts/generate-webp.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function webpMiddleware(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!/\.(png|jpe?g)$/i.test(req.path)) return next();

  // Tell caches this URL varies by Accept even when we end up serving the
  // original -- the decision differs per client.
  res.setHeader('Vary', 'Accept');

  const accept = String(req.headers.accept || '');
  if (!accept.includes('image/webp')) return next();

  // Reject anything that tries to climb out of the project root before it
  // reaches the filesystem.
  const rel = decodeURIComponent(req.path).replace(/^\/+/, '');
  const twinRel = rel.replace(/\.(png|jpe?g)$/i, '.webp');
  const twinAbs = path.join(ROOT, twinRel);
  if (!twinAbs.startsWith(ROOT)) return next();

  if (!fs.existsSync(twinAbs)) return next();

  res.type('image/webp');
  return res.sendFile(twinAbs, (err) => {
    // If sending the twin fails for any reason, fall through to the original
    // rather than leaving the request hanging on a broken image.
    if (err && !res.headersSent) next();
  });
}

module.exports = webpMiddleware;
