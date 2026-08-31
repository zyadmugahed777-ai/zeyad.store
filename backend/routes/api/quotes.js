const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { customerRequestService } = require('../../services/customer-request-service');
const { sanitize, normalizePhone } = require('../../utils/helpers');
const upload = require('../../middleware/upload');

router.post('/', upload.single('boqFile'), async (req, res, next) => {
  try {
    const { media: mediaRepo, customerRequests: requestRepo } = getRepositories();
    const { fullName, phone, companyName, email, projectType, productsDetails } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    let boqPath = '';
    let attachments = [];
    if (req.file) {
      boqPath = '/uploads/quotes/' + req.file.filename;
      attachments.push(boqPath);
      await mediaRepo.create({
        filename: req.file.filename,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size: req.file.size,
        path: boqPath,
        folder: 'quotes'
      });
    }

    const message = [
      companyName ? `الشركة: ${companyName}` : '',
      projectType ? `نوع المشروع: ${projectType}` : '',
      productsDetails ? `تفاصيل المنتجات:\n${productsDetails}` : ''
    ].filter(Boolean).join('\n');

    // 1. Create canonical Customer Request & linked notification
    const requestRecord = await customerRequestService.createRequest({
      requestType: 'quote',
      customerName: fullName,
      phone,
      email,
      subject: `طلب عرض سعر ${companyName ? '— ' + companyName : ''}`,
      message,
      attachments,
      source: 'web',
      pageUrl: req.headers.referer || '/quote-request.html',
      guestId: req.headers['x-guest-id'] || null,
      customerId: req.session?.customer?.id || null
    });

    // 2. Legacy mirror insert via repository
    await requestRepo.createLegacyQuote({
      full_name: sanitize(fullName),
      phone: normalizePhone(phone),
      company_name: sanitize(companyName),
      email: sanitize(email),
      project_type: sanitize(projectType),
      products_details: sanitize(productsDetails),
      boq_file: boqPath
    });

    res.json({
      success: true,
      requestId: requestRecord.requestId,
      message: 'تم إرسال طلب عرض السعر بنجاح وسيتم إعداد التسعير والتواصل معكم.'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;