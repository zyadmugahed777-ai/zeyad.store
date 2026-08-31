const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { parsePagination } = require('../../utils/helpers');
const { setFlash, logAction } = require('../../middleware/auth');
const { notificationService } = require('../../services/notification-service');

router.get('/', async (req, res, next) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query);
    const search = req.query.q || '';
    const read = req.query.read || '';
    const type = req.query.type || '';

    const filters = {
      search,
      read,
      type,
      adminOrder: true
    };

    const totalItems = await notifRepo.count(filters);
    const notifications = await notifRepo.findAll(filters, limit, offset);

    res.render('admin/notifications/list', {
      title: 'إدارة الإشعارات',
      active: 'notifications',
      notifications,
      search,
      read,
      type,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1
    });
  } catch (error) {
    next(error);
  }
});

router.get('/create', (req, res) => {
  res.render('admin/notifications/form', {
    title: 'إنشاء إشعار',
    active: 'notifications',
    notification: null
  });
});

router.post('/create', async (req, res) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    const payload = {
      type: (req.body.type || 'general').trim(),
      title: (req.body.title || '').trim(),
      message: (req.body.message || '').trim(),
      reference_id: req.body.reference_id || null,
      is_read: req.body.is_read === 'on' ? 1 : 0
    };
    if (!payload.title) throw new Error('عنوان الإشعار مطلوب');

    const createdId = await notifRepo.create(payload);

    await logAction(req.session.admin.id, 'CREATE', 'notifications', createdId, payload, null, req.ip);
    setFlash(req, 'success', 'تم إنشاء الإشعار');
    res.redirect('/admin/notifications');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('back');
  }
});

router.get('/:id/open', async (req, res) => {
  const result = await notificationService.resolveNotification(req.params.id);
  if (result.warning) {
    setFlash(req, 'warning', result.warning);
  }
  res.redirect(result.targetUrl || '/admin/notifications');
});

router.post('/:id/read', async (req, res) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    await notifRepo.markAsRead(req.params.id);
    await logAction(req.session.admin.id, 'MARK_READ', 'notifications', req.params.id, null, null, req.ip);
    setFlash(req, 'success', 'تم تعليم الإشعار كمقروء');
    res.redirect('/admin/notifications');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/notifications');
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.ids].filter(Boolean);
    const action = req.body.action;
    if (!ids.length || !action) {
      setFlash(req, 'danger', 'حدد إشعارات واختر عملية');
      return res.redirect('/admin/notifications');
    }

    if (action === 'read') {
      await notifRepo.markMultipleAsRead(ids);
    } else if (action === 'unread') {
      await notifRepo.markMultipleAsUnread(ids);
    } else if (action === 'delete') {
      await notifRepo.deleteMultiple(ids);
    }

    await logAction(req.session.admin.id, `BULK_${action.toUpperCase()}`, 'notifications', ids.join(','), { ids }, null, req.ip);
    setFlash(req, 'success', 'تم تنفيذ العملية الجماعية');
    res.redirect('/admin/notifications');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/notifications');
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    const { notifications: notifRepo } = getRepositories();
    const oldNotification = await notifRepo.findById(req.params.id);
    await notifRepo.delete(req.params.id);
    await logAction(req.session.admin.id, 'DELETE', 'notifications', req.params.id, null, oldNotification, req.ip);
    setFlash(req, 'success', 'تم حذف الإشعار');
    res.redirect('/admin/notifications');
  } catch (error) {
    setFlash(req, 'danger', error.message);
    res.redirect('/admin/notifications');
  }
});

module.exports = router;
