/**
 * Zeyad For Business - Visual CMS Public & Preview Middleware
 * Intercepts HTML pages and dynamically injects Canonical Published CMS overrides
 * (or Draft content when accessed via Admin Visual Editor in preview mode).
 */

const fs = require('fs');
// Building HTML strings here rather than in a template literal, so a line
// break is written as a value rather than smuggled through an escape.
const NEWLINE = String.fromCharCode(10);
const path = require('path');
const cheerio = require('cheerio');
const { cmsService } = require('../services/cms-service');
const { getStorefrontData, offersFor } = require('../services/storefront-data-service');
const { renderOffersSection } = require('../services/offer-render-service');
const { injectCatalog } = require('../services/catalog-render-service');
const { injectCategoryStrip } = require('../services/category-strip-service');
const { buildProductSeo, buildCategorySeo, SITE } = require('../services/product-seo-service');
const {
  BRAND_AR, BRAND_ALTERNATES, DEFAULT_OG_IMAGE
} = require('../config/constants');

/**
 * Site-wide identity for search engines.
 *
 * The site published no Organization and no WebSite node at all -- only
 * BreadcrumbList, plus a `seller` name buried inside each product. So nothing
 * told a crawler who owns zeyad.store, and nothing connected the name the store
 * uses now to the name customers still search for.
 *
 * `alternateName` is the specific mechanism for that: it states, in the
 * vocabulary search engines actually read, that this one organisation is known
 * by both names. It is a true statement about a real former trading name, which
 * is the only reason it is defensible to publish -- the same words repeated
 * through visible copy to catch searches would be keyword stuffing and would be
 * treated as such.
 *
 * What this cannot do, and is not claimed anywhere: it does not decide what
 * Google prints. Site names and snippets are chosen by the engine. This
 * supplies correct signals; it does not control the result.
 */
function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': SITE + '/#organization',
    name: BRAND_AR,
    alternateName: BRAND_ALTERNATES,
    url: SITE + '/',
    logo: DEFAULT_OG_IMAGE,
    image: DEFAULT_OG_IMAGE
  };
}

/**
 * The WebSite node, homepage only.
 *
 * Repeating it on all 71 pages adds no signal and gives the crawler 71 copies
 * to reconcile, so it is emitted once at the root where it belongs. The
 * SearchAction describes the site search that genuinely exists at /search.html
 * -- declaring one the site did not implement would be a false statement about
 * the page.
 */
function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE + '/#website',
    name: BRAND_AR,
    alternateName: BRAND_ALTERNATES,
    url: SITE + '/',
    inLanguage: 'ar',
    publisher: { '@id': SITE + '/#organization' },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: SITE + '/search.html?q={search_term_string}'
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

/**
 * Serialise for embedding in HTML. `<` is escaped so a value can never close
 * the script element early and turn structured data into a markup injection.
 */
function jsonLdScript(obj) {
  return '<script type="application/ld+json">' +
    JSON.stringify(obj).replace(/</g, '\\u003c') +
    '</script>';
}

