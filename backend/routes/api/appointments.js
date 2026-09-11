const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { customerRequestService } = require('../../services/customer-request-service');
const { sanitize, normalizePhone } = require('../../utils/helpers');

/**
 * The form posts slugs; the operator has to read the result.
 *
 * A booking arrived in the admin panel reading
 *
 *     الفرع: furniture
 *     الوقت المفضل: morning
 *     نوع الزيارة: buy
 *
 * so whoever answers the phone had to translate the shop's own form back into
 * Arabic before they could call the customer. The labels below are lifted from
 * book-appointment.html verbatim -- the same words the customer read when they
 * chose -- so the request says what they actually asked for.
 *
 * An unrecognised value falls through unchanged rather than being dropped: a
 * new option added to the form must show up in the request even before anyone
 * remembers to add it here.
 */
/*
 * What the customer asked to see -- not which shop they picked.
 *
 * These used to read "محل الأثاث", "محل المجالس" and so on, which asked the
 * customer to know which of several warehouses holds the thing they want.
 * They do not know that. The shop's model is the other way round: the customer
 * says what they are after, this request reaches the administration with their
 * name and number, and the administration tells them which showroom to visit.
 *
 * `all` exists because somebody furnishing a whole house had no way to say so
 * and had to pick one category and explain the rest in the notes.
 */
const BRANCH_AR = {
  furniture: 'أثاث',
  majalis: 'مجالس',
  kitchens: 'مطابخ',
  bedrooms: 'غرف نوم',
  appliances: 'أدوات وأجهزة منزلية',
  solar: 'أنظمة طاقة شمسية',
  all: 'الكل — تأثيث منزل كامل'
};

const TIME_AR = {
  morning: 'صباحاً (9 ص - 12 م)',
  afternoon: 'عصراً (4 م - 6 م)',
  evening: 'مساءً (6 م - 10 م)'
};

const VISIT_AR = {
  buy: 'شراء أثاث أو أجهزة',
  design: 'تصميم أو تفصيل حسب الطلب',
  consultation: 'استشارة',
  other: 'أخرى'
};

const CITY_AR = {
  sanaa: 'صنعاء', aden: 'عدن', taiz: 'تعز', ibb: 'إب',
  hodeidah: 'الحديدة', dhamar: 'ذمار', hadramout: 'حضرموت',
  mukalla: 'المكلا', hajjah: 'حجة', saada: 'صعدة', other: 'أخرى'
};

const label = (map, v) => (v ? (map[String(v).trim()] || v) : '');

router.post('/', async (req, res, next) => {
  try {
    const { fullName, phone, email, branch, date, time, visitType, city, notes } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    const branchAr = label(BRANCH_AR, branch);
    const cityAr = label(CITY_AR, city);

    const message = [
      // "الفرع المطلوب" read as though the customer had chosen a branch. They
      // chose what they want to see; which branch that means is the
      // administration's answer, given on the call.
      branchAr ? `المطلوب معاينته: ${branchAr}` : '',
      date ? `التاريخ المفضل: ${date}` : '',
      time ? `الوقت المفضل: ${label(TIME_AR, time)}` : '',
      visitType ? `نوع الزيارة: ${label(VISIT_AR, visitType)}` : '',
      cityAr ? `المدينة: ${cityAr}` : '',
      notes ? `ملاحظات إضافية:\n${notes}` : ''
    ].filter(Boolean).join('\n');

    // 1. Create canonical Customer Request & linked notification
    const requestRecord = await customerRequestService.createRequest({
      requestType: 'appointment',
      customerName: fullName,
      phone,
      email,
      city: cityAr || city,
      subject: `حجز موعد زيارة${branchAr ? ' — ' + branchAr : ''}`,
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