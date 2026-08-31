const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getRepositories } = require('../../repositories');
const { parsePagination } = require('../../utils/helpers');
const { setFlash, logAction } = require('../../middleware/auth');

function normalizeUser(body, isCreate = false) {
  const payload = {
    username: (body.username || '').trim(),
    full_name: (body.full_name || '').trim(),
    email: (body.email || '').trim(),
    role_id: Number(body.role_id || 2),
    role: (body.role || 'admin').trim(),
    // The users form posts an HTML checkbox with no value attribute, so a
    // ticked box arrives as the literal string 'on' -- that path was and is
    // correct. But anything else truthy ('1', 1, true) silently fell to 0,
    // which creates a DISABLED account while the panel reports success, and
    // the new user is then told "wrong username or password" when they try to
    // sign in. Accept the ordinary truthy spellings so a programmatic caller
    // cannot trip that quietly.
    is_active: ['on', '1', 1, true, 'true'].includes(body.is_active) ? 1 : 0
  };
  if (!payload.username) throw new Error('اسم المستخدم مطلوب');
  if (isCreate && !body.password) throw new Error('كلمة المرور مطلوبة');
  if (body.password && body.password.length < 8) throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  return payload;
}

router.get('/', async (req, res, next) => {
  try {
    const { auth: authRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query, 20);
    const search = req.query.q || '';
    const roleId = req.query.role_id || '';

    const totalItems = await authRepo.countAdminUsers({ search, role_id: roleId });
    const users = await authRepo.findAllAdminUsers({ search, role_id: roleId, limit, offset });
    const roles = await authRepo.findAllRoles();

    res.render('admin/users/list', {
      title: 'إدارة المستخدمين',
      active: 'users',
      users,
      roles,
      search,
      roleId,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/create', async (req, res) => {
  const { auth: authRepo } = getRepositories();
  const roles = await authRepo.findAllRoles();
  res.render('admin/users/form', {
    title: 'إضافة مستخدم',
    active: 'users',
    user: null,
    roles
  });
});

router.post('/create', async (req, res) => {
  try {
    const { auth: authRepo } = getRepositories();
    const user = normalizeUser(req.body, true);
    const role = await authRepo.findRoleById(user.role_id);
    user.role = role ? role.name : user.role;
    const passwordHash = bcrypt.hashSync(req.body.password, 10);

    const result = await authRepo.createAdminUser({
      ...user,
      password_hash: passwordHash
    });

    await logAction(req.session.admin.id, 'CREATE', 'admin_users', result.lastInsertRowid || result.id, user, null, req.ip);
    setFlash(req, 'success', 'تم إنشاء المستخدم');
    res.redirect('/admin/users');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

router.get('/:id/edit', async (req, res) => {
  const { auth: authRepo } = getRepositories();
  const user = await authRepo.findAdminById(req.params.id);
  if (!user) {
    setFlash(req, 'danger', 'المستخدم غير موجود');
    return res.redirect('/admin/users');
  }
  const roles = await authRepo.findAllRoles();
  res.render('admin/users/form', {
    title: 'تعديل مستخدم',
    active: 'users',
    user,
    roles
  });
});

router.post('/:id/edit', async (req, res) => {
  try {
    const { auth: authRepo } = getRepositories();
    const oldUser = await authRepo.findAdminFullById(req.params.id);
    if (!oldUser) throw new Error('المستخدم غير موجود');

    const user = normalizeUser(req.body, false);
    const role = await authRepo.findRoleById(user.role_id);
    user.role = role ? role.name : user.role;

    await authRepo.updateAdminUser(req.params.id, user);

    if (req.body.password) {
      await authRepo.updateAdminPassword(req.params.id, bcrypt.hashSync(req.body.password, 10));
    }

    await logAction(req.session.admin.id, 'UPDATE', 'admin_users', req.params.id, user, oldUser, req.ip);
    setFlash(req, 'success', 'تم تحديث المستخدم');
    res.redirect('/admin/users');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    const { auth: authRepo } = getRepositories();
    if (Number(req.params.id) === Number(req.session.admin.id)) {
      setFlash(req, 'danger', 'لا يمكنك حذف حسابك الحالي');
      return res.redirect('/admin/users');
    }
    const oldUser = await authRepo.findAdminFullById(req.params.id);
    await authRepo.deleteAdminUser(req.params.id);
    await logAction(req.session.admin.id, 'DELETE', 'admin_users', req.params.id, null, oldUser, req.ip);
    setFlash(req, 'success', 'تم حذف المستخدم');
    res.redirect('/admin/users');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/users');
  }
});

module.exports = router;
