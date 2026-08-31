/**
 * Rebuilds a department page's category tiles from the database.
 *
 * The problem
 * -----------
 * The category strips were hardcoded per page and had drifted badly from
 * reality. On the appliances page, of 20 tiles:
 *   - ten named categories that exist nowhere in the database
 *     (ماكينات قهوة, برادات مياه, مكانس, مراوح, سخانات, مكاوي, غلايات,
 *      سماعات, عصارات, قلايات هوائية)
 *   - fifteen linked to offers.html, i.e. they were not filters at all
 *   - the five that did carry ?category= used English slugs (refrigerators,
 *     washers, tvs) that match nothing the admin stores (ثلاجات, غسالات, شاشات)
 * Meanwhile the department's nine real categories were nowhere to be seen.
 *
 * The approach
 * ------------
 * Each page styles its tiles differently -- appliances uses an icon circle and
 * a span, kitchens an image block with a strong and a sub-label, solar another
 * icon variant. Rather than impose one markup and change three designs, the
 * FIRST existing tile is taken as a template and cloned per category, with only
 * the label text and href rewritten. Whatever the page looked like, it still
 * looks like that -- the icons, classes and structure are the page's own.
 *
 * Pages that never had a strip get a plain one built from the site's own design
 * tokens, so it inherits the palette and both themes without new CSS.
 */

/** Which strip belongs to which page, read off the live HTML. */
const STRIPS = {
  'appliances':          '.appliances-categories',
  'appliances-catalog':  '.appliances-categories',
  'appliances_test':     '.appliances-categories',
  'kitchens':            '.kitchen-categories-grid',
  'kitchens-catalog':    '.kitchen-categories-grid',
  'kitchens-modern':     '.kitchen-categories-grid',
  'kitchens-classic':    '.kitchen-categories-grid',
  'kitchen-accessories': '.kitchen-categories-grid',
  'solar':               '.category-icons-grid',
  'solar-catalog':       '.category-icons-grid'
};

/** Pages with no strip at all: where to put a new one. */
const FALLBACK_ANCHOR = {
  'bedrooms':          'div.product-grid.bedrooms-dense-grid',
  'bedrooms-catalog':  'div.product-grid.bedrooms-dense-grid',
  'kids-rooms':        'div.product-grid.bedrooms-dense-grid',
  'majalis':           'div.product-grid.majalis-product-grid',
  'majalis-catalog':   'div.product-grid.majalis-product-grid',
  'furniture':         'div.product-grid.furniture-product-grid.dense-six',
  'furniture-catalog': 'div.product-grid.furniture-product-grid.dense-six',
  'couches':           'div.product-grid.furniture-product-grid.dense-six'
};

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Highlight for the selected tile, drawn from the site's own tokens. */
const ACTIVE_STYLE = 'outline:2px solid var(--gold,#c79a52); outline-offset:2px; border-radius:12px;';

/**
 * Write a tile's label without disturbing its icon or structure.
 * Tiles come in two shapes: a <strong> headline with a <span> sub-label, or a
 * bare <span>. Both are handled so no page loses its look.
 */
function setLabel($, node, name, sub) {
  const strong = node.find('strong').first();
  if (strong.length) {
    strong.text(name);
    const span = node.find('span').first();
    if (span.length) span.text(sub);
    return;
  }
  const span = node.find('span').first();
  if (span.length) span.text(name);
  else node.append(`<span>${esc(name)}</span>`);
}

/*
 * Put the category's own picture in the tile.
 *
 * The appliances, kitchens and solar pages each draw their categories with an
 * icon holder -- a circle or a block containing one inline SVG. Every tile on a
 * page shipped the SAME glyph, so nine categories were nine identical drawings
 * with different words under them: a symbol where a product should be.
 *
 * When the operator has uploaded an image for the category it replaces the
 * glyph. A transparent PNG of an actual oven says "أفران" instantly; a generic
 * outline says nothing. Categories with no image keep the glyph, so nothing
 * breaks before anyone uploads anything, and the storefront never invents a
 * picture for a category that has none.
 */
