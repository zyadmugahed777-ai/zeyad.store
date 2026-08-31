/**
 * Storefront data provider.
 *
 * Why this exists
 * ---------------
 * The admin panel has full CRUD for departments, categories, offers and
 * banners. Every one of those tables has a public REST endpoint too. And not a
 * single storefront page fetches any of them -- checked across all 71 HTML
 * files: /api/products appears in 7, /api/settings in 2, and
 * /api/categories, /api/departments, /api/offers and /api/banners in exactly
 * zero. So an operator could add a category, save it successfully, see it in
 * the admin list, and it would never appear on the site by any path. Same for
 * offers, which is why "the offers screen isn't practical" was accurate: no
 * offer created there could ever reach a customer.
 *
 * This service loads that data once per short interval so the injection
 * middleware can put it on the page without a per-request query.
 *
 * The cache is intentionally short and cleared outright on any admin write, so
 * an operator who saves a change and reloads the site sees it immediately
 * rather than wondering whether it worked.
 */

const { getRepositories } = require('../repositories');

const TTL_MS = 30 * 1000;

let cache = null;
let cachedAt = 0;

/** Trim a row down to what a public page has any business seeing. */
/* A department's slug is not a page name. "home-appliances" lives at
   appliances.html, "living-rooms" at majalis.html, "solar-energy" at solar.html.
   catalog-render-service's PAGE_MAP is the one place that knows which page
   serves which department, so the landing page is derived from it rather than
   guessed -- linking to <slug>.html gave the drawer seven dead links. */
function departmentPage(slug) {
  try {
    const { PAGE_MAP } = require('./catalog-render-service');
    for (const [page, spec] of Object.entries(PAGE_MAP)) {
      // The first page listed for a department is its landing page; the others
      // are catalogues and sub-pages of the same department.
      if (spec.department === slug) return page + '.html';
    }
  } catch (_) { /* fall through to the slug */ }
  return slug + '.html';
}

function publicDepartment(d) {
  return {
    id: d.id,
    slug: d.slug,
    page: departmentPage(d.slug),
    name: d.name_ar,
    nameEn: d.name_en || null,
    icon: d.icon || null,
    image: d.image || null,
    description: d.description_ar || null,
    sortOrder: d.sort_order ?? 0
  };
}

function publicCategory(c) {
  return {
    id: c.id,
    slug: c.slug,
    code: c.code || null,
    name: c.name_ar,
    nameEn: c.name_en || null,
    image: c.image || null,
    description: c.description_ar || null,
    departmentId: c.department_id ?? null,
    sortOrder: c.sort_order ?? 0,
    /* How this category is drawn: 'card' | 'circle' | 'pill' | 'compact'.
       NULL means 'card', so a category nobody has configured looks exactly as
       it did before the column existed. */
    displayStyle: c.display_style || null
  };
}

function publicOffer(o) {
  return {
    id: o.id,
    title: o.title_ar,
    titleEn: o.title_en || null,
    description: o.description || null,
    image: o.image || null,
    buttonText: o.button_text || null,
    link: o.link || null,
    couponCode: o.coupon_code || null,
    discountType: o.discount_type || null,
    discountValue: o.discount_value != null ? Number(o.discount_value) : null,
    discountAmount: o.discount_amount != null ? Number(o.discount_amount) : null,
    minOrder: o.min_order != null ? Number(o.min_order) : null,
    startDate: o.start_date || null,
    endDate: o.end_date || null,
    departmentId: o.department_id ?? null,
    categoryId: o.category_id ?? null,
    // Stored as a comma-separated list; an entry may be "page:about" to target
    // one specific page. Parsed here so callers never re-implement the split.
    placements: String(o.placement || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    sortOrder: o.sort_order ?? 0
  };
}

function publicBanner(b) {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle || null,
    body: b.body || null,
    image: b.image || b.desktop_image || null,
    desktopImage: b.desktop_image || null,
    mobileImage: b.mobile_image || null,
    link: b.link || null,
    buttonText: b.button_text || null,
    position: b.position || null,
    sortOrder: b.sort_order ?? 0
  };
}

function publicProduct(p) {
  const images = (p.images || []).map((i) => i.image_path).filter(Boolean);
  return {
    id: p.product_id,
    dbId: p.id,
    title: p.title,
    price: p.price != null ? Number(p.price) : null,
    oldPrice: p.old_price != null ? Number(p.old_price) : null,
    brand: p.brand || null,
    sku: p.sku || null,
    stock_status: p.stock_status || 'in-stock',
    image: images[0] || null,
    categoryId: p.category_id ?? null,
    categorySlug: p.category_slug || null,
    categoryName: p.category_name || null,
    categoryCode: p.category_code || null,
    departmentId: p.resolved_department_id ?? null,
    departmentSlug: p.department_slug || null,
    departmentName: p.department_name || null,
    subcategory: p.category_name || null
  };
}

/** Drop the cache. Call after any admin write to these tables. */
function invalidate() {
  cache = null;
  cachedAt = 0;
}

/**
 * @returns {Promise<{departments:Array, categories:Array, offers:Array, banners:Array}>}
 */
async function getStorefrontData() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;

  const repos = getRepositories();
  const now = new Date().toISOString();

  // Each source is fetched independently: one failing table must not blank the
  // whole payload and take working sections of the site down with it.
  const settle = async (label, fn, shape) => {
    try {
      return ((await fn()) || []).map(shape);
    } catch (err) {
      console.error(`[storefront-data] ${label} unavailable:`, err.message);
      return [];
    }
  };

  const [departments, categories, offers, banners, products] = await Promise.all([
    settle('departments', () => repos.departments.findAll({ status: '1' }), publicDepartment),
    settle('categories', () => repos.categories.findAll({ status: '1' }), publicCategory),
    settle('offers', () => repos.offers.findActive(now), publicOffer),
    // The banner repository has no findActive(); it exposes findAll() with a
    // status filter and findActiveByPosition() for one position at a time. The
    // storefront payload wants every live banner regardless of position, so
    // findAll is the right call -- and findAll returns { banners, totalItems },
    // not an array.
    settle('banners', async () => {
      const res = await repos.banners.findAll({ status: 'active', limit: 100 });
      return (res && res.banners) || [];
    }, publicBanner),
    // Products carry their resolved department and category (the department is
    // derived from the category when the product row has none), which is what
    // lets a department page list what actually belongs to it.
    settle('products', () => repos.products.findAllActiveForSync(), publicProduct)
  ]);

  cache = { departments, categories, offers, banners, products };
  cachedAt = Date.now();
  return cache;
}

/**
 * The offers that belong on a given page.
 *
 * @param {Array} offers   from getStorefrontData()
 * @param {string} slug    page slug, e.g. 'index' or 'about'
 * @param {'top'|'bottom'} position
 */
function offersFor(offers, slug, position) {
  const isHome = slug === 'index';

  return offers.filter((o) => {
    const p = o.placements;
    if (p.includes(`page:${slug}`)) return position === 'top';
    if (position === 'top') {
      if (p.includes('all_pages')) return true;
      if (isHome && p.includes('home')) return true;
      if (!isHome && p.includes('category')) return true;
      if (slug === 'checkout' && p.includes('checkout')) return true;
    } else {
      if (p.includes('all_pages_bottom')) return true;
      if (isHome && p.includes('home_bottom')) return true;
    }
    return false;
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

module.exports = {
  getStorefrontData,
  invalidate,
  offersFor,
  publicDepartment,
  publicCategory,
  publicOffer,
  publicBanner
};
