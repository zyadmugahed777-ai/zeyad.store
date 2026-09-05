/**
 * Renders a department page's product grid from the database.
 *
 * The problem this solves
 * ----------------------
 * Every storefront catalog page ships its products as hardcoded
 * <article class="product-card"> elements baked into the HTML file. A product
 * created in the admin panel and assigned to "الأجهزة المنزلية" could therefore
 * never appear on the appliances page by any mechanism -- it showed up only in
 * search, which matches on title against products_db.json. That is why adding a
 * product looked like it did nothing.
 *
 * The fix replaces the contents of each page's MAIN product grid with cards
 * built from the database, using markup byte-compatible with what the page
 * already contained: same <article class="product-card">, same data-* attributes,
 * same inner structure, same class names. Nothing about the page's CSS, layout
 * or design changes -- only where the products come from.
 *
 * Secondary grids on those pages (today's offers, promo rows, bundles) are
 * deliberately left alone. They are curated marketing strips, not the catalog.
 */

/**
 * Which department each page lists, and the grid that holds its catalog.
 *
 * The selectors were read off the live HTML, not guessed: every page was parsed
 * and its product-card parents enumerated. Where a page has several grids, the
 * one named here is the largest -- the actual catalog -- and the rest are left
 * as they are.
 */
const PAGE_MAP = {
  'appliances':            { department: 'home-appliances', grid: 'div.mini-product-grid' },
  'appliances-catalog':    { department: 'home-appliances', grid: 'div.mini-product-grid' },
  'appliances_test':       { department: 'home-appliances', grid: 'div.mini-product-grid' },

  'bedrooms':              { department: 'bedrooms', grid: 'div.product-grid.bedrooms-dense-grid' },
  'bedrooms-catalog':      { department: 'bedrooms', grid: 'div.product-grid.bedrooms-dense-grid' },
  'kids-rooms':            { department: 'bedrooms', grid: 'div.product-grid.bedrooms-dense-grid' },

  'majalis':               { department: 'living-rooms', grid: 'div.product-grid.majalis-product-grid' },
  'majalis-catalog':       { department: 'living-rooms', grid: 'div.product-grid.majalis-product-grid' },

  'kitchens':              { department: 'kitchens', grid: 'div.kitchen-products-grid' },
  'kitchens-catalog':      { department: 'kitchens', grid: 'div.kitchen-products-grid' },
  'kitchens-modern':       { department: 'kitchens', grid: 'div.kitchen-products-grid' },
  'kitchens-classic':      { department: 'kitchens', grid: 'div.kitchen-products-grid' },
  'kitchen-accessories':   { department: 'kitchens', grid: 'div.kitchen-products-grid' },

  'furniture':             { department: 'furniture', grid: 'div.product-grid.furniture-product-grid.dense-six' },
  'furniture-catalog':     { department: 'furniture', grid: 'div.product-grid.furniture-product-grid.dense-six' },
  'couches':               { department: 'furniture', grid: 'div.product-grid.furniture-product-grid.dense-six' },

  'solar':                 { department: 'solar-energy', grid: 'div.solar-commerce-grid' },
  'solar-catalog':         { department: 'solar-energy', grid: 'div.solar-commerce-grid' },
  'solar-solutions':       { department: 'solar-energy', grid: 'div.products-area' }
};

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return v.toLocaleString('en-US');
}

/**
 * One product card, matching the markup already present on these pages.
 *
 * data-category carries the category slug rather than the old short code, so
 * the category filter strips can match on the same value the admin stores.
 * data-category-code keeps the legacy code alongside it for any older script
 * still keying off that.
 *
 * None of the controls carry position:static inline any more either. That
 * declaration outranked the stylesheet, so the buttons were not positioned
 * ancestors -- and the invisible hit-area pseudo-element that gives them a
 * 44px touch target resolved its 100% against the CARD instead. Measured: the
 * compare button's effective tap area was 278x507, the whole card, sitting
 * over the product link and intercepting taps meant for it.
 *
 * The photo carries no inline sizing. It used to ship
 * style="...object-fit:cover..." on every card, and an inline declaration beats
 * any stylesheet rule without !important -- so the shop was cropping 47% off
 * every product image and no CSS could correct it. Sizing now lives in
 * mobile-first.css where it can be reasoned about and overridden, and the
 * anchor's aria-label says the product's name rather than "product-photo-link".
 */