/*
 * Distinct glyphs for the categories this shop actually sells, used until the
 * operator uploads a real picture.
 *
 * Every tile on a page was cloned from the first one, so all nine categories
 * drew the SAME outline -- "ثلاجات" and "غسالات" and "أفران" were three copies
 * of one rectangle. A drawing that is wrong for eight of nine categories is
 * worse than no drawing: it tells the customer the page is broken.
 *
 * Matched on the Arabic name, so a category the shop invents later simply falls
 * back to a neutral tag glyph rather than borrowing someone else's.
 */
const CATEGORY_GLYPHS = [
  [/ثلاج|براد/,            '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M9 6v2M9 13v3"/>'],
  [/غسال/,                 '<rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M8 6h.01M11 6h.01"/>'],
  [/شاش|تلفز|تلفاز/,       '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'],
  [/مكيف|تكييف/,           '<rect x="2" y="4" width="20" height="8" rx="2"/><path d="M6 16v2M12 16v3M18 16v2"/>'],
  [/فرن|أفران|بوتاجاز|غاز/, '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="14" r="3.5"/><path d="M7 7h.01M11 7h.01M15 7h.01"/>'],
  [/ميكرويف|مايكرويف/,     '<rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="10" height="8" rx="1"/><path d="M18.5 9v6"/>'],
  [/خلاط|عصار/,            '<path d="M8 3h8l-1 7H9z"/><path d="M9 10h6l1 8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/>'],
  [/سرير|نوم/,             '<path d="M3 18V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9M3 13h18M3 18v2M21 18v2"/><circle cx="7.5" cy="10.5" r="1.5"/>'],
  [/دولاب|خزان|خزائن/,     '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 2v20M9 11h.01M15 11h.01"/>'],
  [/كنب|مجلس|مجالس|جلس/,   '<path d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 12h20v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><path d="M6 19v2M18 19v2"/>'],
  [/طاول|طاولات/,          '<path d="M3 8h18M5 8v12M19 8v12M3 8l2-3h14l2 3"/>'],
  [/كرسي|كراسي/,           '<path d="M6 3v8h12V3M6 11h12l1 6H5zM7 17v4M17 17v4"/>'],
  [/مكتب|مكاتب/,           '<path d="M3 7h18v3H3zM5 10v10M19 10v10M8 13h6"/>'],
  [/لوح|ألواح|شمس/,        '<path d="M4 4h16l2 10H2zM12 14v6M8 20h8"/><path d="M8 4l-1 10M16 4l1 10M3 9h18"/>'],
  [/بطار/,                 '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4M6 10v4M10 10v4"/>'],
  [/انفرتر|محول|محولات/,   '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m11 8-3 5h4l-1 4"/>'],
  [/منظم|شحن/,             '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m12 7-2.5 5h5L12 17"/>'],
  [/إضاء|اضاء|لمب|مصباح/,  '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3 11v2h6v-2a6 6 0 0 0-3-11z"/>'],
  [/اكسسوار|إكسسوار/,      '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'],
];

const DEFAULT_GLYPH = '<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8l8.6 8.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>';

function glyphFor(name) {
  const n = String(name || '');
  for (const [re, path] of CATEGORY_GLYPHS) {
    if (re.test(n)) return path;
  }
  return DEFAULT_GLYPH;
}

/*
 * Put the category's own picture in the tile, or failing that a glyph that at
 * least depicts the right thing.
 *
 * When the operator has uploaded an image it wins: a transparent PNG of an
 * actual oven says "أفران" instantly. Until then the category gets a drawing
 * chosen for it rather than the one that happened to be first on the page.
 */
function setTileImage($, node, c) {
  const holder = node.find('.icon-circle, .cat-icon, .category-icon').first();
  const target = holder.length ? holder : node.find('svg').first().parent();
  if (!target.length) return;

  const src = (c && c.image ? String(c.image) : '').trim();
  if (src) {
    target.addClass('zs-cat-photo');
    target.empty();
    target.append(
      `<img src="${esc(src)}" alt="${esc(c.name || '')}" loading="lazy" decoding="async">`
    );
    return;
  }

  const svg = target.find('svg').first();
  if (svg.length) svg.html(glyphFor(c && c.name));
}

