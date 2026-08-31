/**
 * Stamp every editable element on the storefront with a stable data-vid.
 *
 * The visual editor attaches its click handler to elements carrying a
 * data-vid, so an element without one simply cannot be selected. The original
 * selector covered only headings, paragraphs, links, images, buttons and
 * sections -- which left most of a page unselectable and is why the operator
 * could only ever click two or three things. A span inside a heading, a list
 * item, a table cell, a card's inner div carrying the background image: none
 * of them could be reached.
 *
 * Safe to re-run. A vid is only ever assigned to an element that has none, so
 * every existing id -- and therefore every saved edit -- survives.
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const crypto = require('crypto');

const rootDir = path.join(__dirname, '..', '..');

/**
 * Elements worth making editable.
 *
 * div is handled separately below rather than listed here: stamping every div
 * would bury a page in nested selection targets, since the layout is mostly
 * divs inside divs. Only the ones that actually carry something -- their own
 * text, or a background -- are worth clicking.
 */
const TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'a', 'img', 'button', 'section',
  'span', 'li', 'strong', 'em', 'small', 'label',
  'figcaption', 'blockquote', 'figure',
  'td', 'th', 'dt', 'dd',
  'article', 'header', 'footer', 'nav', 'aside',
  '.editable'
].join(', ');

function generateVid() {
  return 'v-' + crypto.randomBytes(4).toString('hex');
}

/** A div is worth stamping when it holds its own text or paints a background. */
function divIsWorthEditing($, el) {
  const $el = $(el);

  const hasOwnText = $el.contents().toArray()
    .some((c) => c.type === 'text' && c.data && c.data.trim().length > 1);
  if (hasOwnText) return true;

  const style = $el.attr('style') || '';
  if (/background-image\s*:/i.test(style)) return true;
  if (/background\s*:\s*(url|linear-gradient|radial-gradient)/i.test(style)) return true;

  return false;
}

function processHtmlFiles(dir) {
  const files = fs.readdirSync(dir);
  let modifiedCount = 0;
  let stampedTotal = 0;

  for (const file of files) {
    if (file === 'backend' || file === 'node_modules' || file.startsWith('.')) continue;

    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const res = processHtmlFiles(fullPath);
      modifiedCount += res.modifiedCount;
      stampedTotal += res.stampedTotal;
      continue;
    }
    if (!file.endsWith('.html')) continue;

    const html = fs.readFileSync(fullPath, 'utf8');
    const $ = cheerio.load(html, { decodeEntities: false });

    let stamped = 0;
    const stamp = (el) => {
      const $el = $(el);
      if ($el.attr('data-vid')) return;
      $el.attr('data-vid', generateVid());
      stamped++;
    };

    $(TAGS).each((i, el) => stamp(el));
    $('div').each((i, el) => { if (divIsWorthEditing($, el)) stamp(el); });

    if (stamped > 0) {
      fs.writeFileSync(fullPath, $.html(), 'utf8');
      console.log(`  ${file}: +${stamped}`);
      modifiedCount++;
      stampedTotal += stamped;
    }
  }
  return { modifiedCount, stampedTotal };
}

console.log('Stamping editable elements with data-vid...');
const { modifiedCount, stampedTotal } = processHtmlFiles(rootDir);
console.log(`Done. ${stampedTotal} new id(s) across ${modifiedCount} file(s).`);
