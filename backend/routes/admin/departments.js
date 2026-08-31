const express = require('express');
const router = express.Router();
const { getRepositories } = require('../../repositories');
const { setFlash, logAction } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const { publicPathFor } = require('../../middleware/upload');
const { parsePagination } = require('../../utils/helpers');

// List Departments
router.get('/', async (req, res) => {
  try {
    const { departments: departmentRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query, 10);
    const search = req.query.q || '';
    const status = req.query.status || '';

    const totalItems = await departmentRepo.count({ search, status });
    const departments = await departmentRepo.findAll({ search, status, limit, offset });

    res.render('admin/departments/list', {
      title: 'الأقسام الرئيسية (Departments)',
      active: 'departments',
      departments,
      search,
      status,
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
router.get('/create', (req, res) => {
  res.render('admin/departments/form', {
    title: 'إضافة قسم رئيسي',
    active: 'departments',
    department: null
  });
});

// Store
router.post('/create', upload.single('image'), async (req, res) => {
  try {
    const { departments: departmentRepo } = getRepositories();
    const { slug, name_ar, name_en, icon, description_ar, description_en, sort_order, is_active } = req.body;
    
    if (!slug || !name_ar) {
      throw new Error('الاسم العربي والـ Slug مطلوبان');
    }

    const imagePath = publicPathFor(req.file);

    const result = await departmentRepo.create({
      slug,
      name_ar,
      name_en: name_en || null,
      icon: icon || null,
      image: imagePath,
      description_ar: description_ar || null,
      description_en: description_en || null,
      sort_order: sort_order ? parseInt(sort_order, 10) : 0,
      is_active: is_active === 'on' ? 1 : 0
    });

    await logAction(req.session.admin.id, 'CREATE', 'departments', result.lastInsertRowid || result.id, req.body, null, req.ip);
    setFlash(req, 'success', 'تم إضافة القسم بنجاح');
    res.redirect('/admin/departments');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

// Edit Form
router.get('/:id/edit', async (req, res) => {
  const { departments: departmentRepo } = getRepositories();
  const department = await departmentRepo.findById(req.params.id);
  
  if (!department) {
    setFlash(req, 'danger', 'القسم غير موجود');
    return res.redirect('/admin/departments');
  }

  res.render('admin/departments/form', {
    title: 'تعديل القسم: ' + department.name_ar,
    active: 'departments',
    department
  });
});

// Update
router.post('/:id/edit', upload.single('image'), async (req, res) => {
  try {
    const { departments: departmentRepo } = getRepositories();
    const id = req.params.id;
    const oldDepartment = await departmentRepo.findById(id);
    
    if (!oldDepartment) throw new Error('القسم غير موجود');

    const { slug, name_ar, name_en, icon, description_ar, description_en, sort_order, is_active } = req.body;

    const imagePath = publicPathFor(req.file) || oldDepartment.image;

    await departmentRepo.update(id, {
      slug,
      name_ar,
      name_en: name_en || null,
      icon: icon || null,
      image: imagePath,
      description_ar: description_ar || null,
      description_en: description_en || null,
      sort_order: sort_order ? parseInt(sort_order, 10) : 0,
      is_active: is_active === 'on' ? 1 : 0
    });

    await logAction(req.session.admin.id, 'UPDATE', 'departments', id, req.body, oldDepartment, req.ip);
    setFlash(req, 'success', 'تم تعديل القسم بنجاح');
    res.redirect('/admin/departments');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

// Delete
router.post('/:id/delete', async (req, res) => {
  try {
    const { departments: departmentRepo } = getRepositories();
    const id = req.params.id;
    
    // Check if there are subcategories or products
    const subcats = await departmentRepo.countSubcategories(id);
    if (subcats > 0) throw new Error('لا يمكن حذف القسم لوجود فئات فرعية مرتبطة به');
    
    const products = await departmentRepo.countProducts(id);
    if (products > 0) throw new Error('لا يمكن حذف القسم لوجود منتجات مرتبطة به');

    const oldDepartment = await departmentRepo.findById(id);
    await departmentRepo.delete(id);
    
    await logAction(req.session.admin.id, 'DELETE', 'departments', id, null, oldDepartment, req.ip);
    setFlash(req, 'success', 'تم حذف القسم بنجاح');
    res.redirect('/admin/departments');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

module.exports = router;