function countLabel(n) {
  if (!n) return 'لا توجد منتجات';
  if (n === 1) return 'منتج واحد';
  if (n === 2) return 'منتجان';
  if (n <= 10) return `${n} منتجات`;
  return `${n} منتج`;
}

/**
 * @param {CheerioAPI} $
 * @param {string} slug          page slug
 * @param {Array} categories     the department's categories, with counts
 * @param {string} activeSlug    currently filtered category, or ''
 * @returns {{rendered:number}|null}
 */
function injectCategoryStrip($, slug, categories, activeSlug, gridSelector) {
  if (!categories || categories.length === 0) return null;

  const page = slug + '.html';
  const link = (catSlug) => catSlug ? `${page}?category=${encodeURIComponent(catSlug)}` : page;

  /* A page that declares [data-zs-categories] wants the designed, image-led
     tiles rather than a row of text pills. It is opt-in per page, so no page
     changes appearance until its markup asks for it. */
  const mount = $('[data-zs-categories] [data-zs-cat-rail]').first();
  if (mount.length) {
    renderCategoryTiles($, mount, categories, activeSlug, link);
    renderFilterBar($, slug, categories, activeSlug, link, gridSelector);
    return { rendered: categories.length };
  }

  const selector = STRIPS[slug];
  const strip = selector ? $(selector).first() : $();

  if (strip.length && strip.children().length) {
    // Clone the page's own tile so the design is untouched.
    const template = $.html(strip.children().first());
    strip.empty();

    const all = $(template);
    all.attr('href', link(''));
    all.attr('data-category', '');
    setLabel($, all, 'جميع الفئات', countLabel(categories.reduce((s, c) => s + (c.productCount || 0), 0)));
    if (!activeSlug) all.attr('style', ((all.attr('style') || '') + ';' + ACTIVE_STYLE).replace(/^;/, ''));
    strip.append(all);

    for (const c of categories) {
      const node = $(template);
      node.attr('href', link(c.slug));
      node.attr('data-category', c.slug || '');
      // The visual editor keys off data-vid; a cloned tile must not duplicate
      // the template's id or edits would land on every tile at once.
      node.removeAttr('data-vid');
      node.find('[data-vid]').removeAttr('data-vid');
      setLabel($, node, c.name, countLabel(c.productCount || 0));
      setTileImage($, node, c);
      if (activeSlug && c.slug === activeSlug) {
        node.attr('style', ((node.attr('style') || '') + ';' + ACTIVE_STYLE).replace(/^;/, ''));
      }
      strip.append(node);
    }
    return { rendered: categories.length };
  }

  // No strip on this page: build a plain one from the site's design tokens.
  // The caller passes the grid selector from catalog-render-service's PAGE_MAP,
  // which knows all 19 department pages; FALLBACK_ANCHOR is only a backstop for
  // a caller that does not supply one.
  const anchorSel = gridSelector || FALLBACK_ANCHOR[slug];
  if (!anchorSel) return null;
  const anchor = $(anchorSel).first();
  if (!anchor.length) return null;

  // data-category is deliberately empty on the "all" chip: it is the absence of
  // a filter, not a category. Putting its label there made it look like a
  // category slug to anything reading the attribute.
  const chip = (href, label, count, active) => `
      <a href="${esc(href)}" data-category=""
         style="display:inline-flex; flex-direction:column; gap:2px; padding:8px 16px; border-radius:999px;
                border:1px solid var(--border-color,#e3d5c3); background:var(--bg-card,#fff);
                color:var(--text-primary,#1c1813); text-decoration:none; font-size:.9rem; white-space:nowrap;
                ${active ? ACTIVE_STYLE : ''}">
        <span style="font-weight:600;">${esc(label)}</span>
        ${count !== null ? `<small style="color:var(--text-muted,#756b5f); font-size:.72rem;">${esc(countLabel(count))}</small>` : ''}
      </a>`;

  const total = categories.reduce((s, c) => s + (c.productCount || 0), 0);
  const html = `
    <nav data-zfb-category-strip aria-label="تصفية حسب الفئة"
         style="display:flex; gap:10px; overflow-x:auto; padding:4px 2px 14px; margin-bottom:8px; -webkit-overflow-scrolling:touch;">
      ${chip(link(''), 'جميع الفئات', total, !activeSlug)}
      ${categories.map((c) => `
      <a href="${esc(link(c.slug))}" data-category="${esc(c.slug || '')}"
         style="display:inline-flex; flex-direction:column; gap:2px; padding:8px 16px; border-radius:999px;
                border:1px solid var(--border-color,#e3d5c3); background:var(--bg-card,#fff);
                color:var(--text-primary,#1c1813); text-decoration:none; font-size:.9rem; white-space:nowrap;
                ${activeSlug && c.slug === activeSlug ? ACTIVE_STYLE : ''}">
        <span style="font-weight:600;">${esc(c.name)}</span>
        <small style="color:var(--text-muted,#756b5f); font-size:.72rem;">${esc(countLabel(c.productCount || 0))}</small>
      </a>`).join('')}
    </nav>`;

  anchor.before(html);
  return { rendered: categories.length };
}

/**
 * The designed category tiles: a photograph per category, its name, and how
 * many products are actually in it.
 *
 * Each tile is a real <a href="?category=slug">, so the filter works with no
 * JavaScript at all and every category is a crawlable, shareable URL.
 * storefront-2026.js upgrades the same links to filter in place.
 *
 * The image is whatever the operator uploaded for that category in the admin.
 * There is no fallback artwork invented here: a category with no image gets a
 * lettered plate built from its own name, which is honest and still looks
 * deliberate, rather than a stock photo of something the shop may not sell.
 */
/**
 * The picture that represents a category: the one its operator uploaded, or a
 * photograph of something actually in it, or nothing. Never stock artwork.
 */
function tileImage(c) {
  const own = String((c && c.image) || '').trim();
  if (own && !/placeholder\.svg$/i.test(own)) return own;
  const fallback = String((c && c.fallbackImage) || '').trim();
  return (fallback && !/placeholder\.svg$/i.test(fallback)) ? fallback : '';
}

/*
 * How a category is drawn. A small closed set, not a styling language:
 *
 *   card     a photograph with the name under it -- lifestyle categories
 *   circle   a round crop -- reads well for a dense row of many categories
 *   pill     name only, no image -- for categories that have no good picture
 *   compact  a small square with the name beside it -- dense, image-led
 *
 * The renderer only ever emits a class name; every visual decision lives in
 * storefront-2026.css. An unrecognised value falls back to 'card', so a bad
 * value degrades to the default rather than to a blank tile.
 */
const PRESENTATIONS = new Set(['card', 'circle', 'pill', 'compact']);

function presentationOf(categories) {
  /* One presentation per rail, taken from the first category that expresses a
     preference. Mixing shapes inside a single row reads as a rendering bug
     rather than as a design, and every category in a department belongs to the
     same row. */
  for (const c of categories) {
    const style = String((c && c.displayStyle) || '').trim();
    if (PRESENTATIONS.has(style)) return style;
  }
  return 'card';
}

function renderCategoryTiles($, mount, categories, activeSlug, link) {
  const presentation = presentationOf(categories);
  mount.attr('data-presentation', presentation);

  const tiles = categories.map((c) => {
    const img = tileImage(c);
    const hasImage = !!img;
    const initial = esc(String(c.name || '؟').trim().charAt(0));
    const isActive = !!activeSlug && c.slug === activeSlug;

    return `
      <a class="zs-cat-tile${isActive ? ' is-active' : ''}"
         href="${esc(link(c.slug))}"
         data-category="${esc(c.slug || '')}"
         aria-current="${isActive ? 'true' : 'false'}">
        ${presentation === 'pill' ? '' : `<span class="zs-cat-media">
          ${hasImage
            ? `<img src="${esc(img)}" alt="${esc(c.name)}" loading="lazy" decoding="async">`
            : `<span class="zs-cat-initial" aria-hidden="true">${initial}</span>`}
        </span>`}
        <span class="zs-cat-label">
          <strong>${esc(c.name)}</strong>
          <small>${esc(countLabel(c.productCount || 0))}</small>
        </span>
      </a>`;
  });

  // "الكل" is the absence of a filter, not a category: no image, no count of
  // its own beyond the department total.
  const total = categories.reduce((s, c) => s + (c.productCount || 0), 0);
  const all = `
      <a class="zs-cat-tile zs-cat-tile-all${activeSlug ? '' : ' is-active'}"
         href="${esc(link(''))}" data-category=""
         aria-current="${activeSlug ? 'false' : 'true'}">
        ${presentation === 'pill' ? '' : '<span class="zs-cat-media"><span class="zs-cat-initial" aria-hidden="true">◇</span></span>'}
        <span class="zs-cat-label">
          <strong>كل الفئات</strong>
          <small>${esc(countLabel(total))}</small>
        </span>
      </a>`;

  mount.html(all + tiles.join(''));
}

/**
 * A compact chip rail immediately above the results.
 *
 * The tiles sit high on the page beside the hero. Once a customer has scrolled
 * into the grid, switching category should not mean scrolling back up, so the
 * same choices are repeated here as chips, and the active one is named in the
 * results heading so the page always says what it is showing.
 */
function renderFilterBar($, slug, categories, activeSlug, link, gridSelector) {
  const anchorSel = gridSelector || FALLBACK_ANCHOR[slug];
  if (!anchorSel) return;
  const grid = $(anchorSel).first();
  if (!grid.length) return;
  if ($('[data-zs-filter-bar]').length) return;

  /* The bar goes before the whole SECTION, not before the grid inside it.
     When a category turns out to be empty that section is hidden, and a bar
     inside it would disappear along with the results -- leaving the customer
     looking at nothing with no way to choose a different category. */
  const section = grid.closest('section');
  const anchor = section.length ? section : grid;

  const active = categories.find((c) => c.slug === activeSlug) || null;
  const shown = active ? (active.productCount || 0)
    : categories.reduce((s, c) => s + (c.productCount || 0), 0);

  const chip = (href, catSlug, label, isActive) => `
        <a class="zs-chip${isActive ? ' is-active' : ''}" href="${esc(href)}"
           data-category="${esc(catSlug)}" aria-current="${isActive ? 'true' : 'false'}">${esc(label)}</a>`;

  /* When a category is being shown, the results get its own banner: the
     category's picture, its name, and the way back out. It is rendered here so
     it is present with JavaScript off too; storefront-2026.js refills it from
     the tiles when the customer switches category without a page load. */
  const activeImg = active ? tileImage(active) : '';
  const banner = `
      <div class="zs-cat-banner" data-zs-banner${active ? '' : ' hidden'}>
        <span class="zs-cat-banner-media">
          ${activeImg ? `<img src="${esc(activeImg)}" alt="" loading="lazy" decoding="async" data-zs-banner-img>` : ''}
        </span>
        <span class="zs-cat-banner-copy">
          <strong data-zs-banner-title>${active ? esc(active.name) : ''}</strong>
          <small data-zs-banner-count>${active ? esc(countLabel(active.productCount || 0)) : ''}</small>
        </span>
        <a class="zs-cat-banner-clear" href="${esc(link(''))}" data-category="">عرض الكل</a>
      </div>`;

  const html = `
    <div class="zs-filter-bar" data-zs-filter-bar>
      ${banner}
      <div class="zs-filter-head">
        <h2 data-zs-results-title>${active ? esc(active.name) : 'كل غرف النوم'}</h2>
        <span data-zs-results-count>${esc(countLabel(shown))}</span>
      </div>
      <nav class="zs-chip-row" aria-label="تصفية حسب الفئة">
        ${chip(link(''), '', 'الكل', !activeSlug)}
        ${categories.map((c) => chip(link(c.slug), c.slug || '', c.name, activeSlug === c.slug)).join('')}
      </nav>
      <div class="zs-empty" data-zs-empty${shown ? ' hidden' : ''}>
        <strong>لا توجد منتجات في هذه الفئة بعد</strong>
        <span>جرّب فئة أخرى من الأعلى، أو تصفّح كل الفئات.</span>
        <br><a class="zs-empty-clear" href="${esc(link(''))}" data-category="">عرض كل الفئات</a>
      </div>
    </div>`;

  anchor.before(html);
}

module.exports = { injectCategoryStrip, STRIPS, FALLBACK_ANCHOR };
