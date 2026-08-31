const router = require('express').Router();
const { getRepositories } = require('../../repositories');

router.get('/', async (req, res, next) => {
  try {
    const { settings: settingsRepo } = getRepositories();
    // Return only safe public settings
    const settings = await settingsRepo.findByGroups([
      'general', 'delivery', 'payment', 'contact', 'social', 'branding', 'commerce', 'theme'
    ]);

    const formatted = {};
    settings.forEach(s => {
      let val = s.value;
      if (s.type === 'json' && val) {
        try { val = JSON.parse(val); } catch (e) {}
      } else if (s.type === 'number' && val) {
        val = parseFloat(val);
      }
      formatted[s.key] = val;
    });

    res.json({ success: true, data: formatted });
  } catch (error) {
    next(error);
  }
});

router.get('/:key', async (req, res, next) => {
  try {
    const { settings: settingsRepo } = getRepositories();
    const setting = await settingsRepo.findByKey(req.params.key);
    if (!setting) {
      return res.status(404).json({ success: false, error: 'غير موجود' });
    }

    let val = setting.value;
    if (setting.type === 'json' && val) {
      try { val = JSON.parse(val); } catch (e) {}
    } else if (setting.type === 'number' && val) {
      val = parseFloat(val);
    }

    res.json({ success: true, data: { key: req.params.key, value: val } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
