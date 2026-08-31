const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const upload = require('../../middleware/upload');
const { sanitize, normalizePhone } = require('../../utils/helpers');
const { calculatorService } = require('../../services/calculator-service');

router.use('/book-appointment', require('./appointments'));
router.use('/request-consultation', require('./consultations'));
router.use('/request-design', require('./designs'));
router.use('/request-quote', require('./quotes'));

function pick(body, keys) {
  for (const key of keys) {
    if (body[key]) return body[key];
  }
  return '';
}

const { customerRequestService } = require('../../services/customer-request-service');

function createContactLikeRequest(type, title, req, res, next) {
  try {
    const repos = getRepositories();
    const fullName = pick(req.body, ['fullName', 'contactName', 'name']) || 'عميل الموقع';
    const phone = normalizePhone(pick(req.body, ['phone', 'contactPhone'])) || '00000000';
    const email = sanitize(pick(req.body, ['email', 'contactEmail']));
    const subject = sanitize(pick(req.body, ['subject', 'contactSubject']) || title);
    const details = Object.entries(req.body)
      .filter(([key, value]) => value !== undefined && value !== '' && !['fullName', 'contactName', 'name', 'phone', 'contactPhone', 'email', 'contactEmail', 'subject', 'contactSubject'].includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    const files = (req.files || []).map((file) => `/uploads/media/${file.filename}`);
    const message = sanitize([details, files.length ? `الملفات المرفقة: ${files.join(', ')}` : ''].filter(Boolean).join('\n'));

    if (!fullName) {
      return res.status(400).json({ success: false, error: 'الاسم والتفاصيل مطلوبة' });
    }

    // 1. Create canonical Customer Request & Linked Notification
    const requestRecord = customerRequestService.createRequest({
      requestType: type,
      customerName: fullName,
      phone,
      email,
      subject,
      message: message || subject,
      attachments: files,
      source: 'web',
      pageUrl: req.headers.referer || '',
      guestId: req.headers['x-guest-id'] || null,
      customerId: req.session?.customer?.id || null
    });

    // 2. Legacy mirror
    try {
      repos.customerRequests.createLegacyContact({
        full_name: sanitize(fullName),
        phone,
        email,
        subject,
        message: message || subject
      });
    } catch (_) {}

    res.json({ success: true, requestId: requestRecord.requestId, message: 'تم إرسال الطلب بنجاح' });
  } catch (error) {
    next(error);
  }
}

router.post('/request-installation', upload.any(), (req, res, next) => {
  createContactLikeRequest('installation', 'طلب تركيب جديد', req, res, next);
});

router.post('/request-maintenance', upload.any(), (req, res, next) => {
  createContactLikeRequest('maintenance', 'طلب صيانة جديد', req, res, next);
});

router.post('/submit-form', upload.any(), (req, res, next) => {
  if (req.body.contactName && !req.body.fullName) req.body.fullName = req.body.contactName;
  if (req.body.contactPhone && !req.body.phone) req.body.phone = req.body.contactPhone;
  if (req.body.contactSubject && !req.body.subject) req.body.subject = req.body.contactSubject;
  if ((req.body.firstName || req.body.lastName) && !req.body.fullName) {
    req.body.fullName = `${req.body.firstName || ''} ${req.body.lastName || ''}`.trim();
  }
  createContactLikeRequest('contact', 'رسالة من نموذج الموقع', req, res, next);
});

// ---------------------------------------------------------------------------
// Order tracking (the endpoint track-order.html actually posts to).
//
// Two things were wrong here. Security: an order number alone was enough to
// read anyone's order -- name, phone, email, address -- and order numbers run
// in sequence, so the whole book was countable; a phone number alone returned
// that person's latest order to anyone who knew their number. A guest must now
// present both, and a signed-in customer may look up their own orders with the
// number alone.
//
// Correctness: the handler was synchronous while the repository is async under
// PostgreSQL, so `order` was always an unresolved Promise -- truthy, never
// null, and serialized as `{}`. Every lookup answered
// `{"success":true,"data":{}}` regardless of input. It is async now.
// ---------------------------------------------------------------------------
router.all('/track-order', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const sessionCustomerId = req.session?.customer?.id || null;
    const orderNumber = String(req.body.orderNumber || req.query.orderNumber || '').trim().replace(/^#/, '');
    const phone = normalizePhone(String(req.body.phone || req.query.phone || '').trim());

    if (!orderNumber) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الطلب' });
    }

    if (!sessionCustomerId && (!phone || phone.length < 8)) {
      return res.status(400).json({
        success: false,
        code: 'PHONE_REQUIRED',
        error: 'يرجى إدخال رقم الطلب ورقم الهاتف المستخدم في الطلب معاً، أو تسجيل الدخول لعرض طلباتك'
      });
    }

    const order = await repos.orders.findByOrderId(orderNumber);

    // "No such order" and "not your order" answer identically, so the response
    // cannot be used to discover which order numbers exist.
    const notFound = () => res.status(404).json({
      success: false,
      error: 'لم يتم العثور على طلب مطابق للمعلومات المدخلة'
    });

    if (!order) return notFound();

    const belongsToSession = sessionCustomerId && Number(order.customer_id) === Number(sessionCustomerId);
    const phoneMatches = phone && normalizePhone(order.phone) === phone;
    if (!belongsToSession && !phoneMatches) return notFound();

    order.items = (await repos.orders.findRawItemsByOrderId(order.id)) || [];

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
});

// Engineering Calculators Endpoints (Fixed 404s)
router.all('/calculate-solar', async (req, res) => {
  try {
    const payload = { ...req.query, ...req.body };
    const result = await calculatorService.calculateSolar(payload);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.all('/calculate-majlis', async (req, res) => {
  try {
    const payload = { ...req.query, ...req.body };
    const result = await calculatorService.calculateMajlis(payload);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.all('/calculate-kitchen', async (req, res) => {
  try {
    const payload = { ...req.query, ...req.body };
    const result = await calculatorService.calculateKitchen(payload);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
