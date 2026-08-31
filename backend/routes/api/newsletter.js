const router = require('express').Router();
const { getRepositories } = require('../../repositories');

router.post('/', async (req, res, next) => {
  try {
    const { newsletter: newsletterRepo } = getRepositories();
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'بريد إلكتروني غير صالح' });
    }

    await newsletterRepo.subscribe(email);

    res.json({ success: true, message: 'تم الاشتراك في النشرة البريدية بنجاح' });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const { newsletter: newsletterRepo } = getRepositories();
    const { email } = req.body;
    if (email) {
      await newsletterRepo.unsubscribe(email);
    }
    res.json({ success: true, message: 'تم إلغاء الاشتراك' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;