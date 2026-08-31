/**
 * Zeyad For Business - Frontend Cache Synchronizer
 * Syncs SQLite database tables directly to products_db.json, products_db.js, and zfb-config.js.
 * Delegates data access to canonical repositories (products, settings).
 */

const fs = require('fs');
const path = require('path');
const { getRepositories } = require('../repositories');

const PRODUCTS_JSON_PATH = path.join(__dirname, '..', '..', 'products_db.json');
const PRODUCTS_JS_PATH = path.join(__dirname, '..', '..', 'products_db.js');
const CONFIG_JS_PATH = path.join(__dirname, '..', '..', 'zfb-config.js');

async function syncFrontend() {
  console.log('Synchronizing database to frontend cache...');
  try {
    const repos = getRepositories();
    
    // 1. QUERY PRODUCTS VIA REPOSITORY
    const products = (await repos.products.findAllActiveForSync()) || [];
    
    const formattedProducts = products.map(p => {
      const images = p.images || [];
      const specs = p.specs || [];
      const faq = p.faq || [];
      const colors = p.colors || [];

      const galleryList = (images || []).map(img => {
        let imgPath = (img.image_path || '').trim().replace(/\\/g, '/');
        if (!imgPath) return '/assets/placeholder.svg';
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('data:') || imgPath.startsWith('blob:')) return imgPath;
        if (!imgPath.startsWith('/')) imgPath = '/' + imgPath;
        return imgPath;
      });
      if (galleryList.length === 0) {
        galleryList.push('/assets/placeholder.svg');
      }

      return {
        id: p.product_id,
        product_id: p.product_id,
        title: p.title,

        // Taxonomy. Emitted in two shapes on purpose:
        //   - categorySlug / departmentSlug drive page filtering
        //   - category / subcategory are the names zfb-core.js already reads
        //     in its compare and search scoring, which until now were always
        //     undefined because nothing ever wrote them
        categoryId: p.category_id ?? null,
        categorySlug: p.category_slug || null,
        categoryName: p.category_name || null,
        categoryCode: p.category_code || null,
        departmentId: p.resolved_department_id ?? null,
        departmentSlug: p.department_slug || null,
        departmentName: p.department_name || null,
        category: p.department_name || null,
        subcategory: p.category_name || null,
        price: p.price,
        oldPrice: p.old_price,
        rating: String(p.rating || '0.0'),
        reviewsCount: p.reviews_count || 0,
        brand: p.brand || '',
        origin: p.origin || '',
        sku: p.sku || '',
        warranty: p.warranty || '',
        shipping: p.shipping || '',
        deliveryTime: p.delivery_time || '',
        installation: p.installation ? (p.installation === 1 || p.installation === '1' ? 'متوفر' : p.installation) : 'غير متوفر',
        weight: p.weight || '',
        image: galleryList[0],
        main_image: galleryList[0],
        gallery: galleryList,
        video: p.video || '',
        // Only what the operator actually entered. A product with no colours
        // and no sizes emits empty arrays, and the product page then shows
        // neither picker -- no invented defaults.
        colors: colors.map(c => ({ name: c.name, hex: c.hex })),
        // Which photo belongs to which colour: { "أزرق": ["/uploads/..."] }.
        // Choosing a colour on the product page swaps to its photo; a colour
        // with no photo of its own simply does not swap.
        colorImages: (p.images || []).reduce((acc, img) => {
          const key = (img.color_name || '').trim();
          if (!key) return acc;
          (acc[key] = acc[key] || []).push(img.image_path);
          return acc;
        }, {}),
        // Each size carries its full price, not a delta, so picking one sets
        // the price outright. Was hardcoded to [] here, so a size entered in
        // the admin could never have reached the storefront.
        sizes: (p.sizes || []).map(sz => ({ label: sz.label, price: Number(sz.price) })),
        isNew: p.is_new === true || p.is_new === 1,
        isBestSeller: p.is_best_seller === true || p.is_best_seller === 1,
        description: p.description || '',
        specs: specs.map(s => ({ label: s.label, value: s.value })),
        faq: faq.map(f => ({ q: f.q, a: f.a }))
      };
    });

    // Write products JSON
    fs.writeFileSync(PRODUCTS_JSON_PATH, JSON.stringify(formattedProducts, null, 2), 'utf8');
    
    // Write products JS fallback
    fs.writeFileSync(PRODUCTS_JS_PATH, `window.PRODUCTS_DB = ${JSON.stringify(formattedProducts, null, 2)};\n`, 'utf8');
    console.log(`  Synced ${formattedProducts.length} products to static cache.`);

    // 2. QUERY SETTINGS VIA REPOSITORY
    const settings = (await repos.settings.getAllAsMap()) || {};

    // Build central configuration payload
    const storeName = settings.site_name || 'زياد ستور';
    const currency = settings.default_currency || 'YER';
    
    const contact = {
      phone: settings.contact_phone || '+967775010726',
      whatsapp: settings.contact_whatsapp || '967775010726',
      email: settings.contact_email || 'zeyad775010@gmail.com',
      address: settings.contact_address || 'صنعاء، اليمن'
    };

    const social = [
      { id: 'facebook', name: 'Facebook', url: settings.social_facebook || 'https://facebook.com/zeyad', icon: 'fab fa-facebook-f', active: !!settings.social_facebook },
      { id: 'instagram', name: 'Instagram', url: settings.social_instagram || 'https://instagram.com/zeyad', icon: 'fab fa-instagram', active: !!settings.social_instagram },
      { id: 'tiktok', name: 'TikTok', url: settings.social_tiktok || 'https://tiktok.com/@zeyad', icon: 'fab fa-tiktok', active: !!settings.social_tiktok },
      { id: 'whatsapp', name: 'WhatsApp', url: `https://wa.me/${contact.whatsapp}`, icon: 'fab fa-whatsapp', active: true },
      { id: 'telegram', name: 'Telegram', url: settings.social_telegram || 'https://t.me/zeyad', icon: 'fab fa-telegram-plane', active: !!settings.social_telegram },
      { id: 'youtube', name: 'YouTube', url: settings.social_youtube || 'https://youtube.com/@zeyad', icon: 'fab fa-youtube', active: !!settings.social_youtube },
      { id: 'x', name: 'X (Twitter)', url: settings.social_x || 'https://x.com/zeyad', icon: 'fab fa-twitter', active: !!settings.social_x },
      { id: 'snapchat', name: 'Snapchat', url: settings.social_snapchat || 'https://snapchat.com/add/zeyad', icon: 'fab fa-snapchat-ghost', active: !!settings.social_snapchat }
    ];

    // Build the dynamic configuration file
    const configContent = `/**
 * Zeyad For Business - Central Configuration (Simulated Database/Backend Payload)
 * Auto-generated from SQLite database settings on ${new Date().toISOString()}
 */

window.ZFB_CONFIG = {
    storeName: ${JSON.stringify(storeName)},
    currency: ${JSON.stringify(currency)},
    exchangeRate: ${Number(settings.exchange_rate) || 140},
    
    contact: ${JSON.stringify(contact, null, 4)},

    social: ${JSON.stringify(social, null, 4)},

    calculators: {
        solar: {
            panel400w: 150,
            battery200a: 250,
            inverterBase: 500,
            conversionRateToLocal: 3.75
        },
        majlis: {
            fabricStandard: 300,
            fabricLuxury: 450,
            fabricRoyal: 600,
            woodStandard: 150,
            woodPremium: 250
        },
        kitchen: {
            aluminumStandard: 800,
            aluminumPremium: 1200,
            woodMDF: 1500,
            woodOak: 2200
        }
    },

    features: {
        enableVoiceSearch: true,
        enableImageSearch: false,
        showCartPopup: true
    }
};
`;

    fs.writeFileSync(CONFIG_JS_PATH, configContent, 'utf8');
    console.log('  Synced settings to zfb-config.js.');

    // 3. GENERATE SITEMAP & ROBOTS.TXT
    try {
      const { generateSitemapXml, generateRobotsTxt } = require('./sitemap-generator');
      generateSitemapXml();
      generateRobotsTxt();
      console.log('  Synced sitemap.xml and robots.txt.');
    } catch (sitemapErr) {
      console.error('  Error updating sitemap in sync:', sitemapErr.message);
    }

    console.log('Synchronization complete!');
    return true;
  } catch (error) {
    console.error('Error synchronizing database to frontend:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Serialization guard.
//
// syncFrontend() rewrites products_db.js / products_db.json / zfb-config.js in
// full (products_db.js is ~800KB). It is invoked from 14 admin write paths,
// and every one of them called it without awaiting, so two saves close together
// produced two overlapping runs: each gathers its own snapshot, then both write,
// and the slower run wins -- silently republishing the older snapshot over the
// newer one. The admin also got their redirect before any write had happened.
//
// This wrapper keeps at most one sync in flight. A request arriving while one is
// running is coalesced into a single follow-up run (rather than queueing N of
// them), which is enough because each run rebuilds from current database state.
// ---------------------------------------------------------------------------
const syncFrontendUnsafe = syncFrontend;

let inFlight = null;
let rerunQueued = false;

function syncFrontendSerialized() {
  if (inFlight) {
    rerunQueued = true;
    return inFlight;
  }

  inFlight = (async () => {
    let result = await syncFrontendUnsafe();
    while (rerunQueued) {
      rerunQueued = false;
      result = await syncFrontendUnsafe();
    }
    return result;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

// Run if called directly
if (require.main === module) {
  syncFrontendSerialized();
}

module.exports = { syncFrontend: syncFrontendSerialized, syncFrontendUnsafe };
