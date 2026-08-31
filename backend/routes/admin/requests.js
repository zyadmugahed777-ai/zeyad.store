/**
 * Zeyad For Business - Admin Customer Request Center
 * Central Management, Search, Status Updates & Audit Logging
 * Refactored in Phase 1 Batch 4 to use Repository Layer.
 */

const router = require('express').Router();
const { buildRequestLink } = require('../../services/whatsapp-message-service');
const { getRepositories } = require('../../repositories');
const { customerRequestService, REQUEST_TYPE_MAP, REQUEST_STATUS_MAP, REQUEST_PRIORITY_MAP } = require('../../services/customer-request-service');
const { parsePagination } = require('../../utils/helpers');
const { setFlash } = require('../../middleware/auth');

/**
 * GET /admin/requests
 * List customer requests with filters & pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const search = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const type = (req.query.type || '').trim();
    const priority = (req.query.priority || '').trim();

    const stats = (await customerRequestService.getRequestStats()) || {};

    const result = await customerRequestService.listRequests({
      search,
      status,
      type,
      priority,
      page,
      limit
    });

    res.render('admin/requests/list', {
      title: 'مركز طلبات العملاء',
      active: 'requests',
      requests: result.items,
      stats,
      search,
      status,
      type,
      priority,
      typeMap: REQUEST_TYPE_MAP,
      statusMap: REQUEST_STATUS_MAP,
      priorityMap: REQUEST_PRIORITY_MAP,
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
 * GET /admin/requests/:id
 * Detailed view of single customer request
 */
router.get('/:id', async (req, res, next) => {
  try {
    const request = await customerRequestService.getRequest(req.params.id);

    if (!request) {
      setFlash(req, 'error', 'الطلب المطلوب غير موجود أو تم حذفه');
      return res.redirect('/admin/requests');
    }

    const { customerRequests: requestRepo } = getRepositories();
    const previousRequests = await requestRepo.findPreviousByPhone(request.phone, request.id, 5);

    res.render('admin/requests/detail', {
      // Worded for what the request actually is: a quote request is not an
      // order, and the customer should not be greeted as though it were.
      whatsappLink: buildRequestLink({ request, settings: res.locals.settings || {} }),
      title: `طلب رقم ${request.request_id}`,
      active: 'requests',
      request,
      previousRequests,
      typeMap: REQUEST_TYPE_MAP,
      statusMap: REQUEST_STATUS_MAP,
      priorityMap: REQUEST_PRIORITY_MAP
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/requests/:id/status
 * Update status, priority, and admin notes with audit log
 */
router.post('/:id/status', async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const { status, priority, admin_notes, assigned_to } = req.body;

    await customerRequestService.updateStatus(
      requestId,
      { status, priority, admin_notes, assigned_to },
      req.session?.admin,
      req.ip
    );

    setFlash(req, 'success', 'تم تحديث حالة الطلب وتسجيل الإجراء في سجل العمليات.');
    res.redirect(`/admin/requests/${requestId}`);

  } catch (error) {
    setFlash(req, 'error', error.message || 'حدث خطأ أثناء تحديث الطلب');
    res.redirect(`/admin/requests/${req.params.id}`);
  }
});

/**
 * GET /admin/requests/:id/print
 * Dedicated A4 print layout for single request
 */
router.get('/:id/print', async (req, res, next) => {
  try {
    const request = await customerRequestService.getRequest(req.params.id);

    if (!request) {
      return res.status(404).send('الطلب المطلوب غير موجود');
    }

    res.render('admin/requests/print', {
      title: `طباعة طلب ${request.request_id}`,
      request,
      typeMap: REQUEST_TYPE_MAP,
      statusMap: REQUEST_STATUS_MAP,
      priorityMap: REQUEST_PRIORITY_MAP,
      printDate: new Date().toLocaleString('ar-YE')
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
