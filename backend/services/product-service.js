/**
 * Zeyad For Business - Central Product Service
 * Single Source of Truth for Product Data & Operations (backed by Repository Layer).
 * Automatically orchestrates cache updates to products_db.js and products_db.json.
 */

const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const { getRepositories } = require('../repositories');
const { syncFrontend } = require('../utils/sync-frontend');

function normalizeArabic(text) {
  if (!text) return '';
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeImagePath(img) {
  let p = (img || '').trim().replace(/\\/g, '/');
  if (!p) return '/assets/placeholder.svg';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:') || p.startsWith('blob:')) return p;
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

class ProductService {
  constructor(repo) {
    this._repo = repo || null;
    this.fuseInstance = null;
    this.cachedSearchProducts = [];
    this.lastCacheTime = 0;
    this.CACHE_TTL = 1000 * 60 * 5; // 5 minutes
  }

  get repo() {
    return this._repo || getRepositories().products;
  }

  invalidateSearchCache() {
    this.fuseInstance = null;
    this.cachedSearchProducts = [];
    this.lastCacheTime = 0;
  }

  async getSearchableProducts() {
    const now = Date.now();
    if (this.fuseInstance && (now - this.lastCacheTime < this.CACHE_TTL)) {
      return { fuse: this.fuseInstance, products: this.cachedSearchProducts };
    }

    this.cachedSearchProducts = await this.repo.findSearchable();

    this.cachedSearchProducts.forEach(p => {
      p.main_image = normalizeImagePath(p.main_image);
      p.search_title = normalizeArabic(p.title);
      p.search_desc = normalizeArabic(p.description);
      p.search_category = normalizeArabic(p.category_name);
      p.search_brand = normalizeArabic(p.brand);
    });

    const options = {
      includeScore: true,
      shouldSort: true,
      threshold: 0.5,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: 'search_title', weight: 0.55 },
        { name: 'search_category', weight: 0.25 },
        { name: 'search_brand', weight: 0.1 },
        { name: 'search_desc', weight: 0.1 }
      ]
    };

    this.fuseInstance = new Fuse(this.cachedSearchProducts, options);
    this.lastCacheTime = now;
    return { fuse: this.fuseInstance, products: this.cachedSearchProducts };
  }

  async getProductById(idOrProductId) {
    const product = await this.repo.findById(idOrProductId);
    if (!product) return null;

    const images = await this.repo.findImages(product.id);
    const specs = await this.repo.findSpecs(product.id);
    const faqs = await this.repo.findFaqs(product.id);
    const colors = await this.repo.findColors(product.id);

    /* Sizes were saved by the admin into product_sizes and read back by the
       sync that builds products_db.json, but this -- the endpoint the live
       product page actually calls -- never loaded them, so a product with two
       sizes reached the customer as a product with none. Guarded with a
       capability check because the sqlite repository predates the table. */
    const sizes = typeof this.repo.findSizes === 'function'
      ? await this.repo.findSizes(product.id)
      : [];

    const gallery = (images || []).map(img => normalizeImagePath(img.image_path));
    if (gallery.length === 0) gallery.push('/assets/placeholder.svg');

    /* Which photographs belong to which colour, so choosing "أزرق" on the
       product page shows the blue room. Images with no colour stay general
       product photos and are not listed under any colour. */
    const colorImages = {};
    for (const img of images || []) {
      const key = (img.color_name || '').trim();
      if (!key) continue;
      if (!colorImages[key]) colorImages[key] = [];
      colorImages[key].push(normalizeImagePath(img.image_path));
    }

    return {
      ...product,
      main_image: gallery[0],
      images: images.map(i => ({ ...i, image_path: normalizeImagePath(i.image_path) })),
      gallery,
      specs,
      faqs,
      colors,
      sizes: (sizes || []).map(s => ({ label: s.label, price: Number(s.price) })),
      colorImages
    };
  }

  async listProducts(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { category, subcategory, department, search, min_price, max_price, is_new, is_best_seller, sort } = filters;
    const { page, limit } = pagination;
    const offset = Math.max(0, (page - 1) * limit);

    // If search is requested, use fuzzy search engine
    if (search && search.trim().length >= 2) {
      const { fuse } = await this.getSearchableProducts();
      const normalizedQuery = normalizeArabic(search);
      const searchResults = fuse.search(normalizedQuery);
      
      let filtered = searchResults.map(r => r.item);

      if (category) {
        filtered = filtered.filter(p => String(p.category_id) === String(category) || p.category_name === category);
      }
      if (department) {
        filtered = filtered.filter(p => String(p.department_id) === String(department));
      }
      if (min_price) filtered = filtered.filter(p => p.price >= parseFloat(min_price));
      if (max_price) filtered = filtered.filter(p => p.price <= parseFloat(max_price));
      if (is_new) filtered = filtered.filter(p => p.is_new === true || p.is_new === 1);
      if (is_best_seller) filtered = filtered.filter(p => p.is_best_seller === true || p.is_best_seller === 1);

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      return {
        products: paginated,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    }

    const total = await this.repo.count({ category, department, min_price, max_price, is_new, is_best_seller, sort });
    const rawProducts = await this.repo.findAll(
      { category, department, min_price, max_price, is_new, is_best_seller, sort },
      limit,
      offset
    );

    const products = rawProducts.map(p => ({
      ...p,
      main_image: normalizeImagePath(p.main_image)
    }));

    return {
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async createProduct(productData, images = [], specs = [], faqs = [], colors = []) {
    const createdId = await this.repo.create(productData, images, specs, faqs, colors);
    this.invalidateSearchCache();
    await this.syncStaticCache();
    return await this.getProductById(createdId);
  }

  async updateProduct(id, productData, newImages = null, specs = null, faqs = null, colors = null) {
    await this.repo.update(id, productData, newImages, specs, faqs, colors);
    this.invalidateSearchCache();
    await this.syncStaticCache();
    return await this.getProductById(id);
  }

  async setPrimaryImage(productId, imageId) {
    const p = await this.getProductById(productId);
    if (!p) throw new Error(`Product not found: ${productId}`);

    await this.repo.setPrimaryImage(p.id, imageId);
    this.invalidateSearchCache();
    await this.syncStaticCache();
    return await this.getProductById(p.id);
  }

  async deleteProductImage(productId, imageId) {
    const p = await this.getProductById(productId);
    if (!p) throw new Error(`Product not found: ${productId}`);

    const deletedImg = await this.repo.deleteImage(p.id, imageId);

    // Physical file deletion only if user uploaded to /uploads/
    if (deletedImg && deletedImg.image_path) {
      const imgPath = deletedImg.image_path.trim();
      if (imgPath.startsWith('/uploads/products/') || imgPath.startsWith('/uploads/media/') || imgPath.startsWith('uploads/products/')) {
        try {
          const fsPath = path.join(__dirname, '..', '..', imgPath.replace(/^\//, ''));
          if (fs.existsSync(fsPath)) {
            fs.unlinkSync(fsPath);
          }
        } catch (err) {
          console.warn('Could not delete image file:', err.message);
        }
      }
    }

    this.invalidateSearchCache();
    await this.syncStaticCache();
    return await this.getProductById(p.id);
  }

  async deleteProduct(id) {
    await this.repo.archive(id);
    this.invalidateSearchCache();
    await this.syncStaticCache();
    return true;
  }

  async checkStockAvailability(productId, requestedQty = 1) {
    const product = await this.repo.checkStock(productId);
    if (!product) return { available: false, reason: 'المنتج غير موجود' };
    if (!product.is_active) return { available: false, reason: 'المنتج غير نشط حالياً' };
    // stock_status is stored in both 'out-of-stock' and 'out_of_stock' spellings
    // across the codebase. Comparing only the hyphen form fails open here -- an
    // underscore-spelled out-of-stock product would be reported as available and
    // sellable, which is the one direction of this bug that costs money.
    if (String(product.stock_status || '').trim().toLowerCase().replace(/_/g, '-') === 'out-of-stock') {
      return { available: false, reason: 'المنتج نفد من المخزون' };
    }
    if (product.stock_quantity < requestedQty) return { available: false, reason: `الكمية المتوفرة (${product.stock_quantity}) أقل من المطلوب (${requestedQty})` };
    return { available: true, product };
  }

  // Was synchronous while calling the async syncFrontend() without awaiting,
  // so the try/catch could never actually catch a sync failure and callers had
  // no way to know whether the static frontend cache had been rebuilt.
  async syncStaticCache() {
    try {
      return await syncFrontend();
    } catch (err) {
      console.error('Failed to sync static cache:', err.message);
      return false;
    }
  }

  async verifyCacheConsistency() {
    const dbProducts = (await this.repo.findActiveForCache()) || [];

    const cachePath = path.join(__dirname, '..', '..', 'products_db.json');
    if (!fs.existsSync(cachePath)) {
      return { isConsistent: false, error: 'products_db.json file does not exist', discrepancies: ['Cache missing'] };
    }

    let cacheData = [];
    try {
      cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {
      return { isConsistent: false, error: 'products_db.json parse error: ' + e.message, discrepancies: ['Cache unparseable'] };
    }

    const discrepancies = [];
    const cacheMap = new Map();
    cacheData.forEach(p => {
      cacheMap.set(String(p.id), p);
      if (p.product_id) cacheMap.set(String(p.product_id), p);
    });

    for (const p of dbProducts) {
      const key = String(p.product_id || p.id);
      const cached = cacheMap.get(key) || cacheMap.get(String(p.id));
      if (!cached) {
        discrepancies.push(`DB product [${key}: ${p.title}] missing from static cache`);
      } else {
        if (Math.abs(Number(cached.price) - Number(p.price)) > 0.01) {
          discrepancies.push(`Price mismatch for [${key}]: DB=${p.price}, Cache=${cached.price}`);
        }
        if (cached.title !== p.title) {
          discrepancies.push(`Title mismatch for [${key}]: DB=${p.title}, Cache=${cached.title}`);
        }
      }
    }

    return {
      isConsistent: discrepancies.length === 0,
      dbCount: dbProducts.length,
      cacheCount: cacheData.length,
      discrepancies
    };
  }
}

const productServiceInstance = new ProductService();

module.exports = {
  ProductService,
  productService: productServiceInstance,
  normalizeImagePath
};
