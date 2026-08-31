const router = require('express').Router();
const { getRepositories } = require('../../repositories');

function normalizeCatImage(img) {
  let p = (img || '').trim().replace(/\\/g, '/');
  if (!p) return '/assets/placeholder.svg';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:') || p.startsWith('blob:')) return p;
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

router.get('/', async (req, res, next) => {
  try {
    const { categories: categoryRepo } = getRepositories();
    const categories = await categoryRepo.findAll({
      is_active: 1,
      withProductCount: true
    });

    const normalized = categories.map(cat => ({
      ...cat,
      image: normalizeCatImage(cat.image)
    }));

    res.json({ success: true, data: normalized });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const { categories: categoryRepo } = getRepositories();
    const slug = req.params.slug;
    const category = await categoryRepo.findBySlugWithCount(slug);

    if (!category) {
      return res.status(404).json({ success: false, error: 'التصنيف غير موجود' });
    }

    category.image = normalizeCatImage(category.image);

    const products = await categoryRepo.findCategoryProducts(category.id, 100);

    const normalizedProducts = products.map(p => ({
      ...p,
      main_image: normalizeCatImage(p.main_image)
    }));

    res.json({
      success: true,
      data: {
        ...category,
        products: normalizedProducts
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;