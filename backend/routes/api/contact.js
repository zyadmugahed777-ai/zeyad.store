const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { customerRequestService } = require('../../services/customer-request-service');
const { sanitize, normalizePhone } = require('../../utils/helpers');

router.post('/', async (req, res, next) => {
  try {
    const fullName = req.body.fullName || req.body.contactName || req.body.name || '';
    const phone = req.body.phone || req.body.contactPhone || '';
    const email = req.body.email || req.body.contactEmail || '';
    const subject = req.body.subject || req.body.contactSubject || 'طلب اتصال (نحن نتصل بك)';
    const message = req.body.message || req.body.details || req.body.notes || subject;
    const pageUrl = req.body.pageUrl || req.body.page_url || req.headers.referer || '';
    const entityType = req.body.entityType || req.body.entity_type || null;
    const entityId = req.body.entityId || req.body.entity_id || null;

    if (!fullName) {
      return res.status(400).json({ success: false, error: 'الاسم مطلوب لإرسال الطلب' });
    }
    if (!phone) {
      return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب لتأكيد الاتصال' });
    }

    // 1. Create canonical Customer Request in Database & Linked Notification
    const requestRecord = await customerRequestService.createRequest({
      requestType: 'contact',
      customerName: fullName,
      phone,
      email,
      subject,
      message,
      source: 'web',
      pageUrl,
      entityType,
      entityId,
      guestId: req.headers['x-guest-id'] || null,
      customerId: req.session?.customer?.id || null
    });

    // 2. Legacy mirror insert for backward compatibility via repository
    await getRepositories().customerRequests.createLegacyContact({
      full_name: sanitize(fullName),
      phone: normalizePhone(phone),
      email: sanitize(email),
      subject: sanitize(subject),
      message: sanitize(message)
    });

    res.json({
      success: true,
      requestId: requestRecord.requestId,
      message: 'تم استلام طلب الاتصال بنجاح. سيتواصل معك أحد مستشارينا في أقرب وقت.'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;