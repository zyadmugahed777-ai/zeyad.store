/**
 * Zeyad For Business - Admin Coupon Management Route
 * Manage store coupons, rewards, free shipping, usage tracking & audit logging
 */

const router = require('express').Router();
const { couponService, ALLOWED_COUPON_TYPES, ALLOWED_SCOPES } = require('../../services/coupon-service');
const { parsePagination } = require('../../utils/helpers');
const { setFlash } = require('../../middleware/auth');

/**
 * GET /admin/coupons
 * List coupons with stats, filters & pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const search = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const type = (req.query.type || '').trim();
    const scope = (req.query.scope || '').trim();

    const stats = await couponService.getCouponStats();

    const result = await couponService.listCoupons({
      search,
      status,
      type,
      scope,
      page,
      limit
    });

    res.render('admin/coupons/list', {
      title: 'إدارة الكوبونات والخصومات',
      active: 'coupons',
      coupons: result.items,
      stats,
      search,
      status,
      type,
      scope,
      typeMap: ALLOWED_COUPON_TYPES,
      scopeMap: ALLOWED_SCOPES,
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
      totalPages: result.totalPages
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/coupons/create
 * Show coupon creation form
 */
router.get('/create', (req, res) => {
  res.render('admin/coupons/form', {
    title: 'إنشاء كود كوبون جديد',
    active: 'coupons',
    coupon: null,
    typeMap: ALLOWED_COUPON_TYPES,
    scopeMap: ALLOWED_SCOPES
  });
});

/**
 * POST /admin/coupons/create
 * Handle coupon creation
 */
router.post('/create', async (req, res) => {
  try {
    const {
      code,
      discount_type,
      discount_value,
      min_order,
      max_uses,
      start_date,
      end_date,
      scope,
      customer_phone,
      notes
    } = req.body;

    const newCoupon = await couponService.createCoupon({
      code,
      discountType: discount_type,
      discountValue: discount_value,
      minOrder: min_order,
      maxUses: max_uses,
      startDate: start_date,
      endDate: end_date,
      scope,
      customerPhone: customer_phone,
      notes,
      sourceType: 'admin'
    }, req.session?.admin, req.ip);

    setFlash(req, 'success', `تم إنشاء الكوبون (${newCoupon.code}) بنجاح!`);
    res.redirect('/admin/coupons');

  } catch (error) {
    setFlash(req, 'error', error.message || 'حدث خطأ أثناء إنشاء الكوبون');
    res.redirect('/admin/coupons/create');
  }
});

/**
 * GET /admin/coupons/:id/edit
 * Show coupon edit form
 */
router.get('/:id/edit', async (req, res, next) => {
  try {
    const coupon = await couponService.getCouponById(req.params.id);
    if (!coupon) {
      setFlash(req, 'error', 'الكوبون غير موجود');
      return res.redirect('/admin/coupons');
    }

    const { getRepositories } = require('../../repositories');
    const recentOrders = await getRepositories().coupons.findRecentOrders(coupon.id, coupon.code);

    res.render('admin/coupons/form', {
      title: `تعديل الكوبون - ${coupon.code}`,
      active: 'coupons',
      coupon,
      recentOrders,
      typeMap: ALLOWED_COUPON_TYPES,
      scopeMap: ALLOWED_SCOPES
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/coupons/:id/edit
 * Update coupon
 */
router.post('/:id/edit', async (req, res) => {
  try {
    const {
      discount_type,
      discount_value,
      min_order,
      max_uses,
      start_date,
      end_date,
      is_active,
      scope,
      customer_phone,
      notes
    } = req.body;

    await couponService.updateCoupon(req.params.id, {
      discountType: discount_type,
      discountValue: discount_value,
      minOrder: min_order,
      maxUses: max_uses,
      startDate: start_date,
      endDate: end_date,
      isActive: is_active === '1' || is_active === 'on' || is_active === 1,
      scope,
      customerPhone: customer_phone,
      notes
    }, req.session?.admin, req.ip);

    setFlash(req, 'success', 'تم تحديث بيانات الكوبون بنجاح');
    res.redirect('/admin/coupons');

  } catch (error) {
    setFlash(req, 'error', error.message || 'حدث خطأ أثناء تعديل الكوبون');
    res.redirect(`/admin/coupons/${req.params.id}/edit`);
  }
});

/**
 * POST /admin/coupons/:id/toggle
 * Toggle active status
 */
router.post('/:id/toggle', async (req, res) => {
  try {
    const coupon = await couponService.getCouponById(req.params.id);
    if (!coupon) {
      setFlash(req, 'error', 'الكوبون غير موجود');
      return res.redirect('/admin/coupons');
    }

    await couponService.updateCoupon(coupon.id, {
      isActive: coupon.is_active ? 0 : 1
    }, req.session?.admin, req.ip);

    setFlash(req, 'success', `تم ${coupon.is_active ? 'تعطيل' : 'تفعيل'} الكوبون بنجاح`);
    res.redirect('/admin/coupons');

  } catch (error) {
    setFlash(req, 'error', error.message);
    res.redirect('/admin/coupons');
  }
});

/**
 * POST /admin/coupons/:id/delete
 * Delete coupon
 */
router.post('/:id/delete', async (req, res) => {
  try {
    await couponService.deleteCoupon(req.params.id, req.session?.admin, req.ip);
    setFlash(req, 'success', 'تم حذف الكوبون بنجاح');
    res.redirect('/admin/coupons');
  } catch (error) {
    setFlash(req, 'error', error.message);
    res.redirect('/admin/coupons');
  }
});

module.exports = router;
