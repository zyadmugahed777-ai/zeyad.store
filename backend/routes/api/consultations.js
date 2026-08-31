const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { customerRequestService } = require('../../services/customer-request-service');
const { sanitize, normalizePhone } = require('../../utils/helpers');
const upload = require('../../middleware/upload');

router.post('/', upload.array('attachments', 5), async (req, res, next) => {
  try {
    const { media: mediaRepo, customerRequests: requestRepo } = getRepositories();
    const { fullName, phone, email, consultationType, details, city, contactMethod } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    let attachments = [];
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        const filePath = '/uploads/consultations/' + f.filename;
        attachments.push(filePath);
        await mediaRepo.create({
          filename: f.filename,
          original_name: f.originalname,
          mime_type: f.mimetype,
          size: f.size,
          path: filePath,
          folder: 'consultations'
        });
      }
    }

    const message = [
      consultationType ? `نوع الاستشارة: ${consultationType}` : '',
      contactMethod ? `طريقة التواصل المفضلة: ${contactMethod}` : '',
      city ? `المدينة: ${city}` : '',
      details ? `تفاصيل الطلب:\n${details}` : ''
    ].filter(Boolean).join('\n');

    // 1. Create canonical Customer Request & linked notification
    const requestRecord = await customerRequestService.createRequest({
      requestType: 'consultation',
      customerName: fullName,
      phone,
      email,
      city,
      subject: `طلب استشارة ${consultationType ? '— ' + consultationType : ''}`,
      message,
      attachments,
      source: 'web',
      pageUrl: req.headers.referer || '/consultation.html',
      guestId: req.headers['x-guest-id'] || null,
      customerId: req.session?.customer?.id || null
    });

    // 2. Legacy mirror insert via repository
    await requestRepo.createLegacyConsultation({
      full_name: sanitize(fullName),
      phone: normalizePhone(phone),
      consultation_type: sanitize(consultationType),
      details: sanitize(details),
      city: sanitize(city),
      contact_method: sanitize(contactMethod),
      attachments: JSON.stringify(attachments)
    });

    res.json({
      success: true,
      requestId: requestRecord.requestId,
      message: 'تم إرسال طلب الاستشارة بنجاح. سيتواصل معك أحد المتخصصين قريباً.'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;