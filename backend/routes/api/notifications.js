const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { parsePagination, paginationInfo } = require('../../utils/helpers');

// Live polling endpoint for fast badge updates
router.get('/poll', async (req, res, next) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    const since = req.query.since || null;
    const unreadCount = await notifRepo.getUnreadCount();
    const latest = await notifRepo.getRecent(5, since);

    res.json({
      success: true,
      unreadCount,
      latest,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query);

    const totalItems = await notifRepo.count({});
    const notifications = await notifRepo.findAll({}, limit, offset);
    const unreadCount = await notifRepo.getUnreadCount();

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: paginationInfo(page, limit, totalItems)
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/read', async (req, res, next) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    await notifRepo.markAsRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;