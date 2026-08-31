const express = require('express');
const router = express.Router();
const { getRepositories } = require('../../repositories');
const { setFlash, logAction } = require('../../middleware/auth');
const { parsePagination } = require('../../utils/helpers');

// List Pages
router.get('/', async (req, res) => {
  try {
    const cmsRepo = getRepositories().cms;
    const { page, limit, offset } = parsePagination(req.query, 20);
    const search = req.query.q || '';
    const type = req.query.type || '';

    let where = '1=1';
    const params = [];

    if (search) {
      where += ' AND (title_ar LIKE ? OR title_en LIKE ? OR slug LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (type !== '') {
      where += ' AND page_type = ?';
      params.push(type);
    }

    const totalItems = await cmsRepo.countPages(where, params);
    const pagesList = await cmsRepo.findPages(where, params, limit, offset);

    res.render('admin/pages/list', {
      title: 'إدارة الصفحات (CMS)',
      active: 'pages',
      pagesList,
      search,
      type,
      page,
      limit,
      totalPages: Math.ceil(totalItems / limit),
      totalItems
    });
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin');
  }
});

// Edit Page Settings
router.get('/:id/settings', async (req, res) => {
  const cmsRepo = getRepositories().cms;
  const cmsPage = await cmsRepo.getPageById(req.params.id);
  
  if (!cmsPage) {
    setFlash(req, 'danger', 'الصفحة غير موجودة');
    return res.redirect('/admin/pages');
  }

  res.render('admin/pages/settings', {
    title: 'إعدادات الصفحة: ' + cmsPage.title_ar,
    active: 'pages',
    cmsPage
  });
});

// Update Page Settings
router.post('/:id/settings', async (req, res) => {
  try {
    const cmsRepo = getRepositories().cms;
    const id = req.params.id;
    const oldPage = await cmsRepo.getPageById(id);
    
    if (!oldPage) throw new Error('الصفحة غير موجودة');

    const { title_ar, title_en, is_active } = req.body;

    await cmsRepo.updatePageSettings(id, {
      title_ar,
      title_en: title_en || null,
      is_active: is_active === 'on' ? 1 : 0
    });

    await logAction(req.session.admin.id, 'UPDATE', 'cms_pages', id, req.body, oldPage, req.ip);
    setFlash(req, 'success', 'تم تعديل إعدادات الصفحة بنجاح');
    res.redirect('/admin/pages');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

// Visual Editor Redirect
router.get('/:id/editor', (req, res) => {
  res.redirect(`/admin/editor?page_id=${req.params.id}`);
});

module.exports = router;
