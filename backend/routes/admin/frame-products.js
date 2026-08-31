const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { requireAuth, setFlash } = require('../../middleware/auth');

router.use(requireAuth);

// GET /admin/frame-products - Show Admin Selection Page for Frame Products
router.get('/', async (req, res, next) => {
  try {
    const { products: productRepo, settings: settingsRepo } = getRepositories();
    const products = (await productRepo.findAdminFrameList()) || [];

    // Get currently selected frame product IDs from settings
    const setting = await settingsRepo.findByKey('frame_product_ids');
    let selectedIds = [];
    if (setting && setting.value) {
      try { selectedIds = JSON.parse(setting.value); } catch (e) { selectedIds = []; }
    }

    res.render('admin/frame-products/index', {
      title: 'منتجات الإطار (العروض السريعة SuperDeals)',
      active: 'frame-products',
      products,
      selectedIds,
      csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || ''
    });
  } catch (error) {
    next(error);
  }
});

// POST /admin/frame-products - Save Selected Frame Products
router.post('/', async (req, res, next) => {
  try {
    const { settings: settingsRepo } = getRepositories();
    let frameIds = req.body.product_ids || [];
    if (!Array.isArray(frameIds)) {
      frameIds = [frameIds];
    }
    
    // Limit to max 20 products
    frameIds = frameIds.slice(0, 20);

    const jsonValue = JSON.stringify(frameIds);

    // The settings repository exposes exactly one write method, upsert(), on
    // both adapters. This branch called .update() and .set() -- neither exists
    // -- so saving the frame selection always died with
    // "settingsRepo.set is not a function". The signature is
    // upsert(key, value, type, group); the old .set() call also had the last
    // two arguments the wrong way round.
    await settingsRepo.upsert('frame_product_ids', jsonValue, 'json', 'commerce');

    setFlash(req, 'success', 'تم حفظ منتجات الإطار بنجاح!');
    res.redirect('/admin/frame-products');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
