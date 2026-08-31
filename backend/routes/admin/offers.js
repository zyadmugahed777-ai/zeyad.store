const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const upload = require('../../middleware/upload');
const { parsePagination } = require('../../utils/helpers');
const { setFlash, logAction } = require('../../middleware/auth');
const { syncFrontend } = require('../../utils/sync-frontend');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Storefront pages, for the "show this offer on one specific page" selector.
 * Read from the CMS registry, which is itself derived from the storefront
 * directory -- so the list stays right as pages are added.
 */
async function listSitePages(repos) {
  try {
    return ((await repos.cms.getPages()) || [])
      .filter((p) => p.is_active !== false)
      .map((p) => ({ slug: p.slug, title_ar: p.title_ar || p.slug }))
      .sort((a, b) => a.title_ar.localeCompare(b.title_ar, 'ar'));
  } catch (_) {
    return [];
  }
}

function normalizeOffer(body, file) {
  const title = (body.title_ar || '').trim();
  if (!title) throw new Error('عنوان العرض مطلوب');

  const discountValue = Number(body.discount_value || 0);
  const discountAmount = Number(body.discount_amount || 0);
  if (discountValue < 0 || discountAmount < 0) throw new Error('قيمة الخصم غير صحيحة');

  return {
    title_ar: title,
    title_en: (body.title_en || '').trim(),
    description: (body.description || '').trim(),
    image: file ? `/uploads/offers/${file.filename}` : body.existing_image || null,
    button_text: (body.button_text || '').trim(),
    link: (body.link || '').trim(),
    coupon_code: (body.coupon_code || '').trim().toUpperCase(),
    discount_type: body.discount_type || 'percentage',
    discount_value: discountValue,
    discount_amount: discountAmount,
    min_order: body.min_order ? Number(body.min_order) : null,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    department_id: body.department_id || null,
    category_id: body.category_id || null,
    product_id_ref: body.product_id_ref || null,
    placement: Array.isArray(body.placement) ? body.placement.join(',') : (body.placement || 'home'),
    status: body.status || 'draft',
    is_active: body.status === 'active' ? 1 : 0,
    sort_order: Number(body.sort_order || 0),
    applicable_categories: body.category_id || '',
    applicable_products: body.product_id_ref || ''
  };
}

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const { page, limit, offset } = parsePagination(req.query, 20);
    const search = req.query.q || '';
    const status = req.query.status || '';
    const placement = req.query.placement || '';

    const { offers, totalItems } = await repos.offers.findAll({
      search,
      status,
      placement,
      limit,
      offset
    });

    res.render('admin/offers/list', {
      title: 'إدارة العروض',
      active: 'offers',
      offers,
      search,
      status,
      placement,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/create', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const opts = (await repos.offers.listFormOptions()) || {};
    res.render('admin/offers/form', {
      title: 'إضافة عرض',
      active: 'offers',
      offer: null,
      sitePages: await listSitePages(repos),
      ...opts
    });
  } catch (error) {
    next(error);
  }
});

router.post('/create', upload.single('image'), async (req, res, next) => {
  try {
    const repos = getRepositories();
    if (req.file) {
      const file = req.file;
      const webpFilename = file.filename.replace(path.extname(file.filename), '.webp');
      const webpPath = path.join(file.destination, webpFilename);
      await sharp(file.path).webp({ quality: 85 }).toFile(webpPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      req.file.filename = webpFilename;
    }
    const offer = normalizeOffer(req.body, req.file);
    const created = await repos.offers.create(offer);

    await logAction(req.session.admin.id, 'CREATE', 'offers', created.id, offer, null, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم إنشاء العرض بنجاح');
    res.redirect('/admin/offers');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const offer = await repos.offers.findById(req.params.id);
    if (!offer) {
      setFlash(req, 'danger', 'العرض غير موجود');
      return res.redirect('/admin/offers');
    }
    const opts = (await repos.offers.listFormOptions()) || {};
    res.render('admin/offers/form', {
      title: 'تعديل عرض',
      active: 'offers',
      offer,
      sitePages: await listSitePages(repos),
      ...opts
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/edit', upload.single('image'), async (req, res) => {
  try {
    const repos = getRepositories();
    const oldOffer = await repos.offers.findById(req.params.id);
    if (!oldOffer) {
      setFlash(req, 'danger', 'العرض غير موجود');
      return res.redirect('/admin/offers');
    }

    if (req.file) {
      const file = req.file;
      const webpFilename = file.filename.replace(path.extname(file.filename), '.webp');
      const webpPath = path.join(file.destination, webpFilename);
      await sharp(file.path).webp({ quality: 85 }).toFile(webpPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      req.file.filename = webpFilename;
    }

    req.body.existing_image = oldOffer.image;
    const offer = normalizeOffer(req.body, req.file);
    await repos.offers.update(req.params.id, offer);

    await logAction(req.session.admin.id, 'UPDATE', 'offers', req.params.id, offer, oldOffer, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم تحديث العرض بنجاح');
    res.redirect('/admin/offers');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const repos = getRepositories();
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.ids].filter(Boolean);
    const action = req.body.action;

    if (!ids.length || !action) {
      setFlash(req, 'danger', 'حدد عروضاً واختر عملية');
      return res.redirect('/admin/offers');
    }

    await repos.offers.bulkAction(action, ids);

    await logAction(req.session.admin.id, `BULK_${action.toUpperCase()}`, 'offers', ids.join(','), { ids }, null, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم تنفيذ العملية الجماعية');
    res.redirect('/admin/offers');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/offers');
  }
});

router.post('/sort', async (req, res) => {
  try {
    const repos = getRepositories();
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    await repos.offers.updateSortOrder(ids);
    await logAction(req.session.admin.id, 'SORT', 'offers', 'bulk', { ids }, null, req.ip);
    await syncFrontend();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    const repos = getRepositories();
    const oldOffer = await repos.offers.findById(req.params.id);
    await repos.offers.delete(req.params.id);
    await logAction(req.session.admin.id, 'DELETE', 'offers', req.params.id, null, oldOffer, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم حذف العرض');
    res.redirect('/admin/offers');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/offers');
  }
});

module.exports = router;
