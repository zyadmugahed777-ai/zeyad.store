/**
 * Zeyad For Business - Dynamic Sitemap Generator
 * Single Source of Truth for SEO sitemap.xml generation
 * Delegates category and product queries to canonical repositories.
 */

const fs = require('fs');
const path = require('path');
const { getRepositories } = require('../repositories');
const { SITE_URL } = require('../config/constants');

const ROOT_DIR = path.join(__dirname, '..', '..');
const SITEMAP_FILE_PATH = path.join(ROOT_DIR, 'sitemap.xml');
const ROBOTS_FILE_PATH = path.join(ROOT_DIR, 'robots.txt');

// Known public high-value pages
const PUBLIC_STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/about.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/branches.html', priority: '0.8', changefreq: 'weekly' },
  { path: '/contact.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/warranty.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/delivery.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/najm.html', priority: '0.8', changefreq: 'weekly' },
  { path: '/inspiration.html', priority: '0.7', changefreq: 'weekly' },
  { path: '/installation-service.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/book-appointment.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/consultation.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/design-request.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/quote-request.html', priority: '0.7', changefreq: 'monthly' },
  { path: '/offers.html', priority: '0.9', changefreq: 'daily' },
  { path: '/best-sellers.html', priority: '0.9', changefreq: 'daily' },
  { path: '/new-arrivals.html', priority: '0.9', changefreq: 'daily' },
  { path: '/flash-deals.html', priority: '0.9', changefreq: 'daily' },
  { path: '/privacy.html', priority: '0.5', changefreq: 'yearly' },
  { path: '/terms.html', priority: '0.5', changefreq: 'yearly' },
  { path: '/return-policy.html', priority: '0.5', changefreq: 'yearly' },
  { path: '/faq.html', priority: '0.6', changefreq: 'monthly' }
];

// Disallowed patterns (Private, Admin, Checkout, Test)
const DISALLOWED_PATTERNS = [
  /^\/admin/,
  /^\/api/,
  /^\/account/,
  /^\/cart/,
  /^\/checkout/,
  /^\/confirmation/,
  /^\/login/,
  /^\/register/,
  /test/i,
  /backup/i,
  /scratch/i,
  /temp/i
];

function isPathAllowed(routePath) {
  const normalized = (routePath.startsWith('/') ? routePath : '/' + routePath).toLowerCase();
  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(normalized)) return false;
  }
  return true;
}

function formatDate(date) {
  if (!date) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
}

