const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { parsePagination } = require('../../utils/helpers');
const { setFlash } = require('../../middleware/auth');
const { couponService } = require('../../services/coupon-service');

const STATUS_MAP = {
  new: 'جديد',
  in_review: 'قيد المراجعة',
  verified: 'تم التحقق',
  rejected: 'غير معتمد',
  rewarded: 'تمت المكافأة',
  completed: 'تم الحل',
  closed: 'مغلق'
};

const PRIORITY_MAP = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  critical: 'حرجة ⚠️'
};

/**
 * GET /admin/customer-reports
 * List all customer issue reports with filters & pagination
 */
/**
 * GET /admin/customer-reports
 * List all customer issue reports with filters & pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const { customerReports: reportRepo } = getRepositories();
    const { page, limit, offset } = parsePagination(req.query);
    const search = (req.query.q || '').trim();
    const status = (req.query.status || '').trim();
    const priority = (req.query.priority || '').trim();

    const stats = (await reportRepo.getStats()) || {};

    const filters = { search, status, priority };
    const totalItems = await reportRepo.count(filters);
    const reports = await reportRepo.findAll(filters, limit, offset);

    res.render('admin/customer-reports/list', {
      title: 'بلاغات المشاكل والأخطاء',
      active: 'customer-reports',
      reports,
      stats,
      search,
      status,
      priority,
      statusMap: STATUS_MAP,
      priorityMap: PRIORITY_MAP,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit) || 1
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/customer-reports/:id
 * Detail view of single report
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { customerReports: reportRepo } = getRepositories();
    const report = await reportRepo.findById(req.params.id);

    if (!report) {
      setFlash(req, 'error', 'البلاغ غير موجود');
      return res.redirect('/admin/customer-reports');
    }

    // Parse context data
    let contextData = null;
    try {
      if (report.context_data) contextData = JSON.parse(report.context_data);
    } catch (_) {}

    // Find linked coupon and check redemption in orders via repo
    const { coupon, redeemedOrder } = (await reportRepo.findLinkedCouponAndOrder(report.reward_code)) || {};

    // Find previous reports from this customer phone
    const previousReports = await reportRepo.findPreviousByPhone(report.customer_phone, report.id, 5);

    res.render('admin/customer-reports/detail', {
      title: `بلاغ رقم ${report.report_number}`,
      active: 'customer-reports',
      report,
      contextData,
      coupon,
      redeemedOrder,
      previousReports,
      statusMap: STATUS_MAP,
      priorityMap: PRIORITY_MAP
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /admin/customer-reports/:id/print
 * Dedicated A4 printable layout
 */
router.get('/:id/print', async (req, res, next) => {
  try {
    const { customerReports: reportRepo } = getRepositories();
    const report = await reportRepo.findById(req.params.id);

    if (!report) {
      return res.status(404).send('البلاغ غير موجود');
    }

    let contextData = null;
    try {
      if (report.context_data) contextData = JSON.parse(report.context_data);
    } catch (_) {}

    res.render('admin/customer-reports/print', {
      title: `طباعة بلاغ ${report.report_number}`,
      report,
      contextData,
      statusMap: STATUS_MAP,
      priorityMap: PRIORITY_MAP,
      printDate: new Date().toLocaleString('ar-YE')
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/customer-reports/:id/status
 * Update status, priority, and internal admin notes
 */
router.post('/:id/status', async (req, res, next) => {
  try {
    const { customerReports: reportRepo, auth: authRepo } = getRepositories();
    const reportId = req.params.id;
    const { status, priority, admin_notes } = req.body;

    const current = await reportRepo.findById(reportId);
    if (!current) {
      setFlash(req, 'error', 'البلاغ غير موجود');
      return res.redirect('/admin/customer-reports');
    }

    let resolvedAt = current.resolved_at;
    let rejectedAt = current.rejected_at;

    if (['completed', 'closed'].includes(status) && !current.resolved_at) {
      resolvedAt = new Date().toISOString();
    }
    if (status === 'rejected' && !current.rejected_at) {
      rejectedAt = new Date().toISOString();
    }

    await reportRepo.updateStatus(reportId, {
      status: status || current.status,
      priority: priority || current.priority,
      admin_notes: admin_notes !== undefined ? admin_notes : current.admin_notes,
      resolved_at: resolvedAt,
      rejected_at: rejectedAt
    });

    try {
      await authRepo.logAction({
        user_id: req.session?.admin?.id || null,
        action: 'update_report_status',
        entity: 'customer_report',
        entity_id: String(reportId),
        old_values: JSON.stringify({ status: current.status, priority: current.priority }),
        new_values: JSON.stringify({ status, priority, admin_notes }),
        ip_address: req.ip || '127.0.0.1'
      });
    } catch (_) {}

    setFlash(req, 'success', 'تم تحديث حالة البلاغ بنجاح');
    res.redirect(`/admin/customer-reports/${reportId}`);

  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/customer-reports/:id/reward
 * Approve and issue real store coupon / discount reward
 */
router.post('/:id/reward', async (req, res, next) => {
  try {
    const { customerReports: reportRepo, auth: authRepo, tx } = getRepositories();
    const reportId = req.params.id;
    const { reward_type, reward_value, reward_notes } = req.body;

    const report = await reportRepo.findById(reportId);
    if (!report) {
      setFlash(req, 'error', 'البلاغ غير موجود');
      return res.redirect('/admin/customer-reports');
    }

    const value = parseFloat(reward_value) || 0;
    if (value <= 0 && reward_type !== 'free_shipping') {
      setFlash(req, 'error', 'يرجى إدخال قيمة صحيحة للمكافأة (أكبر من صفر)');
      return res.redirect(`/admin/customer-reports/${reportId}`);
    }

    const adminName = req.session?.admin?.full_name || 'Admin';

    // Atomic reward & coupon creation via CouponService & Repository
    let rewardCode = report.reward_code;

    await tx.run(async () => {
      const createdCoupon = await couponService.createRewardCouponForReport(
        report,
        value,
        reward_type === 'free_shipping' ? 'free_shipping' : 'percentage',
        adminName
      );
      rewardCode = createdCoupon.code;

      // Update customer report via repository
      await reportRepo.updateReward(reportId, {
        reward_type: createdCoupon.discount_type,
        reward_value: createdCoupon.discount_value,
        reward_code: rewardCode,
        reward_notes: reward_notes || '',
        approved_by: adminName
      });

      // Audit Log
      try {
        await authRepo.logAction({
          user_id: req.session?.admin?.id || null,
          action: 'grant_report_reward',
          entity: 'customer_report',
          entity_id: String(reportId),
          old_values: JSON.stringify({ reward_status: report.reward_status }),
          new_values: JSON.stringify({ reward_type: createdCoupon.discount_type, reward_value: createdCoupon.discount_value, reward_code: rewardCode, approved_by: adminName }),
          ip_address: req.ip || '127.0.0.1'
        });
      } catch (_) {}
    });

    setFlash(req, 'success', `تم اعتماد المكافأة بنجاح! تم إنشاء الكود (${rewardCode}) وربطه بالبلاغ.`);
    res.redirect(`/admin/customer-reports/${reportId}`);

  } catch (error) {
    next(error);
  }
});

module.exports = router;