function renderCard(p) {
  const id = esc(p.id || p.product_id);
  const title = esc(p.title || '');
  const img = esc(p.image || p.main_image || '/assets/placeholder.svg');
  const price = money(p.price);
  const old = p.oldPrice && Number(p.oldPrice) > Number(p.price) ? money(p.oldPrice) : '';
  const discount = old
    ? Math.round((1 - Number(p.price) / Number(p.oldPrice)) * 100)
    : 0;
  const inStock = String(p.stock_status || 'in-stock') !== 'out-of-stock';
  const desc = esc(p.subcategory || p.categoryName || '');

  return `
          <article class="product-card" data-product-id="${id}" data-category="${esc(p.categorySlug || '')}" data-category-code="${esc(p.categoryCode || '')}" data-department="${esc(p.departmentSlug || '')}" data-stock="${inStock ? 'in-stock' : 'out-of-stock'}" data-price="${esc(p.price)}" data-brand="${esc(p.brand || '')}" data-subcategory="catalog" data-sku="${esc(p.sku || '')}">
  <a href="product.html?id=${id}" class="product-photo-link" aria-label="${title}">
    <img src="${img}" alt="${title}" loading="lazy" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
  </a>
  <div class="product-body">
    <h3>${title}</h3>
    <p class="product-desc">${desc}</p>
    <div class="price">
      <strong>${price} ر.س</strong>
      ${old ? `<del>${old}</del>` : ''}
      ${discount > 0 ? `<span class="discount-tag tag-gold" style="display:inline-block; margin-right:8px;">${discount}%</span>` : ''}
    </div>
    <div class="stock" style="margin-top:auto;">
      <span>${inStock ? 'متوفر' : 'غير متوفر'}</span>
      <div style="display:flex; gap:8px;"><button type="button" class="btn-compare" aria-label="المقارنة" style="margin-left: 8px; background:none; border:none; cursor:pointer;" onclick="window.ZFB &amp;&amp; window.ZFB.Compare &amp;&amp; window.ZFB.Compare.toggle(window.productFromElement ? window.productFromElement(this) : {id: this.closest('[data-product-id]').getAttribute('data-product-id')})"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 21h5v-5M21 3l-7 7M3 21l7-7"></path></svg></button>
        <button type="button" class="wish" aria-label="المفضلة"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"></path></svg></button>
        <button type="button" class="btn-primary btn-add-cart-mini" onclick="addToCart(this, event)">إضافة للسلة</button>
      </div>
    </div>
  </div>
</article>`;
}

/**
 * Replace a page's catalog grid with database-backed cards.
 *
 * @param {CheerioAPI} $        the loaded page
 * @param {string} slug         page slug, e.g. 'appliances-catalog'
 * @param {Array} allProducts   the storefront product list
 * @param {string} [categorySlug] filter to one category, from ?category=
 * @returns {{rendered:number, department:string}|null} null when the page has no catalog
 */
function injectCatalog($, slug, allProducts, categorySlug) {
  const spec = PAGE_MAP[slug];
  if (!spec) return null;

  const grid = $(spec.grid).first();
  if (!grid.length) return null;

  /* Marks this as a DEPARTMENT catalogue grid. The storefront gives these a
     different rhythm from an ordinary grid -- rows of two with a band of wide
     feature cards every so often -- and the home page must keep the plain grid
     it has always had. Marking it here is the only place that knows which is
     which, and it costs one attribute. */
  grid.attr('data-zs-catalog-grid', '');

  const inDepartment = (allProducts || []).filter(
    // showInDepartment is how an operator keeps a special-order or
    // enquiry-only product out of the browsable catalogue without
    // deactivating it -- its own page still opens from a direct link.
    (p) => p.departmentSlug && p.departmentSlug === spec.department && p.showInDepartment !== false
  );

  // Filtering happens on the server so a category link works with no
  // JavaScript at all -- which matters when most visits are on a phone.
  const products = categorySlug
    ? inDepartment.filter((p) => p.categorySlug === categorySlug)
    : inDepartment;

  // With no filter, an empty result must never blank a page that currently
  // shows something -- leaving the existing markup is the safer failure. With
  // a filter the operator explicitly asked for one category, so an honest
  // "nothing here" beats silently showing the whole department.
  if (products.length === 0 && !categorySlug) return null;

  if (products.length === 0) {
    grid.empty();
    grid.append(`<p style="grid-column:1/-1; padding:32px 8px; text-align:center; color:var(--text-muted,#756b5f);">لا توجد منتجات في هذه الفئة بعد.</p>`);
    return { rendered: 0, department: spec.department };
  }

  grid.empty();
  grid.append(products.map(renderCard).join(''));

  // Keep any "N products" badge on the page honest.
  const count = products.length;
  $('.catalog-count, .catalog-count-badge, [data-product-count]').each((i, el) => {
    const text = $(el).text();
    if (/\d/.test(text)) $(el).text(text.replace(/\d[\d,]*/, String(count)));
  });

  return { rendered: count, department: spec.department };
}

module.exports = { injectCatalog, renderCard, PAGE_MAP };
