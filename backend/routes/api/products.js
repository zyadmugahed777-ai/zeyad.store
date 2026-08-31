const router = require('express').Router();
const { productService } = require('../../services/product-service');
const { parsePagination, paginationInfo } = require('../../utils/helpers');
const { getRepositories } = require('../../repositories');

function invalidateProductCache() {
  productService.invalidateSearchCache();
}

function normalizeProductImage(p) {
  let img = (p || '').trim().replace(/\\/g, '/');
  if (!img) return '/assets/placeholder.svg';
  if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:') || img.startsWith('blob:')) return img;
  if (!img.startsWith('/')) img = '/' + img;
  return img;
}

// Search autocomplete suggestions
router.get('/search/suggestions', async (req, res, next) => {
  try {
    const search = req.query.q || '';
    if (!search || search.trim().length < 2) {
      return res.json({ success: true, data: [], suggestions: [] });
    }

    const { fuse } = await productService.getSearchableProducts();
    const normalizeArabic = (text) => {
      if (!text) return '';
      return text.replace(/[أإآ]/g, 'ا').replace(/[ة]/g, 'ه').replace(/[ى]/g, 'ي').replace(/[ؤ]/g, 'و').replace(/[ئ]/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').toLowerCase().trim();
    };
    
    const results = fuse.search(normalizeArabic(search));

    let exactMatches = results.filter(r => r.score <= 0.3).map(r => ({
      ...r.item,
      main_image: normalizeProductImage(r.item.main_image)
    }));

    let suggestions = results.filter(r => r.score > 0.3 && r.score <= 0.55).map(r => ({
      ...r.item,
      main_image: normalizeProductImage(r.item.main_image)
    }));

    if (exactMatches.length === 0 && suggestions.length > 0) {
      exactMatches = suggestions.slice(0, 3);
      suggestions = suggestions.slice(3, 8);
    } else {
      exactMatches = exactMatches.slice(0, 6);
      suggestions = suggestions.slice(0, 4);
    }

    exactMatches.sort((a, b) => {
      if (a.is_best_seller && !b.is_best_seller) return -1;
      if (!a.is_best_seller && b.is_best_seller) return 1;
      return 0;
    });

    res.json({ success: true, data: exactMatches, suggestions });
  } catch (err) {
    next(err);
  }
});

// List and search products
router.get('/', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { category, subcategory, department, search, min_price, max_price, sort, is_new, is_best_seller } = req.query;

    const result = await productService.listProducts(
      { category, subcategory, department, search, min_price, max_price, sort, is_new, is_best_seller },
      { page, limit }
    );

    res.json({
      success: true,
      data: result.products,
      pagination: paginationInfo(page, limit, result.total)
    });
  } catch (error) {
    next(error);
  }
});

// Frame Deals / SuperDeals Marquee
router.get('/frame-deals', async (req, res, next) => {
  try {
    const { settings: settingsRepo, products: productRepo } = getRepositories();
    const setting = await settingsRepo.findByKey('frame_product_ids');
    let selectedIds = [];
    if (setting && setting.value) {
      try { selectedIds = JSON.parse(setting.value); } catch (e) { selectedIds = []; }
    }

    const products = await productRepo.findFrameDeals(selectedIds);

    const normalizedProducts = (products || []).map(p => ({
      ...p,
      main_image: normalizeProductImage(p.main_image)
    }));

    res.json({ success: true, data: normalizedProducts });
  } catch (error) {
    next(error);
  }
});

// Single product detail
router.get('/:id', async (req, res, next) => {
  try {
    const pid = String(req.params.id || '').trim();
    const product = await productService.getProductById(pid);
    if (!product || !product.is_active) {
      return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.invalidateProductCache = invalidateProductCache;
