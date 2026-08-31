const express = require('express');
const router = express.Router();
const { getRepositories } = require('../../repositories');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { setFlash, logAction } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const { publicPathFor } = require('../../middleware/upload');
const { parsePagination } = require('../../utils/helpers');
const { syncFrontend } = require('../../utils/sync-frontend');

/*
 * The storefront knows exactly four category shapes. Anything else -- a typo,
 * a stale form, a crafted POST -- becomes NULL, which the renderer treats as
 * the default card. Never trust the value the browser sent; the database has a
 * CHECK constraint saying the same thing, and this keeps a bad value from
 * turning a save into a 500.
 */
const CATEGORY_DISPLAY_STYLES = ['card', 'circle', 'pill', 'compact'];

function safeDisplayStyle(value) {
  const v = String(value == null ? '' : value).trim();
  return CATEGORY_DISPLAY_STYLES.includes(v) ? v : null;
}


// API: Get categories by department
router.get('/api/by-department/:id', async (req, res) => {
  try {
    const { categories: categoryRepo } = getRepositories();
    const categories = await categoryRepo.findByDepartment(req.params.id);
    res.json({ success: true, data: categories });
  } catch(error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List Categories
router.get('/', async (req, res) => {
  try {
    const { categories: categoryRepo, departments: departmentRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query, 10);
    const search = req.query.q || '';
    const status = req.query.status || '';
    const department_id = req.query.department_id || '';

    const filterObj = {
      search,
      status,
      department_id,
      withAdminProductCount: true,
      limit,
      offset
    };

    const totalItems = await categoryRepo.count({ search, status, department_id });
    const categories = await categoryRepo.findAll(filterObj);
    const departments = await departmentRepo.listSimple();

    res.render('admin/categories/list', {
      title: 'الفئات والتصنيفات',
      active: 'categories',
      categories,
      departments,
      search,
      status,
      department_id,
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

// Create Form
router.get('/create', async (req, res) => {
  const { departments: departmentRepo } = getRepositories();
  const departments = await departmentRepo.listSimple();
  
  res.render('admin/categories/form', {
    title: 'إضافة تصنيف جديد',
    active: 'categories',
    category: null,
    departments
  });
});

// Store
router.post('/create', upload.single('image'), async (req, res) => {
  try {
    const { categories: categoryRepo } = getRepositories();
    const { department_id, slug, name_ar, name_en, description_ar, sort_order, is_active, display_style } = req.body;
    
    if (!slug || !name_ar || !department_id) {
      throw new Error('الاسم، الرابط، والقسم مطلوبان');
    }

    const code = 'CAT-' + Math.random().toString(36).substr(2, 5).toUpperCase();

    let imagePath = null;
    if (req.file) {
      const file = req.file;
      const webpFilename = file.filename.replace(path.extname(file.filename), '.webp');
      const webpPath = path.join(file.destination, webpFilename);
      await sharp(file.path).webp({ quality: 85 }).toFile(webpPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      // Derived from where multer actually wrote the file rather than a
      // hardcoded subfolder that happened to match.
      imagePath = publicPathFor(file, webpFilename);
    }

    const result = await categoryRepo.create({
      code,
      department_id,
      slug,
      name_ar,
      name_en: name_en || null,
      image: imagePath,
      description_ar: description_ar || null,
      sort_order: sort_order ? parseInt(sort_order, 10) : 0,
      display_style: safeDisplayStyle(display_style),
      is_active: is_active === 'on' ? 1 : 0
    });

    await logAction(req.session.admin.id, 'CREATE', 'categories', result.lastInsertRowid || result.id, req.body, null, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم إضافة التصنيف بنجاح');
    res.redirect('/admin/categories');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

// Edit Form
router.get('/:id/edit', async (req, res) => {
  const { categories: categoryRepo, departments: departmentRepo } = getRepositories();
  const category = await categoryRepo.findById(req.params.id);
  
  if (!category) {
    setFlash(req, 'danger', 'التصنيف غير موجود');
    return res.redirect('/admin/categories');
  }

  const departments = await departmentRepo.listSimple();

  res.render('admin/categories/form', {
    title: 'تعديل التصنيف: ' + category.name_ar,
    active: 'categories',
    category,
    departments
  });
});

// Update
router.post('/:id/edit', upload.single('image'), async (req, res) => {
  try {
    const { categories: categoryRepo } = getRepositories();
    const id = req.params.id;
    const oldCategory = await categoryRepo.findById(id);
    
    if (!oldCategory) throw new Error('التصنيف غير موجود');

    const { department_id, slug, name_ar, name_en, description_ar, sort_order, is_active, display_style } = req.body;

    let imagePath = oldCategory.image;
    if (req.file) {
      const file = req.file;
      const webpFilename = file.filename.replace(path.extname(file.filename), '.webp');
      const webpPath = path.join(file.destination, webpFilename);
      await sharp(file.path).webp({ quality: 85 }).toFile(webpPath);
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      // Derived from where multer actually wrote the file rather than a
      // hardcoded subfolder that happened to match.
      imagePath = publicPathFor(file, webpFilename);
    }

    await categoryRepo.update(id, {
      department_id,
      slug,
      name_ar,
      name_en: name_en || null,
      image: imagePath,
      description_ar: description_ar || null,
      sort_order: sort_order ? parseInt(sort_order, 10) : 0,
      display_style: safeDisplayStyle(display_style),
      is_active: is_active === 'on' ? 1 : 0
    });

    await logAction(req.session.admin.id, 'UPDATE', 'categories', id, req.body, oldCategory, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم تعديل التصنيف بنجاح');
    res.redirect('/admin/categories');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

// Delete
router.post('/:id/delete', async (req, res) => {
  try {
    const { categories: categoryRepo } = getRepositories();
    const id = req.params.id;
    
    const productsCount = await categoryRepo.getProductCount(id);
    if (productsCount > 0) throw new Error('لا يمكن حذف التصنيف لوجود منتجات مرتبطة به');

    const oldCategory = await categoryRepo.findById(id);
    await categoryRepo.delete(id);
    
    await logAction(req.session.admin.id, 'DELETE', 'categories', id, null, oldCategory, req.ip);
    await syncFrontend();
    setFlash(req, 'success', 'تم حذف التصنيف بنجاح');
    res.redirect('/admin/categories');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

module.exports = router;