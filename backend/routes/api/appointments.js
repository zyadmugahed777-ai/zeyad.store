const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { customerRequestService } = require('../../services/customer-request-service');
const { sanitize, normalizePhone } = require('../../utils/helpers');

router.post('/', async (req, res, next) => {
  try {
    const { fullName, phone, email, branch, date, time, visitType, city, notes } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    const message = [
      branch ? `الفرع: ${branch}` : '',
      date ? `التاريخ المفضل: ${date}` : '',
      time ? `الوقت المفضل: ${time}` : '',
      visitType ? `نوع الزيارة: ${visitType}` : '',
      notes ? `ملاحظات إضافية:\n${notes}` : ''
    ].filter(Boolean).join('\n');

    // 1. Create canonical Customer Request & linked notification
    const requestRecord = await customerRequestService.createRequest({
      requestType: 'appointment',
      customerName: fullName,
      phone,
      email,
      city,
      subject: `حجز موعد زيارة ${branch ? '— ' + branch : ''}`,
      message,
      source: 'web',
      pageUrl: req.headers.referer || '/appointment.html',
      guestId: req.headers['x-guest-id'] || null,
      customerId: req.session?.customer?.id || null
    });

    // 2. Legacy mirror insert via repository
    await getRepositories().customerRequests.createLegacyAppointment({
      full_name: sanitize(fullName),
      phone: normalizePhone(phone),
      branch: sanitize(branch),
      date: sanitize(date),
      time: sanitize(time),
      visit_type: sanitize(visitType),
      city: sanitize(city),
      notes: sanitize(notes)
    });

    res.json({
      success: true,
      requestId: requestRecord.requestId,
      message: 'تم تأكيد حجز الموعد بنجاح. نتشرف بزيارتكم!'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;