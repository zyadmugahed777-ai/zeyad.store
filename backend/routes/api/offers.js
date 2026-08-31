const router = require('express').Router();
const { getRepositories } = require('../../repositories');

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const now = new Date().toISOString();
    const offers = await repos.offers.findActive(now);
    res.json({ success: true, data: offers });
  } catch (error) {
    next(error);
  }
});

module.exports = router;