/**
 * Zeyad For Business - Admin Delivery Management Controller
 */

const router = require('express').Router();
const { deliveryService } = require('../../services/delivery-service');

// GET /admin/delivery - Delivery Dashboard & Policies List
router.get('/', async (req, res) => {
  try {
    const policies = (await deliveryService.getPolicies({ activeOnly: false })) || [];
    const provinces = (await deliveryService.getProvinces(false)) || [];

    const stats = {
      totalPolicies: policies.length,
      activePolicies: policies.filter(p => p.is_active === true || p.is_active === 1).length,
      totalProvinces: provinces.length,
      activeProvinces: provinces.filter(p => p.is_active === true || p.is_active === 1).length
    };

    res.render('admin/delivery/index', {
      title: 'إدارة سياسات وأسعار التوصيل',
      activeMenu: 'delivery',
      policies,
      provinces,
      stats,
      user: req.session?.admin_user
    });
  } catch (error) {
    console.error('Admin Delivery List Error:', error);
    res.status(500).render('admin/error', { message: error.message });
  }
});

// GET /admin/delivery/create - Create Policy View
router.get('/create', (req, res) => {
  res.render('admin/delivery/form', {
    title: 'إضافة سياسة توصيل جديدة',
    activeMenu: 'delivery',
    policy: null,
    user: req.session?.admin_user
  });
});

// POST /admin/delivery/create - Save New Policy
router.post('/create', async (req, res) => {
  try {
    const policy = await deliveryService.createPolicy(req.body, req.session?.admin_user);
    req.session.flash = { success: `تم إنشاء سياسة التوصيل "${policy.name_ar}" بنجاح` };
    res.redirect('/admin/delivery');
  } catch (error) {
    res.render('admin/delivery/form', {
      title: 'إضافة سياسة توصيل جديدة',
      activeMenu: 'delivery',
      policy: req.body,
      error: error.message,
      user: req.session?.admin_user
    });
  }
});

// GET /admin/delivery/:id/edit - Edit Policy View
router.get('/:id/edit', async (req, res) => {
  try {
    const policy = await deliveryService.getPolicyById(req.params.id);
    if (!policy) return res.redirect('/admin/delivery');

    res.render('admin/delivery/form', {
      title: `تعديل سياسة: ${policy.name_ar}`,
      activeMenu: 'delivery',
      policy,
      user: req.session?.admin_user
    });
  } catch (error) {
    res.redirect('/admin/delivery');
  }
});

// POST /admin/delivery/:id/edit - Update Policy
router.post('/:id/edit', async (req, res) => {
  try {
    const policy = await deliveryService.updatePolicy(req.params.id, req.body, req.session?.admin_user);
    req.session.flash = { success: `تم تحديث سياسة التوصيل "${policy.name_ar}" بنجاح` };
    res.redirect('/admin/delivery');
  } catch (error) {
    const policy = (await deliveryService.getPolicyById(req.params.id)) || req.body;
    res.render('admin/delivery/form', {
      title: `تعديل سياسة التوصيل`,
      activeMenu: 'delivery',
      policy: { ...policy, ...req.body },
      error: error.message,
      user: req.session?.admin_user
    });
  }
});

// POST /admin/delivery/:id/toggle - Toggle Policy Active Status
router.post('/:id/toggle', async (req, res) => {
  try {
    const result = await deliveryService.togglePolicy(req.params.id, req.session?.admin_user);
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, is_active: result.is_active });
    }
    res.redirect('/admin/delivery');
  } catch (error) {
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.redirect('/admin/delivery');
  }
});

// POST /admin/delivery/:id/delete - Delete Policy
router.post('/:id/delete', async (req, res) => {
  try {
    await deliveryService.deletePolicy(req.params.id, req.session?.admin_user);
    req.session.flash = { success: 'تم حذف سياسة التوصيل بنجاح' };
  } catch (error) {
    req.session.flash = { error: error.message };
  }
  res.redirect('/admin/delivery');
});

// POST /admin/delivery/provinces/:id/toggle - Toggle Province Active
router.post('/provinces/:id/toggle', async (req, res) => {
  try {
    const { getRepositories } = require('../../repositories');
    await getRepositories().delivery.toggleProvince(req.params.id);
    res.redirect('/admin/delivery#provinces');
  } catch (error) {
    res.redirect('/admin/delivery');
  }
});

module.exports = router;
