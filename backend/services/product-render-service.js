/**
 * The product page, rendered on the server.
 *
 * Why this exists
 * ---------------
 * product.html is one file serving every product, and until now everything a
 * shopper reads on it -- the title in the body, the price, the description, the
 * specifications, the questions -- was written by product-engine.js after the
 * page loaded. Worse, the container holding all of it ships as
 * `<div id="product-page" hidden>`, so a crawler that does not run JavaScript
 * was handed a loading skeleton and nothing else.
 *
 * Measured against the live site on 2026-09-10: two DIFFERENT product pages
 * carried 1,256 and 1,253 characters of server-rendered text and were 98%
 * identical -- four words apart, the title. Meanwhile the department pages,
 * whose cards are injected server-side by catalog-render-service.js, carried
 * 3,000-7,400 characters each. Search Console reported 3 pages indexed and 65
 * not, and 65 is very close to 57 products plus a handful of others.
 *
 * That is the whole story. Google can execute JavaScript, but it does so on a
 * second pass and rations that pass by how much it trusts a site; a new domain
 * whose pages are byte-for-byte identical before the script runs looks like 57
 * copies of one page, and duplicates do not get indexed. Nothing about titles,
 * canonicals, sitemaps or structured data fixes that -- they were all already
 * correct -- because the problem was never the head. It was the body.
 *
 * So the body is filled here, before the response leaves the server.
 *
 * On matching the client exactly
 * ------------------------------
 * Every string this writes is produced the same way product-engine.js produces
 * it, down to the wrapper classes and the fallback sentences. The engine still
 * runs and still rewrites all of it on load; if the two disagreed, a shopper
 * would watch the page change under them and -- far worse for the thing this
 * was built for -- Google would see one page and the visitor another, which is
 * cloaking. They must not drift, and test-product-server-render.js is what
 * keeps them from drifting.
 */

/** Escape text destined for HTML. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The same allow-list sanitiser product-engine.js applies to a description.
 *
 * The description is written in the admin's rich-text editor and is meant to
 * carry markup, so it cannot simply be escaped -- doing that printed the
 * operator's tags on the page as literal text. It is parsed with cheerio here
 * for the same reason the client parses with DOMParser: a real parser decides
 * what a tag is, and there is no regex to slip past with a malformed attribute.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'
]);

const KEPT_ATTRS = ['href', 'title', 'dir', 'lang'];

function sanitizeRichText(cheerio, value) {
  const html = String(value == null ? '' : value);
  if (!html.trim()) return '';

  const $ = cheerio.load('<div id="zs-root"></div>', null, false);
  const root = $('#zs-root');
  root.html(html);

  root.find('script, style, iframe, object, embed, form, input, textarea, link, meta').remove();

  // Depth-first, because unwrapping a parent moves its children.
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 20) {
    changed = false;
    root.find('*').each((_, el) => {
      const tag = (el.tagName || '').toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Keep the words, drop the tag -- an unknown wrapper should not delete
        // the sentence inside it.
        $(el).replaceWith($(el).contents());
        changed = true;
      }
    });
  }

  root.find('*').each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    const attribs = Object.assign({}, el.attribs || {});
    for (const name of Object.keys(attribs)) {
      const lower = name.toLowerCase();
      const val = String(attribs[name] == null ? '' : attribs[name]);
      const isSafeHref = tag === 'a' && lower === 'href' &&
        /^(https?:|mailto:|tel:|\/|#)/i.test(val.trim());
      if (lower.startsWith('on') || (!isSafeHref && (lower === 'href' || lower === 'src'))) {
        $(el).removeAttr(name);
      } else if (!KEPT_ATTRS.includes(lower)) {
        // No style, no class, no data-*: the page's own stylesheet decides how
        // a description looks, not whatever the editor pasted in.
        $(el).removeAttr(name);
      }
    }
    if (tag === 'a') {
      $(el).attr('rel', 'nofollow noopener');
      $(el).attr('target', '_blank');
    }
  });

  return root.html() || '';
}

/**
 * Prices, formatted the way the page formats them with no currency script
 * loaded. window.ZFB_CURRENCY converts to the visitor's chosen currency on the
 * client; the server has no visitor preference to read, and SAR is what the
 * structured data on the same page publishes, so the two agree.
 */
function formatPrice(value) {
  return Number(value || 0).toLocaleString('ar-SA') + ' ر.س';
}

