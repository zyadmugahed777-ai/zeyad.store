/**
 * Per-product metadata and structured data for product.html?id=...
 *
 * The problem this solves
 * ----------------------
 * product.html is one file serving all 403 products, so every one of them was
 * handed to crawlers and social scrapers as:
 *
 *   <title>صفحة المنتج - زياد للتجارة</title>
 *   <meta name="description" content="منصة تسوق عربية للمنزل...">
 *   <link rel="canonical" href="https://zeyad.store/product.html">
 *   no og:image at all
 *   no structured data at all
 *
 * The canonical is the worst of it. The sitemap lists 402 product URLs with
 * their ?id=, and each of those pages then told Google it was a duplicate of a
 * single id-less page. A sitemap and a canonical pointing at each other's
 * throats resolves one way: the products drop out of the index.
 *
 * For a shop whose traffic is meant to arrive from Facebook, Instagram and
 * TikTok ads, the missing og:image is nearly as bad -- every shared product
 * link previewed as a blank card titled "صفحة المنتج".
 *
 * What is emitted, and what is deliberately not
 * ---------------------------------------------
 * Only fields backed by a real column with a real value:
 *   name, image, description, brand, sku, price, priceCurrency, availability
 *
 * aggregateRating is NOT emitted. products.rating and products.reviews_count
 * hold numbers, but there is no reviews table anywhere in the schema -- they
 * are seeded values with nothing behind them. Marking up ratings that no
 * customer left violates Google's structured data policy and risks a manual
 * action against the whole domain. The numbers still render on the page as
 * they always have; they simply are not claimed to search engines as review
 * data.
 */

// Both come from config/constants.js so the canonical host and the brand are
// stated in exactly one place. SITE was hardcoded here, which meant an
// SITE_URL override applied everywhere except the product and category pages
// -- the two that generate the most URLs.
const { SITE_URL, BRAND_AR } = require('../config/constants');
const SITE = SITE_URL;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Absolute URL for a stored image path. */
function absoluteImage(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  return SITE + (src.startsWith('/') ? src : '/' + src);
}

/** Strip markup and collapse whitespace, then cut on a word boundary. */
function plain(html, max) {
  const text = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!max || text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

/**
 * A description worth showing in a search result.
 *
 * Falls back through the fields that actually carry meaning, and only invents
 * structure -- never facts. Everything interpolated is a stored value.
 */
function buildDescription(p) {
  const own = plain(p.description || p.short_description, 155);
  if (own.length >= 50) return own;

  // Too short or missing: assemble from the attributes that do exist.
  const parts = [];
  if (p.title) parts.push(p.title);
  if (p.brand) parts.push('من ' + p.brand);
  if (p.categoryName) parts.push('ضمن ' + p.categoryName);
  if (Number(p.price) > 0) {
    parts.push('بسعر ' + Number(p.price).toLocaleString('ar-SA') + ' ر.س');
  }
  const line = parts.join(' ');
  return plain(line + (line ? '. ' : '') + 'اطلبه الآن من ' + BRAND_AR + '.', 155);
}

function availabilityUrl(stockStatus) {
  const s = String(stockStatus || 'in-stock').toLowerCase();
  if (s.includes('out')) return 'https://schema.org/OutOfStock';
  if (s.includes('pre')) return 'https://schema.org/PreOrder';
  return 'https://schema.org/InStock';
}

/**
 * Build every tag a product page needs.
 * @returns {{title,description,canonical,image,tags:string[],jsonLd:string}|null}
 */
function buildProductSeo(product, currency = 'SAR') {
  if (!product || !product.id) return null;

  const url = `${SITE}/product.html?id=${encodeURIComponent(product.id)}`;
  const image = absoluteImage(product.image || product.main_image);
  const description = buildDescription(product);

  // The title carries the product and the brand, because that is what a person
  // scanning a results page is looking for.
  const titleParts = [product.title];
  if (product.brand) titleParts.push(product.brand);
  titleParts.push(BRAND_AR);
  const title = titleParts.filter(Boolean).join(' | ');

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:site_name" content="${esc(BRAND_AR)}">`,
    `<meta property="og:locale" content="ar_YE">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`
  ];

  if (image) {
    tags.push(`<meta property="og:image" content="${esc(image)}">`);
    tags.push(`<meta property="og:image:alt" content="${esc(product.title)}">`);
    tags.push(`<meta name="twitter:image" content="${esc(image)}">`);
  }

  if (Number(product.price) > 0) {
    // The product OG namespace is what Facebook and Instagram read for a
    // shopping preview.
    tags.push(`<meta property="product:price:amount" content="${esc(Number(product.price))}">`);
    tags.push(`<meta property="product:price:currency" content="${esc(currency)}">`);
    tags.push(`<meta property="product:availability" content="${String(product.stock_status || '').includes('out') ? 'out of stock' : 'in stock'}">`);
    if (product.brand) tags.push(`<meta property="product:brand" content="${esc(product.brand)}">`);
  }

  // ---- Structured data -----------------------------------------------------
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.title,
    url
  };
  if (image) ld.image = [image];
  if (description) ld.description = description;
  if (product.brand) ld.brand = { '@type': 'Brand', name: product.brand };
  if (product.sku) ld.sku = product.sku;
  if (product.categoryName) ld.category = product.categoryName;

  if (Number(product.price) > 0) {
    ld.offers = {
      '@type': 'Offer',
      url,
      price: Number(product.price),
      priceCurrency: currency,
      availability: availabilityUrl(product.stock_status),
      itemCondition: 'https://schema.org/NewCondition',
      // Points at the one Organization node the site publishes site-wide, so
      // every offer resolves to the same seller instead of restating a name
      // that then has to be kept in sync by hand.
      seller: { '@id': SITE + '/#organization' }
    };
  }

  // Breadcrumbs, built only from the taxonomy the product actually resolves to.
  const crumbs = [{ name: 'الرئيسية', item: SITE + '/' }];
  if (product.departmentName && product.departmentSlug) {
    crumbs.push({ name: product.departmentName, item: `${SITE}/${product.departmentSlug}.html` });
  }
  if (product.categoryName) {
    crumbs.push({
      name: product.categoryName,
      item: product.departmentSlug && product.categorySlug
        ? `${SITE}/${product.departmentSlug}.html?category=${encodeURIComponent(product.categorySlug)}`
        : url
    });
  }
  crumbs.push({ name: product.title, item: url });

  const breadcrumbLd = {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name, item: c.item
    }))
  };

  const jsonLd =
    `<script type="application/ld+json">${JSON.stringify(ld)}</script>` +
    `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`;

  return { title, description, canonical: url, image, tags, jsonLd };
}

