const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { setFlash } = require('../../middleware/auth');
const upload = require('../../middleware/upload');
const { publicPathFor } = require('../../middleware/upload');

// List
router.get('/', async (req, res, next) => {
  try {
    const { branches: branchRepo } = getRepositories();
    const branches = (await branchRepo.findAll()) || [];
    res.render('admin/branches/list', {
      title: 'الفروع',
      active: 'branches',
      branches
    });
  } catch (error) {
    next(error);
  }
});

// Create Form
router.get('/create', (req, res) => {
  res.render('admin/branches/form', {
    title: 'إضافة فرع جديد',
    active: 'branches',
    branch: null
  });
});

// Store
router.post('/create', upload.single('image'), async (req, res) => {
  try {
    const { branches: branchRepo } = getRepositories();
    const { name_ar, name_en, city, address, phone, whatsapp, google_maps, working_hours, sort_order, is_active } = req.body;
    if (!name_ar) throw new Error('اسم الفرع مطلوب');

    let imagePath = null;
    if (req.file) imagePath = publicPathFor(req.file);

    await branchRepo.create({
      name_ar,
      name_en: name_en || null,
      city: city || null,
      address: address || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      google_maps: google_maps || null,
      working_hours: working_hours || null,
      image: imagePath,
      sort_order: sort_order ? parseInt(sort_order, 10) : 0,
      is_active: is_active === 'on' ? 1 : 0
    });

    setFlash(req, 'success', 'تم إضافة الفرع بنجاح');
    res.redirect('/admin/branches');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

// Edit Form
router.get('/:id/edit', async (req, res) => {
  const { branches: branchRepo } = getRepositories();
  const branch = await branchRepo.findById(req.params.id);
  if (!branch) {
    setFlash(req, 'danger', 'الفرع غير موجود');
    return res.redirect('/admin/branches');
  }
  res.render('admin/branches/form', {
    title: 'تعديل الفرع: ' + branch.name_ar,
    active: 'branches',
    branch
  });
});

// Update
router.post('/:id/edit', upload.single('image'), async (req, res) => {
  try {
    const { branches: branchRepo } = getRepositories();
    const old = await branchRepo.findById(req.params.id);
    if (!old) throw new Error('الفرع غير موجود');

    const { name_ar, name_en, city, address, phone, whatsapp, google_maps, working_hours, sort_order, is_active } = req.body;
    let imagePath = old.image;
    if (req.file) imagePath = publicPathFor(req.file);

    await branchRepo.update(req.params.id, {
      name_ar,
      name_en: name_en || null,
      city: city || null,
      address: address || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      google_maps: google_maps || null,
      working_hours: working_hours || null,
      image: imagePath,
      sort_order: sort_order ? parseInt(sort_order, 10) : 0,
      is_active: is_active === 'on' ? 1 : 0
    });

    setFlash(req, 'success', 'تم تعديل الفرع بنجاح');
    res.redirect('/admin/branches');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

// Delete
router.post('/:id/delete', async (req, res) => {
  try {
    const { branches: branchRepo } = getRepositories();
    await branchRepo.delete(req.params.id);
    setFlash(req, 'success', 'تم حذف الفرع');
    res.redirect('/admin/branches');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

module.exports = router;