async function generateSitemapXml() {
  const repos = getRepositories();
  const urlEntries = [];
  const addedUrls = new Set();

  function addUrl(loc, lastmod, changefreq, priority) {
    if (addedUrls.has(loc)) return;
    addedUrls.add(loc);
    urlEntries.push({ loc, lastmod: formatDate(lastmod), changefreq, priority });
  }

  // 1. Add static public routes
  for (const r of PUBLIC_STATIC_ROUTES) {
    if (isPathAllowed(r.path)) {
      const fullUrl = r.path === '/' ? (SITE_URL + '/') : (SITE_URL + r.path);
      addUrl(fullUrl, new Date(), r.changefreq, r.priority);
    }
  }

  // 2. Discover HTML files in project root
  try {
    const rootFiles = fs.readdirSync(ROOT_DIR);
    for (const file of rootFiles) {
      if (file.endsWith('.html') && isPathAllowed('/' + file)) {
        const fullUrl = SITE_URL + '/' + file;
        if (!addedUrls.has(fullUrl)) {
          let stat;
          try { stat = fs.statSync(path.join(ROOT_DIR, file)); } catch (_) {}
          addUrl(fullUrl, stat ? stat.mtime : new Date(), 'weekly', '0.8');
        }
      }
    }
  } catch (err) {
    console.error('Error scanning root html files for sitemap:', err);
  }

  // 3. Add active categories via repository
  try {
    const categories = await repos.categories.findActiveForSitemap();
    if (Array.isArray(categories)) {
      for (const cat of categories) {
        const catPath = '/category.html?id=' + encodeURIComponent(cat.slug || cat.id);
        if (isPathAllowed(catPath)) {
          addUrl(SITE_URL + catPath, cat.updated_at, 'weekly', '0.8');
        }
      }
    }
  } catch (_) {}

  // 4. Add all active products via repository
  //
  // Development leftovers are kept out. Three products still carrying test
  // identifiers were being listed for indexing, which would have put
  // "منتج اختبار السلة" in front of a customer arriving from a search result.
  // This is a safety net for the sitemap only -- it changes no data and hides
  // nothing from the site itself. The rows themselves should be deleted; that
  // is a separate decision and it is flagged rather than taken here.
  // The heuristic lives in utils/test-data.js now, because the home page
  // and the offers page need exactly the same judgement and two copies
  // would drift.
  const { looksLikeTestProduct } = require('./test-data');

  let productCount = 0;
  let excludedTest = 0;
  try {
    const products = await repos.products.findForSitemap();
    if (Array.isArray(products)) {
      for (const p of products) {
        const prodId = String(p.product_id || p.id || '');
        if (looksLikeTestProduct(p)) {
          excludedTest++;
          continue;
        }
        productCount++;
        const prodPath = '/product.html?id=' + encodeURIComponent(prodId);
        addUrl(SITE_URL + prodPath, p.updated_at || p.created_at, 'weekly', '0.8');
      }
    }
    if (excludedTest > 0) {
      console.log('  Sitemap: skipped ' + excludedTest + ' product(s) that look like test data.');
    }
  } catch (err) {
    console.error('Error fetching products for sitemap:', err);
  }

  // Build XML
  const xmlLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];

  for (const entry of urlEntries) {
    xmlLines.push('  <url>');
    xmlLines.push('    <loc>' + entry.loc + '</loc>');
    xmlLines.push('    <lastmod>' + entry.lastmod + '</lastmod>');
    xmlLines.push('    <changefreq>' + entry.changefreq + '</changefreq>');
    xmlLines.push('    <priority>' + entry.priority + '</priority>');
    xmlLines.push('  </url>');
  }

  xmlLines.push('</urlset>');
  const xmlOutput = xmlLines.join('\n');

  // Strict Validation: Must NEVER contain old domain
  const FORBIDDEN_LEGACY_DOMAIN = ['zeyad', 'for', 'business.com'].join('-');
  if (xmlOutput.includes(FORBIDDEN_LEGACY_DOMAIN)) {
    throw new Error('SITEMAP VALIDATION FAILED: Contains forbidden legacy domain ' + FORBIDDEN_LEGACY_DOMAIN);
  }

  // Write to disk
  try {
    fs.writeFileSync(SITEMAP_FILE_PATH, xmlOutput, 'utf8');
    console.log('[Sitemap] Successfully wrote ' + urlEntries.length + ' URLs (' + productCount + ' products) to ' + SITEMAP_FILE_PATH);
  } catch (writeErr) {
    console.error('Failed to write sitemap.xml to disk:', writeErr);
  }

  return {
    xml: xmlOutput,
    totalUrls: urlEntries.length,
    productCount: productCount,
    siteUrl: SITE_URL
  };
}

function generateRobotsTxt() {
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Private, Checkout & Admin Areas',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /cart.html',
    'Disallow: /checkout.html',
    'Disallow: /confirmation.html',
    'Disallow: /account.html',
    'Disallow: /account-*',
    '',
    'Sitemap: ' + SITE_URL + '/sitemap.xml',
    ''
  ];
  const content = lines.join('\n');

  fs.writeFileSync(ROBOTS_FILE_PATH, content, 'utf8');
  console.log('[Robots.txt] Updated ' + ROBOTS_FILE_PATH + ' with Sitemap: ' + SITE_URL + '/sitemap.xml');
  return content;
}

module.exports = {
  generateSitemapXml,
  generateRobotsTxt,
  SITE_URL
};