/**
 * Metadata for a category landing page.
 *
 * category.html is the same one-file-many-URLs shape product.html had: 44 of
 * them sit in the sitemap, each distinguished only by ?id=. Without a canonical
 * carrying that id they all collapse into one page, and without an og:image
 * every shared category link previews blank.
 *
 * The image is borrowed from a product that actually belongs to the category,
 * because the category itself has no photograph of its own. Nothing is
 * invented -- if the category is empty, no image is claimed.
 */
function buildCategorySeo(category, products, currency = 'SAR') {
  if (!category) return null;

  const key = category.slug || category.id;
  const url = `${SITE}/category.html?id=${encodeURIComponent(key)}`;
  const name = category.name || category.name_ar || 'التصنيف';

  const inCategory = (products || []).filter(
    (p) => p.categorySlug === category.slug || String(p.categoryId) === String(category.id)
  );

  const count = inCategory.length;
  const withImage = inCategory.find((p) => p.image);
  const image = withImage ? absoluteImage(withImage.image) : null;

  const description = count > 0
    ? plain(`تسوّق ${name} من ${BRAND_AR} — ${count} منتج متاح بأسعار تنافسية وضمان معتمد وتوصيل داخل المدن الرئيسية.`, 155)
    : plain(`${name} من ${BRAND_AR}. تصفّح التشكيلة واطلب بسهولة.`, 155);

  const title = `${name} | ${BRAND_AR}`;

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:site_name" content="${esc(BRAND_AR)}">`,
    `<meta property="og:locale" content="ar_YE">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`
  ];
  if (image) {
    tags.push(`<meta property="og:image" content="${esc(image)}">`);
    tags.push(`<meta property="og:image:alt" content="${esc(name)}">`);
    tags.push(`<meta name="twitter:image" content="${esc(image)}">`);
  }

  // An ItemList is honest about what a category page is: a list of products,
  // each named and linked. No prices are claimed at this level.
  const jsonLd = count > 0
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org/',
        '@type': 'ItemList',
        name: title,
        url,
        numberOfItems: count,
        itemListElement: inCategory.slice(0, 20).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.title,
          url: `${SITE}/product.html?id=${encodeURIComponent(p.id)}`
        }))
      })}</script>`
    : '';

  return { title, description, canonical: url, image, tags, jsonLd };
}

module.exports = {
  buildProductSeo,
  buildCategorySeo,
  buildDescription,
  absoluteImage,
  plain,
  SITE
};
