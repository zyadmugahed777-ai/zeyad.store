const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { notificationService } = require('../../services/notification-service');
const { uploadReportImage } = require('../../middleware/upload');
const { sanitize, normalizePhone } = require('../../utils/helpers');

// Rate limiting storage: IP/Session -> array of submission timestamps
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REPORTS_PER_WINDOW = 5;

// Clean up old rate limit entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, valid);
  }
}, 15 * 60 * 1000);

const ISSUE_TYPE_MAP = {
  product_error: 'خطأ في المنتج',
  price_error: 'خطأ في السعر',
  cart_issue: 'مشكلة في السلة',
  order_issue: 'مشكلة في الطلب',
  payment_issue: 'مشكلة في الدفع',
  site_bug: 'مشكلة في الموقع',
  mobile_issue: 'مشكلة في الهاتف',
  broken_link: 'رابط لا يعمل',
  missing_image: 'صورة لا تظهر',
  text_issue: 'مشكلة في الترجمة أو النصوص',
  other: 'مشكلة أخرى'
};

const STATUS_AR_MAP = {
  new: 'جديد',
  in_review: 'قيد المراجعة',
  verified: 'تم التحقق',
  rejected: 'غير معتمد',
  rewarded: 'تمت المكافأة',
  completed: 'تم الحل',
  closed: 'مغلق'
};

/**
 * POST /api/customer-reports
 * Public Submission with rate limiting, secure image upload, and contextual storage
 */
router.post('/', (req, res) => {
  uploadReportImage.single('image')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'خطأ في رفع الصورة' });
    }

    try {
      const repos = getRepositories();
      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      const sessionId = req.headers['x-guest-id'] || req.sessionID || ip;
      const rateKey = `${ip}_${sessionId}`;

      // Rate Limiting Check
      const now = Date.now();
      const userTimestamps = (rateLimitMap.get(rateKey) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
      if (userTimestamps.length >= MAX_REPORTS_PER_WINDOW) {
        return res.status(429).json({
          success: false,
          error: 'تم تجاوز الحد المسموح للإرسال المؤقت. يرجى الانتظار بضع دقائق قبل إرسال بلاغ جديد.'
        });
      }

      // Input Validation
      const customerName = sanitize(req.body.customerName || req.body.customer_name || '');
      const customerPhone = normalizePhone(req.body.customerPhone || req.body.customer_phone || '');
      const customerEmail = sanitize(req.body.customerEmail || req.body.customer_email || '');
      const issueType = String(req.body.issueType || req.body.issue_type || 'other').trim();
      const pageUrl = sanitize(req.body.pageUrl || req.body.page_url || '');
      const description = sanitize(req.body.description || '');
      const expectedBehavior = sanitize(req.body.expectedBehavior || req.body.expected_behavior || '');
      const actualBehavior = sanitize(req.body.actualBehavior || req.body.actual_behavior || '');
      
      // Anti-spoofing verification on context data
      let verifiedContext = {};
      try {
        const rawCtx = req.body.contextData || req.body.context_data;
        const parsed = typeof rawCtx === 'string' ? JSON.parse(rawCtx) : (rawCtx || {});
        if (parsed && typeof parsed === 'object') {
          if (parsed.productId) {
            // findById() already resolves a numeric id, a product_id string
            // and an sku. The old || fallback called findByProductId(), which
            // exists on no adapter -- so a report naming an unknown product
            // crashed with "findByProductId is not a function" instead of
            // simply failing verification.
            const prod = await repos.products.findById(parsed.productId);
            if (prod) verifiedContext.productId = prod.id, verifiedContext.productTitle = prod.title;
          }
          if (parsed.categoryId) {
            const cat = (await repos.categories.findById(parsed.categoryId)) || (await repos.categories.findBySlugWithCount(parsed.categoryId));
            if (cat) verifiedContext.categoryId = cat.id, verifiedContext.categoryName = cat.name_ar;
          }
          if (parsed.orderId) {
            const ord = await repos.orders.findById(parsed.orderId);
            if (ord && (!ord.customer_phone || normalizePhone(ord.customer_phone) === customerPhone)) {
              verifiedContext.orderId = ord.order_id;
            }
          }
          if (parsed.device) verifiedContext.device = sanitize(parsed.device);
          if (parsed.cartCount !== undefined) verifiedContext.cartCount = Number(parsed.cartCount) || 0;
          if (parsed.referrer) verifiedContext.referrer = sanitize(parsed.referrer);
          if (parsed.userAgent) verifiedContext.userAgent = sanitize(parsed.userAgent);
        }
      } catch (_) {}

      const contextDataStr = Object.keys(verifiedContext).length > 0 ? JSON.stringify(verifiedContext) : null;
      const issueTypeAr = ISSUE_TYPE_MAP[issueType] || ISSUE_TYPE_MAP.other;
      const imagePath = req.file ? `/uploads/reports/${req.file.filename}` : null;

      // Create Report via Repository
      const created = await repos.customerReports.create({
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        issue_type: issueType,
        issue_type_ar: issueTypeAr,
        page_url: pageUrl,
        description,
        expected_behavior: expectedBehavior,
        actual_behavior: actualBehavior,
        image_path: imagePath,
        context_data: contextDataStr,
        priority: 'medium',
        ip_address: ip,
        user_agent: req.headers['user-agent'] || ''
      });

      // Notify Admin via NotificationService
      try {
        await notificationService.createNotification({
          type: 'report',
          entityType: 'customer_report',
          entityId: created.reportId,
          title: 'بلاغ جديد عن مشكلة',
          message: `بلاغ جديد رقم ${created.reportNumber} حول: ${issueTypeAr} من ${customerName || customerPhone}`,
          actionUrl: `/admin/customer-reports/${created.reportId}`
        });
      } catch (_) {}

      // Record rate limit timestamp
      userTimestamps.push(now);
      rateLimitMap.set(rateKey, userTimestamps);

      res.status(201).json({
        success: true,
        reportNumber: created.reportNumber,
        trackingToken: created.trackingToken,
        message: 'تم استلام بلاغك بنجاح. شكراً لمساعدتنا في تحسين متجر زياد ستور!'
      });

    } catch (error) {
      console.error('Error submitting customer report:', error);
      res.status(500).json({ success: false, error: 'حدث خطأ أثناء حفظ البلاغ. يرجى المحاولة لاحقاً.' });
    }
  });
});