function discountPercent(product) {
  const price = Number(product.price || 0);
  const oldPrice = Number(product.oldPrice || 0);
  if (!(oldPrice > price) || !price) return 0;
  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

/* The questions every product page answers when the operator has not written
   its own. Identical to product-engine.js -- see the note at the top about why
   these two must produce the same bytes. */
const DEFAULT_FAQ = [
  { q: 'ما هي مدة الضمان على هذا المنتج؟', a: 'يخضع المنتج لضمان شامل وموثق من متجر زياد ستور لمدة عام على الأقل مع توفير قطع الغيار الأصلية.' },
  { q: 'كيف يتم التوصيل والتركيب في صنعاء والمدن الأخرى؟', a: 'نوفر التوصيل بأسعار رمزية داخل المدن الرئيسية والمحافظات خلال 2-5 أيام عمل من تأكيد الطلب، مع خدمة تركيب حسب المنتج.' },
  { q: 'ما هي طرق الدفع المتاحة؟', a: 'يمكنك الدفع نقداً عند الاستلام، أو عبر بنك الكريمي، محفظة جوالي، كاش، أو التحويل البنكي المباشر.' }
];

/**
 * The delivery window shown beside the price.
 *
 * Identical rule to deliveryPromise() in product-engine.js, and it has to be:
 * the static markup said "2-5 أيام عمل" while the engine overwrote it on load
 * with a one-to-two-day claim, so Google was told two to five days and the shopper
 * was promised one to two, on the same page at the same moment.
 *
 * A per-product value is used only when it is plausibly a delivery time -- long
 * enough to be words, and carrying a digit. The column holds the single letter
 * "T" on ten products, and that rendered to customers verbatim as their
 * delivery estimate.
 */
const DELIVERY_PROMISE_AR = require('../config/constants').DELIVERY_FALLBACK_SAR.textAr;

function deliveryPromise(product) {
  const own = String(product.deliveryTime == null ? '' : product.deliveryTime).trim();
  if (own.length >= 4 && /[0-9٠-٩]/.test(own)) return own;
  return DELIVERY_PROMISE_AR;
}

const DEFAULT_DESCRIPTION =
  '<p>أثاث وأجهزة عالية الجودة من متجر زياد ستور، مصنعة وفق أرقى المعايير العالمية مع ضمان موثق.</p>';

/* Finishes this catalogue actually records, in the title or in the colour
   rows. Nothing is inferred beyond matching a word that is already there. */
const FINISH_WORDS = [
  ['ابيض', 'أبيض'], ['أبيض', 'أبيض'],
  ['اسود', 'أسود'], ['أسود', 'أسود'],
  ['ازرق', 'أزرق'], ['أزرق', 'أزرق'],
  ['رمادي', 'رمادي'], ['بني', 'بني'], ['بيج', 'بيج'],
  ['ذهبي', 'ذهبي'], ['فضي', 'فضي'], ['استيل', 'ستيل']
];

/**
 * A short factual paragraph built ONLY from what this product records.
 *
 * Why it is appended rather than written into the description:
 *
 * 57 products share 16 descriptions, so Google sees clusters of pages saying
 * the same thing and keeps one from each. The operator's copy is emoji-led
 * marketing that converts advertisement traffic, and replacing it across 41
 * live pages to fix a crawler problem would trade a real thing for a
 * speculative one. So the copy stays exactly as written and this is added
 * underneath it.
 *
 * Every clause comes from a filled-in field -- the finish named in the title
 * or the colour rows, the measurements in the specs table, the number of
 * photographs. No claim about material, workmanship or provenance, because
 * nothing in the row records those and nobody here has seen the furniture.
 *
 * No shared service sentence. Delivery, warranty and payment already appear in
 * the trust row and the questions below; repeating them here would be the same
 * boilerplate on every page, and the duplicate problem back in a new costume.
 */
function factsParagraph(product) {
  const bits = [];

  const hay = String(product.title || '') + ' ' +
    (Array.isArray(product.colors) ? product.colors.map((c) => c.name || c).join(' ') : '');
  const finishes = [];
  for (const [needle, label] of FINISH_WORDS) {
    if (hay.includes(needle) && !finishes.includes(label)) finishes.push(label);
  }
  if (finishes.length) bits.push('اللون/التشطيب: ' + finishes.join('، ') + '.');

  const specs = Array.isArray(product.specs) ? product.specs : [];
  const dims = specs
    .filter((s) => String(s.label || '').trim() && String(s.value || '').trim())
    .map((s) => String(s.label).trim() + ' ' + String(s.value).trim());
  if (dims.length) bits.push('المقاسات: ' + dims.join('، ') + '.');

  const shots = Array.isArray(product.gallery) ? product.gallery.length : 0;
  if (shots >= 2) bits.push(shots + ' صور حقيقية لهذه القطعة من داخل المعرض.');

  if (!bits.length) return '';
  return '<p class="product-facts">' + esc(bits.join(' ')) + '</p>';
}

/**
 * Fill the product page's body with this product, and reveal it.
 *
 * @param {CheerioAPI} $        the loaded page
 * @param {object} product      one row of the storefront catalogue
 * @param {object} cheerio      the cheerio module, for the sanitiser's own parse
 * @returns {object|null}       what was written, for logging and tests
 */
function injectProductBody($, product, cheerio) {
  if (!product) return null;

  const page = $('#product-page');
  if (!page.length) return null;

  const written = {};

  // --- the name, which is the one thing that was already unique -----------
  const titleEl = $('#product-title');
  if (titleEl.length) {
    titleEl.text(String(product.title || ''));
    written.title = true;
  }

  // --- price, and the saving if there is one ------------------------------
  const priceEl = $('#product-current-price');
  if (priceEl.length) {
    priceEl.text(formatPrice(product.price));
    written.price = true;
  }

  const percent = discountPercent(product);
  const oldPriceEl = $('#product-old-price');
  const savingEl = $('#product-saving');
  const badgeEl = $('#product-discount-badge');

  if (percent > 0) {
    const saving = Number(product.oldPrice || 0) - Number(product.price || 0);
    if (oldPriceEl.length) oldPriceEl.text(formatPrice(product.oldPrice)).removeAttr('hidden');
    if (savingEl.length) savingEl.text('وفر ' + formatPrice(saving)).removeAttr('hidden');
    if (badgeEl.length) badgeEl.text('-' + percent + '%').removeAttr('hidden');
    written.discount = percent;
  } else {
    // Absent, not empty: a shopper must never see an empty "you save" chip.
    if (oldPriceEl.length) oldPriceEl.attr('hidden', 'hidden');
    if (savingEl.length) savingEl.attr('hidden', 'hidden');
    if (badgeEl.length) badgeEl.attr('hidden', 'hidden');
  }

  // --- the facts beside the price -----------------------------------------
  const setText = (selector, value, fallback) => {
    const el = $(selector);
    if (!el.length) return;
    const text = String(value == null ? '' : value).trim();
    el.text(text || fallback);
  };
  setText('#product-brand', product.brand, 'غير محدد');
  setText('#product-origin', product.origin, 'غير محدد');
  setText('#product-sku', product.sku || product.product_id || product.id, '—');

  /* The delivery window, written server-side so the crawler and the shopper
     are promised the same thing. The engine rewrites this on load with the
     identical rule. */
  const shipTrust = $('#trust-shipping');
  if (shipTrust.length) {
    const line = shipTrust.find('small').first();
    if (line.length) line.text(deliveryPromise(product));
    written.delivery = deliveryPromise(product);
  }

  // --- the description, which is most of the words on the page ------------
  const descEl = $('#product-description');
  if (descEl.length) {
    const clean = sanitizeRichText(cheerio, product.description);
    // The operator's copy, untouched, followed by this product's own facts.
    const facts = factsParagraph(product);
    descEl.html((clean || DEFAULT_DESCRIPTION) + facts);
    written.descriptionChars = (clean || DEFAULT_DESCRIPTION).length;
    written.facts = facts.length > 0;
  }

  // --- specifications, the other half ------------------------------------
  const specs = Array.isArray(product.specs) ? product.specs : [];

  const quickSpecs = $('#product-quick-specs');
  if (quickSpecs.length) {
    quickSpecs.html(specs.slice(0, 6).map((spec) => `
          <div class="product-quick-meta">
            <dt>${esc(spec.label)}</dt>
            <dd>${esc(spec.value)}</dd>
          </div>
        `).join(''));
  }

  const specsTable = $('#product-specs-table');
  if (specsTable.length) {
    specsTable.html(specs.map((spec) => `
            <div class="product-spec-row">
              <dt>${esc(spec.label)}</dt>
              <dd>${esc(spec.value)}</dd>
            </div>
          `).join(''));
    written.specs = specs.length;
  }

  // --- the questions ------------------------------------------------------
  const faqList = $('#product-faq-list');
  if (faqList.length) {
    const faq = Array.isArray(product.faq) && product.faq.length ? product.faq : DEFAULT_FAQ;
    faqList.html(faq.map((item) => `
            <details class="product-faq-item">
              <summary>${esc(item.q)}</summary>
              <p>${esc(item.a)}</p>
            </details>
          `).join(''));
    written.faq = faq.length;
  }

  /* --- and reveal it ------------------------------------------------------
   *
   * The same two switches product-engine.js flips in its finally block. Without
   * these the page is filled and still invisible, which is the state that
   * started all this.
   */
  page.removeAttr('hidden');
  $('#product-loading').attr('style', 'display:none');
  written.revealed = true;

  return written;
}

module.exports = { injectProductBody, sanitizeRichText, formatPrice, discountPercent };