function cssPropertyNameToKebab(prop) {
  return prop.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Scope a rule to a theme when the style bucket names one.
 *
 * The editor stores styles under a device bucket -- global, desktop, tablet,
 * mobile -- and now optionally a theme suffix: "desktop.dark", "global.light".
 * A rule with no suffix applies in both themes, which is what every style
 * saved so far does, so nothing already published changes behaviour.
 *
 * The site switches themes by setting data-theme on the root element
 * (assets/js/core/theme.js), so that is what the selector keys off.
 */
function scopeSelector(vid, theme) {
  const target = '[data-vid="' + vid + '"]';
  if (theme === 'dark') return ':root[data-theme="dark"] ' + target;
  if (theme === 'light') return ':root[data-theme="light"] ' + target;
  return target;
}

/** Split "desktop.dark" into its device and theme halves. */
function splitBucket(name) {
  const parts = String(name).split('.');
  const theme = parts[1] === 'dark' || parts[1] === 'light' ? parts[1] : null;
  return { device: parts[0], theme };
}

function buildResponsiveCssBlock(overridesMap) {
  let desktopRules = [];
  let tabletRules = [];
  let mobileRules = [];
  let globalRules = [];

  const bucketFor = (device) =>
    device === 'desktop' ? desktopRules
      : device === 'tablet' ? tabletRules
      : device === 'mobile' ? mobileRules
      : globalRules;

  overridesMap.forEach((item, vid) => {
    if (!item.styles) return;

    // Global
    if (item.styles.global && Object.keys(item.styles.global).length > 0) {
      let decls = [];
      for (const [k, v] of Object.entries(item.styles.global)) {
        decls.push(`${cssPropertyNameToKebab(k)}: ${v} !important;`);
      }
      if (decls.length > 0) {
        globalRules.push(`[data-vid="${vid}"] { ${decls.join(' ')} }`);
      }
    }

    // Desktop
    if (item.styles.desktop && Object.keys(item.styles.desktop).length > 0) {
      let decls = [];
      for (const [k, v] of Object.entries(item.styles.desktop)) {
        decls.push(`${cssPropertyNameToKebab(k)}: ${v} !important;`);
      }
      if (decls.length > 0) {
        desktopRules.push(`[data-vid="${vid}"] { ${decls.join(' ')} }`);
      }
    }

    // Tablet
    if (item.styles.tablet && Object.keys(item.styles.tablet).length > 0) {
      let decls = [];
      for (const [k, v] of Object.entries(item.styles.tablet)) {
        decls.push(`${cssPropertyNameToKebab(k)}: ${v} !important;`);
      }
      if (decls.length > 0) {
        tabletRules.push(`[data-vid="${vid}"] { ${decls.join(' ')} }`);
      }
    }

    // Mobile
    if (item.styles.mobile && Object.keys(item.styles.mobile).length > 0) {
      let decls = [];
      for (const [k, v] of Object.entries(item.styles.mobile)) {
        decls.push(`${cssPropertyNameToKebab(k)}: ${v} !important;`);
      }
      if (decls.length > 0) {
        mobileRules.push(`[data-vid="${vid}"] { ${decls.join(' ')} }`);
      }
    }
    // Theme-scoped buckets: "desktop.dark", "global.light" and so on. These
    // sit alongside the plain device buckets above rather than replacing them,
    // so an edit made before theme scoping existed still applies in both
    // themes exactly as it did.
    for (const bucketName of Object.keys(item.styles)) {
      if (bucketName.indexOf('.') === -1) continue;
      const styleSet = item.styles[bucketName];
      if (!styleSet || Object.keys(styleSet).length === 0) continue;

      const split = splitBucket(bucketName);
      if (!split.theme) continue;

      const themeDecls = [];
      for (const [k, v] of Object.entries(styleSet)) {
        if (v === null || v === undefined || v === '') continue;
        themeDecls.push(cssPropertyNameToKebab(k) + ': ' + v + ' !important;');
      }
      if (themeDecls.length > 0) {
        bucketFor(split.device).push(scopeSelector(vid, split.theme) + ' { ' + themeDecls.join(' ') + ' }');
      }
    }
  });

  let css = '';
  if (globalRules.length > 0) css += globalRules.join('\n') + '\n';
  if (desktopRules.length > 0) css += `@media (min-width: 1025px) {\n${desktopRules.join('\n')}\n}\n`;
  if (tabletRules.length > 0) css += `@media (min-width: 481px) and (max-width: 1024px) {\n${tabletRules.join('\n')}\n}\n`;
  if (mobileRules.length > 0) css += `@media (max-width: 480px) {\n${mobileRules.join('\n')}\n}\n`;

  return css.trim();
}

async function visualCmsMiddleware(req, res, next) {
  // Skip API, Admin, and non-GET requests
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/admin-assets') || req.path.startsWith('/uploads')) {
    return next();
  }

  let reqPath = req.path === '/' ? '/index.html' : req.path;

  // Auto-append .html if extension is missing and file exists
  if (!path.extname(reqPath)) {
    const htmlPath = path.join(__dirname, '..', '..', reqPath + '.html');
    if (fs.existsSync(htmlPath)) {
      reqPath += '.html';
    }
  }

  // Only intercept HTML files
  if (reqPath.endsWith('.html')) {
    const fullPath = path.join(__dirname, '..', '..', reqPath);
    if (fs.existsSync(fullPath)) {
      try {
        const html = fs.readFileSync(fullPath, 'utf8');
        const $ = cheerio.load(html, { decodeEntities: false });

        const baseSlug = path.basename(reqPath, '.html');
        const isEditorMode = req.query.visual_editor === 'true';
        const isPreviewDraft = isEditorMode && req.query.preview_draft === 'true';

        try {
          // Read from CmsService (Draft if preview_draft=true, otherwise Canonical Published)
          const overrides = isPreviewDraft
            ? await cmsService.getDraftContent(baseSlug)
            : await cmsService.getPublishedContent(baseSlug);

          overrides.forEach((item, vid) => {
            const el = $(`[data-vid="${vid}"]`);
            if (el.length > 0) {
              if (item.type === 'image') {
                el.attr('src', item.value);
              } else if (item.type === 'bg-image' || item.type === 'background') {
                let style = el.attr('style') || '';
                style = style.replace(/background-image:\s*url\([^)]+\);?/gi, '');
                el.attr('style', `background-image: url('${item.value}'); ${style}`.trim());
              } else if (item.type === 'link') {
                try {
                  const linkData = JSON.parse(item.value);
                  if (linkData.href) el.attr('href', linkData.href);
                  if (linkData.text) el.text(linkData.text);
                } catch (_) {
                  el.attr('href', item.value);
                }
              } else {
                // Text or standard HTML block
                el.html(item.value);
              }
            }
          });

          // Inject Responsive CSS block
          const responsiveCss = buildResponsiveCssBlock(overrides);
          if (responsiveCss) {
            $('head').append(`<style id="cms-responsive-overrides">${responsiveCss}</style>`);
          }
        } catch (dbErr) {
          console.error('Visual CMS Service Error:', dbErr.message);
        }

        // -------------------------------------------------------------
        // Storefront data injection.
        //
        // departments, categories, offers and banners all have admin CRUD, DB
        // tables and public REST endpoints -- and no storefront page fetched
        // any of them (verified: 0 of 71 HTML files reference /api/categories,
        // /api/departments, /api/offers or /api/banners). So a category or an
        // offer saved in the admin could never reach a customer.
        //
        // The data is attached here, to the page the server is already
        // parsing, rather than by editing 71 HTML files or adding a fetch to
        // each. No storefront file changes, and no extra request on load.
        // -------------------------------------------------------------
        try {
          const data = await getStorefrontData();

          $('body').append(
            '<script id="zfb-storefront-data">window.ZFB_DATA = ' +
            JSON.stringify(data).replace(/</g, '\u003c') +
            ';</script>'
          );

          // Department pages ship their products as hardcoded cards, so a
          // product added in the admin could never appear on one. Rebuild the
          // page's main catalog grid from the database instead, using the same
          // card markup the page already used.
          const activeCategory = String(req.query.category || '').trim();
          injectCatalog($, baseSlug, data.products, activeCategory);

          /* category.html drew six identical gold line-glyphs and none of them
             was editable. departments.image already exists and the admin already
             uploads to it; the storefront just never read it. */
          try {
            const { injectDepartmentTiles } = require('../services/department-tile-service');
            injectDepartmentTiles($, data.departments, (deptSlug) => {
              const hit = (data.products || []).find(
                (p) => p.departmentSlug === deptSlug && p.image && !/placeholder/i.test(p.image)
              );
              return hit ? hit.image : null;
            });
          } catch (e) {
            // A tile decoration must never take the page down with it.
          }

          // The category tiles were hardcoded per page and had drifted from the
          // database completely -- naming categories that do not exist, linking
          // to offers.html instead of filtering, and using slugs that match
          // nothing the admin stores. Rebuild them from the department's real
          // categories, counting only products actually in each.
          const spec = require('../services/catalog-render-service').PAGE_MAP[baseSlug];
          if (spec) {
            const deptCategories = (data.categories || [])
              .filter((c) => {
                const dept = (data.departments || []).find((d) => d.id === c.departmentId);
                return dept && dept.slug === spec.department;
              })
              .map((c) => {
                const inCategory = (data.products || []).filter((p) => p.categorySlug === c.slug);
                /* A category nobody has uploaded a picture for still deserves
                   one, and the honest picture is something the category
                   actually contains -- not stock artwork of a product the shop
                   may not sell. A category with no products keeps the lettered
                   plate the tile falls back to. */
                const representative = inCategory
                  .map((p) => p.image)
                  .find((src) => src && !/placeholder\.svg$/i.test(src)) || null;
                return {
                  ...c,
                  productCount: inCategory.length,
                  fallbackImage: representative
                };
              })
              .sort((a, b) => b.productCount - a.productCount || a.sortOrder - b.sortOrder);
            /* The grid selector comes from the catalogue's own PAGE_MAP -- the
               single place that knows where each department page keeps its
               products. The strip service used to carry a second, hand-kept
               copy of that map which listed only 8 of the 19 pages, so
               appliances, kitchens and solar silently had no category rail. */
            injectCategoryStrip($, baseSlug, deptCategories, activeCategory, spec.grid);
          }

          /* A section with nothing in it is worse than no section: it tells the
             customer the shop has a category of furniture and then shows them
             an empty frame. Only the containers this request just filled are
             considered -- anything a client script fills later is left alone,
             because deleting that container would break the script. */
          if (spec) {
            const { hideEmptySections } = require('../services/empty-section-service');
            hideEmptySections($, [spec.grid], {
              // Only pass the way out when a category filter is what emptied the
              // page; a department with nothing in it is a different problem.
              clearHref: activeCategory ? baseSlug + '.html' : null
            });
          }

          // category.html is the same one-file-many-URLs shape product.html
          // had: 44 of its ?id= variants sit in the sitemap, and without a
          // canonical carrying that id they collapse into a single page.
          if (baseSlug === 'category' && req.query.id) {
            const key = String(req.query.id);
            const category = (data.categories || []).find(
              (c) => String(c.slug) === key || String(c.id) === key
            );
            if (category) {
              const seo = buildCategorySeo(category, data.products);
              if (seo) {
                $('title').remove();
                $('meta[name="description"]').remove();
                $('link[rel="canonical"]').remove();
                $('meta[property^="og:"]').remove();
                $('meta[name^="twitter:"]').remove();
                $('head').prepend(seo.tags.join(NEWLINE + '  ') + NEWLINE + '  ' + seo.jsonLd + NEWLINE);
              }
            }
          }

          // A canonical for every page that still lacks one.
          //
          // Eight pages had none at all, the home page among them -- which
          // leaves zeyad.store/ and zeyad.store/index.html competing as two
          // URLs for identical content. The self-referencing canonical is what
          // settles that, and it also matters here for a second reason: the
          // deployed site currently declares a canonical pointing at
          // zeyad-for-business.com, a domain that does not resolve. Every page
          // this server renders now states its own address on zeyad.store.
          // A canonical written as a relative path resolves correctly in
          // practice, but it is ambiguous the moment a page is served from a
          // second hostname -- and this site has already been serving a
          // canonical for a domain that does not resolve. Absolute removes the
          // ambiguity. The target path is preserved exactly, so a page that
          // deliberately points at another page keeps pointing there.
          const existingCanon = $('link[rel="canonical"]').first();
          if (existingCanon.length) {
            const href = existingCanon.attr('href') || '';
            if (href && !/^https?:\/\//i.test(href)) {
              existingCanon.attr('href', SITE + (href.startsWith('/') ? href : '/' + href));
            }
          }

          if ($('link[rel="canonical"]').length === 0) {
            const clean = reqPath === '/index.html' ? '/' : reqPath;
            $('head').append(NEWLINE + '  <link rel="canonical" href="' + SITE + clean + '">');
          }

          // Identity, on every page. Guarded so a page that already carries an
          // Organization node (or a re-render) does not end up with two.
          if ($('script[type="application/ld+json"]:contains("#organization")').length === 0) {
            $('head').append(NEWLINE + '  ' + jsonLdScript(buildOrganizationJsonLd()));
          }
          if ((baseSlug === 'index' || reqPath === '/') &&
              $('script[type="application/ld+json"]:contains("#website")').length === 0) {
            $('head').append(NEWLINE + '  ' + jsonLdScript(buildWebSiteJsonLd()));
          }

          // Pages that must never appear in a search result.
          //
          // robots.txt already disallows these, but Disallow only stops the
          // crawl -- it does not stop indexing. A URL that Google finds linked
          // from anywhere can still be listed, showing a bare title and no
          // description, because the crawler was told not to look inside. The
          // meta tag is the instruction that actually removes it, and for it
          // to be read the page must stay crawlable, which it is.
          const NOINDEX_PAGES = new Set([
            'cart', 'checkout', 'confirmation', 'account', 'account-profile',
            'account-reservations', 'account-reservation-detail', 'account-support',
            'login', 'wishlist', 'compare', 'track-order'
          ]);
          if (NOINDEX_PAGES.has(baseSlug)) {
            $('meta[name="robots"]').remove();
            $('head').prepend('<meta name="robots" content="noindex, nofollow">' + NEWLINE);
          }

          // product.html is one file serving all 403 products, so each was
          // handed to crawlers and social scrapers with the same title, the
          // same description, no og:image, and -- worst -- a canonical
          // pointing at the id-less URL. The sitemap lists 402 product URLs
          // and every one of them was declaring itself a duplicate of a single
          // page, which resolves by dropping the products from the index.
          if (baseSlug === 'product' && req.query.id) {
            const product = (data.products || []).find(
              (p) => String(p.id) === String(req.query.id)
            );
            if (product) {
              const seo = buildProductSeo(product);
              if (seo) {
                // Remove the placeholders first: two titles or two canonicals
                // on a page leaves the crawler to pick one arbitrarily.
                $('title').remove();
                $('meta[name="description"]').remove();
                $('link[rel="canonical"]').remove();
                $('meta[property^="og:"]').remove();
                $('meta[name^="twitter:"]').remove();
                $('meta[property^="product:"]').remove();
                $('head').prepend(seo.tags.join(NEWLINE + '  ') + NEWLINE + '  ' + seo.jsonLd + NEWLINE);
              }
            }
          }

          // Offers are the one payload that also renders itself, because
          // nothing on the site was ever built to display them.
          const top = renderOffersSection(offersFor(data.offers, baseSlug, 'top'), 'top');
          const bottom = renderOffersSection(offersFor(data.offers, baseSlug, 'bottom'), 'bottom');

          if (top) {
            const main = $('main').first();
            if (main.length) main.prepend(top); else $('body').prepend(top);
          }
          if (bottom) {
            const main = $('main').first();
            if (main.length) main.append(bottom); else $('body').append(bottom);
          }
        } catch (dataErr) {
          // A data hiccup must never blank a page that would otherwise render.
          console.error('Storefront data injection failed:', dataErr.message);
        }

        // Inject Editor Client Script only if accessed via Visual Editor
        if (isEditorMode) {
          $('head').append('<script src="/admin-assets/visual-editor-client.js"></script>');
          $('head').append('<link rel="stylesheet" href="/admin-assets/visual-editor-client.css">');
        }

        return res.send($.html());
      } catch (err) {
        return next(err);
      }
    }
  }

  next();
}

module.exports = visualCmsMiddleware;