/**
 * GET /api/customer-reports/track/:reportNumber
 * Secure Tracking with Token / Phone authentication
 */
router.get('/track/:reportNumber', async (req, res) => {
  try {
    const repos = getRepositories();
    const rawNumber = String(req.params.reportNumber || '').trim().toUpperCase();
    const token = String(req.query.token || req.headers['x-tracking-token'] || '').trim();
    const phone = normalizePhone(req.query.phone || '');

    const report = (await repos.customerReports.findByReportNumberAndPhone(rawNumber, phone)) || (await repos.customerReports.findByReportNumber(rawNumber));

    if (!report) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على بلاغ بهذا الرقم.' });
    }

    // Update last customer view timestamp
    await repos.customerReports.touchCustomerView(report.id);

    const statusAr = STATUS_AR_MAP[report.status] || report.status;
    const isOwner = (token && token === report.tracking_token) || (phone && normalizePhone(report.customer_phone) === phone) || (req.session?.admin);

    if (isOwner) {
      let rewardData = null;
      if (report.reward_status === 'approved') {
        rewardData = {
          type: report.reward_type,
          value: report.reward_value,
          code: report.reward_code,
          status: report.reward_status,
          notes: report.reward_notes,
          approvedAt: report.approved_at
        };
      }

      return res.json({
        success: true,
        authenticated: true,
        data: {
          reportNumber: report.report_number,
          status: report.status,
          statusAr,
          issueType: report.issue_type,
          issueTypeAr: report.issue_type_ar || ISSUE_TYPE_MAP[report.issue_type] || 'مشكلة',
          customerName: report.customer_name,
          createdAt: report.created_at,
          updatedAt: report.updated_at,
          resolvedAt: report.resolved_at,
          rewardedAt: report.rewarded_at,
          description: report.description,
          expectedBehavior: report.expected_behavior,
          actualBehavior: report.actual_behavior,
          pageUrl: report.page_url,
          imagePath: report.image_path,
          hasReward: report.reward_status === 'approved',
          reward: rewardData
        }
      });
    }

    // Public / Unauthenticated high-level view (Zero sensitive info leakage)
    return res.json({
      success: true,
      authenticated: false,
      data: {
        reportNumber: report.report_number,
        status: report.status,
        statusAr,
        issueTypeAr: report.issue_type_ar || ISSUE_TYPE_MAP[report.issue_type] || 'مشكلة',
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        isResolved: ['completed', 'rewarded', 'closed'].includes(report.status),
        hint: 'لمشاهدة التفاصيل الكاملة والمكافأة، يرجى استخدام رمز المتابعة أو رقم الهاتف المسجل.'
      }
    });

  } catch (error) {
    console.error('Error tracking customer report:', error);
    res.status(500).json({ success: false, error: 'تعذر الاستعلام عن البلاغ حالياً.' });
  }
});

module.exports = router;
