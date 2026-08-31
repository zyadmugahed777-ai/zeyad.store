const router = require('express').Router();
const { getRepositories } = require('../../repositories');

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const position = req.query.position || 'home';
    const now = new Date().toISOString();
    const banners = await repos.banners.findActiveByPosition(position, now);
    res.json({ success: true, data: banners });
  } catch (error) {
    next(error);
  }
});

module.exports = router;