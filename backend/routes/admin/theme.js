const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { setFlash } = require('../../middleware/auth');

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    let themeConfig = await repos.settings.findByKey('theme_config');
    let themeData = {};
    if (themeConfig && themeConfig.value) {
      try {
        themeData = JSON.parse(themeConfig.value);
      } catch (e) {
        themeData = {};
      }
    }

    res.render('admin/theme-builder', {
      title: 'محرر المظهر المرئي (Theme Builder)',
      active: 'theme', // Highlight theme builder in sidebar
      themeData: JSON.stringify(themeData)
    });
  } catch (err) {
    next(err);
  }
});

router.post('/save', async (req, res) => {
  try {
    const repos = getRepositories();
    const { themeData } = req.body;
    
    if (!themeData) {
      return res.status(400).json({ success: false, message: 'بيانات غير صالحة' });
    }

    await repos.settings.upsert('theme_config', JSON.stringify(themeData), 'json', 'theme');
    
    res.json({ success: true, message: 'تم حفظ المظهر بنجاح' });
  } catch (err) {
    console.error('Theme Save Error:', err);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

module.exports = router;
