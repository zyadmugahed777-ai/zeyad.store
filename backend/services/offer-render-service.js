/**
 * Server-side markup for offers placed on storefront pages.
 *
 * Design constraint
 * -----------------
 * Not one storefront HTML file is edited to make offers appear. The blocks
 * below are injected by middleware into the page the server already parses,
 * so the site's own files, layout and stylesheets are untouched.
 *
 * Everything is styled from the storefront's existing design tokens
 * (--bg-card, --text-primary, --border-color, --gold, ...), declared in
 * styles.css for both the light and dark themes. That means an injected offer
 * follows the site's palette and theme switch without importing a stylesheet,
 * without a class that could collide with existing CSS, and without any rule
 * that could reach outside the block and alter an existing element.
 */

/** Escape text destined for HTML content. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only allow links that stay on the site or use a safe scheme. An offer link
 * is operator-supplied text, and it is about to become an href on every page.
 */
function safeHref(link) {
  const raw = String(link || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw)) return esc(raw);
  if (/^\//.test(raw) || /^[\w.-]+\.html(\?|#|$)/i.test(raw)) return esc(raw);
  if (/^(mailto|tel):/i.test(raw)) return esc(raw);
  // Anything else (javascript:, data:, ...) is dropped rather than rendered.
  return '';
}

/** "خصم 20%" / "خصم 50 ر.س" -- or nothing when the offer carries no discount. */
function discountLabel(offer) {
  if (offer.discountType === 'percentage' && offer.discountValue > 0) {
    return `خصم ${offer.discountValue}%`;
  }
  if (offer.discountAmount > 0) {
    return `خصم ${Number(offer.discountAmount).toLocaleString('ar-SA')} ر.س`;
  }
  if (offer.discountValue > 0) {
    return `خصم ${Number(offer.discountValue).toLocaleString('ar-SA')}`;
  }
  return '';
}

function renderOffer(offer) {
  const href = safeHref(offer.link);
  const discount = discountLabel(offer);
  const cta = esc(offer.buttonText || 'تسوق الآن');

  const media = offer.image
    ? `<img src="${esc(offer.image)}" alt="${esc(offer.title)}" loading="lazy"
           style="width:100%;height:160px;object-fit:cover;display:block;">`
    : '';

  const coupon = offer.couponCode
    ? `<span style="display:inline-block;padding:4px 10px;border:1px dashed var(--gold,#c79a52);
             border-radius:6px;font-family:monospace;font-size:.85rem;letter-spacing:.05em;
             color:var(--gold,#c79a52);">${esc(offer.couponCode)}</span>`
    : '';

  const minOrder = offer.minOrder
    ? `<small style="color:var(--text-muted,#756b5f);font-size:.78rem;">
         الحد الأدنى للطلب ${Number(offer.minOrder).toLocaleString('ar-SA')}
       </small>`
    : '';

  const button = href
    ? `<a href="${href}" style="display:inline-block;margin-top:auto;padding:9px 18px;
           border-radius:8px;background:var(--gold,#c79a52);color:#1c1813;font-weight:700;
           text-decoration:none;font-size:.9rem;">${cta}</a>`
    : '';

  return `
    <article style="display:flex;flex-direction:column;overflow:hidden;
                    background:var(--bg-card,#fff);border:1px solid var(--border-color,#e3d5c3);
                    border-radius:14px;">
      ${media}
      <div style="display:flex;flex-direction:column;gap:8px;padding:16px;flex:1;">
        ${discount ? `<span style="align-self:flex-start;padding:3px 10px;border-radius:999px;
             background:var(--gold,#c79a52);color:#1c1813;font-weight:700;font-size:.8rem;">
             ${esc(discount)}</span>` : ''}
        <h3 style="margin:0;font-size:1.05rem;color:var(--text-primary,#1c1813);">${esc(offer.title)}</h3>
        ${offer.description ? `<p style="margin:0;font-size:.88rem;line-height:1.7;
             color:var(--text-secondary,#3e342b);">${esc(offer.description)}</p>` : ''}
        ${coupon}
        ${minOrder}
        ${button}
      </div>
    </article>`;
}

/**
 * A whole offers strip, or '' when there is nothing to show.
 *
 * @param {Array} offers
 * @param {'top'|'bottom'} position
 */
function renderOffersSection(offers, position) {
  if (!offers || offers.length === 0) return '';

  const heading = position === 'top' ? 'عروض وخصومات' : 'لا تفوّت هذه العروض';

  return `
    <section data-zfb-offers="${position}" aria-label="${heading}"
             style="max-width:1280px;margin:32px auto;padding:0 16px;">
      <h2 style="margin:0 0 16px;font-size:1.25rem;color:var(--text-primary,#1c1813);">${heading}</h2>
      <div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));">
        ${offers.map(renderOffer).join('')}
      </div>
    </section>`;
}

module.exports = { renderOffersSection, renderOffer, safeHref, discountLabel, esc };
