const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const upload = require('../../middleware/upload');
const { parsePagination } = require('../../utils/helpers');
const { setFlash, logAction } = require('../../middleware/auth');
const { syncFrontend } = require('../../utils/sync-frontend');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function normalizeBanner(body, file) {
  if (!(body.title || '').trim()) throw new Error('عنوان البنر مطلوب');
  return {
    title: body.title.trim(),
    subtitle: (body.subtitle || '').trim(),
    body: (body.body || '').trim(),
    image: file ? `/uploads/banners/${file.filename}` : body.existing_image || '',
    desktop_image: file ? `/uploads/banners/${file.filename}` : body.existing_desktop_image || body.existing_image || '',
    mobile_image: body.mobile_image || '',
    button_text: (body.button_text || '').trim(),
    link: (body.link || '').trim(),
    position: body.position || 'home',
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    status: body.status || 'draft',
    is_active: body.status === 'active' ? 1 : 0,
    sort_order: Number(body.sort_order || 0)
  };
}

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const { page, limit, offset } = parsePagination(req.query, 20);
    const search = req.query.q || '';
    const position = req.query.position || '';
    const status = req.query.status || '';

    const { banners, totalItems } = await repos.banners.findAll({
      search,
      position,
      status,
      limit,
      offset
    });

    res.render('admin/banners/list', {
      title: 'إدارة البنرات',
      active: 'banners',
      banners,
      search,
      position,
      status,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/create', (req, res) => {
  res.render('admin/banners/form', {
    title: 'إضافة بنر',
    active: 'banners',
    banner: null
  });
});

router.post('/create', upload.single('image'), async (req, res) => {
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
    const banner = normalizeBanner(req.body, req.file);
    if (!banner.image) throw new Error('صورة البنر مطلوبة');

    const created = await repos.banners.create(banner);

    await logAction(req.session.admin.id, 'CREATE', 'banners', created.id, banner, null, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم إنشاء البنر بنجاح');
    res.redirect('/admin/banners');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

router.get('/:id/edit', async (req, res) => {
  const repos = getRepositories();
  const banner = await repos.banners.findById(req.params.id);
  if (!banner) {
    setFlash(req, 'danger', 'البنر غير موجود');
    return res.redirect('/admin/banners');
  }
  res.render('admin/banners/form', {
    title: 'تعديل بنر',
    active: 'banners',
    banner
  });
});

router.post('/:id/edit', upload.single('image'), async (req, res) => {
  try {
    const repos = getRepositories();
    const oldBanner = await repos.banners.findById(req.params.id);
    if (!oldBanner) {
      setFlash(req, 'danger', 'البنر غير موجود');
      return res.redirect('/admin/banners');
    }

    if (req.file) {
      const file = req.file;
      const webpFilename = file.filename.replace(path.extname(file.filename), '.webp');
      const webpPath = path.join(file.destination, webpFilename);
      await sharp(file.path).webp({ quality: 85 }).toFile(webpPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      req.file.filename = webpFilename;
    }

    req.body.existing_image = oldBanner.image;
    req.body.existing_desktop_image = oldBanner.desktop_image;
    const banner = normalizeBanner(req.body, req.file);
    await repos.banners.update(req.params.id, banner);

    await logAction(req.session.admin.id, 'UPDATE', 'banners', req.params.id, banner, oldBanner, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم تحديث البنر بنجاح');
    res.redirect('/admin/banners');
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
      setFlash(req, 'danger', 'حدد بنرات واختر عملية');
      return res.redirect('/admin/banners');
    }

    await repos.banners.bulkAction(action, ids);

    await logAction(req.session.admin.id, `BULK_${action.toUpperCase()}`, 'banners', ids.join(','), { ids }, null, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم تنفيذ العملية الجماعية');
    res.redirect('/admin/banners');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/banners');
  }
});

router.post('/sort', async (req, res) => {
  try {
    const repos = getRepositories();
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    await repos.banners.updateSortOrder(ids);
    await logAction(req.session.admin.id, 'SORT', 'banners', 'bulk', { ids }, null, req.ip);
    await syncFrontend();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    const repos = getRepositories();
    const oldBanner = await repos.banners.findById(req.params.id);
    await repos.banners.delete(req.params.id);
    await logAction(req.session.admin.id, 'DELETE', 'banners', req.params.id, null, oldBanner, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم حذف البنر');
    res.redirect('/admin/banners');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/banners');
  }
});

module.exports = router;
