const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const upload = require('../../middleware/upload');
const { setFlash, logAction } = require('../../middleware/auth');
const { syncFrontend } = require('../../utils/sync-frontend');
const { DEFAULT_TEMPLATE: DEFAULT_WHATSAPP_TEMPLATE } = require('../../services/whatsapp-message-service');

const fieldGroups = {
  general: ['site_name', 'default_currency', 'enabled_languages'],
  branding: ['site_logo', 'site_favicon'],
  contact: ['contact_phone', 'contact_whatsapp', 'contact_email', 'contact_address', 'google_maps_url'],
  social: ['social_facebook', 'social_instagram', 'social_tiktok'],
  payment: ['payment_methods'],
  shipping: ['shipping_methods'],
  seo: ['seo_title', 'seo_description'],
  analytics: ['analytics_head'],
  ai: ['ai_provider', 'ai_api_key'],
  orders: ['whatsapp_order_template']
};

function groupForKey(key) {
  return Object.entries(fieldGroups).find(([, keys]) => keys.includes(key))?.[0] || 'general';
}

function typeForValue(key, value) {
  if (key.includes('api_key')) return 'password';
  if (key.includes('description') || key.includes('methods') || key.includes('analytics')) return 'text';
  if (!Number.isNaN(Number(value)) && value !== '') return 'number';
  return 'string';
}

router.get('/', async (req, res, next) => {
  try {
    const { settings: settingsRepo } = getRepositories();
    const settingsRows = (await settingsRepo.findAll()) || [];
    const settings = {};
    settingsRows.forEach((setting) => { settings[setting.key] = setting.value || ''; });

    res.render('admin/settings/index', {
      title: 'إعدادات الموقع',
      active: 'settings',
      settings,
      fieldGroups,
      // Shown as the textarea placeholder so an operator can see exactly what
      // the default message looks like before overriding it.
      defaultWhatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', upload.fields([{ name: 'site_logo', maxCount: 1 }, { name: 'site_favicon', maxCount: 1 }]), async (req, res, next) => {
  try {
    const { settings: settingsRepo } = getRepositories();
    const allRows = (await settingsRepo.findAll()) || [];
    const oldSettings = allRows.map(s => ({ key: s.key, value: s.value }));
    const payload = { ...req.body };

    if (req.files?.site_logo?.[0]) payload.site_logo = `/uploads/media/${req.files.site_logo[0].filename}`;
    if (req.files?.site_favicon?.[0]) payload.site_favicon = `/uploads/media/${req.files.site_favicon[0].filename}`;

    const entriesToUpsert = [];
    Object.entries(payload).forEach(([key, value]) => {
      if (key === '_csrf') return;
      entriesToUpsert.push({
        key,
        value: Array.isArray(value) ? value.join(',') : String(value || ''),
        type: typeForValue(key, value),
        group_name: groupForKey(key)
      });
    });

    await settingsRepo.bulkUpsert(entriesToUpsert);

    await logAction(req.session.admin.id, 'UPDATE', 'settings', 'site', payload, oldSettings, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم حفظ الإعدادات بنجاح');
    res.redirect('/admin/settings');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
