const router = require('express').Router();
const { getRepositories } = require('../../repositories');

router.get('/', async (req, res, next) => {
  try {
    const { branches: branchRepo } = getRepositories();
    const branches = await branchRepo.findAll({ is_active: 1 });
    res.json({ success: true, data: branches });
  } catch (error) {
    next(error);
  }
});

module.exports = router;