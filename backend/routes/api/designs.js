const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { customerRequestService } = require('../../services/customer-request-service');
const { sanitize, normalizePhone } = require('../../utils/helpers');

router.post('/', async (req, res, next) => {
  try {
    const { customerRequests: requestRepo } = getRepositories();
    const { fullName, phone, email, designType, dimensions, budget, stylePref, details } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    const message = [
      designType ? `نوع التصميم: ${designType}` : '',
      dimensions ? `المقاسات / الأبعاد: ${dimensions}` : '',
      budget ? `الميزانية المقترحة: ${budget}` : '',
      stylePref ? `النمط المفضل: ${stylePref}` : '',
      details ? `تفاصيل الفكرة:\n${details}` : ''
    ].filter(Boolean).join('\n');

    // 1. Create canonical Customer Request & linked notification
    const requestRecord = await customerRequestService.createRequest({
      requestType: 'design',
      customerName: fullName,
      phone,
      email,
      subject: `طلب تصميم داخلي ${designType ? '— ' + designType : ''}`,
      message,
      source: 'web',
      pageUrl: req.headers.referer || '/design-request.html',
      guestId: req.headers['x-guest-id'] || null,
      customerId: req.session?.customer?.id || null
    });

    // 2. Legacy mirror insert via repository
    await requestRepo.createLegacyDesign({
      full_name: sanitize(fullName),
      phone: normalizePhone(phone),
      design_type: sanitize(designType),
      dimensions: sanitize(dimensions),
      budget: sanitize(budget),
      style_pref: sanitize(stylePref),
      details: sanitize(details)
    });

    res.json({
      success: true,
      requestId: requestRecord.requestId,
      message: 'تم إرسال طلب التصميم بنجاح. سيتواصل معك مهندس التصميم لمراجعة التفاصيل.'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;