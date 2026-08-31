/**
 * Answers "where does this actually show up?" on the settings screen.
 *
 * The operator's question was exactly that: they could edit these values but
 * had no way to know which of them reached the site, or where. Rather than
 * guess, each note below was checked against the code that consumes the
 * setting -- the storefront data injection, the WhatsApp message service, the
 * page head, and so on. A field with no consumer says so plainly instead of
 * implying an effect it does not have.
 *
 * Purely additive: it annotates the existing labels and changes no styling,
 * no layout and no behaviour of the form itself.
 */
(function () {
  'use strict';

  var WHERE = {
    site_name: 'اسم المتجر في تبويب المتصفح، وفي ترويسة كل صفحة، وفي رسائل واتساب للطلبات وطلبات العملاء.',
    default_currency: 'العملة التي تُعرض بها الأسعار افتراضياً للزائر، ومبدّل العملة في لوحة الإدارة.',
    enabled_languages: 'اللغات المتاحة للزائر. لا تغيّر لغة الموقع الحالية بنفسها.',

    contact_phone: 'رقم الهاتف في تذييل كل صفحة وفي صفحة «تواصل معنا».',
    contact_whatsapp: 'الرقم الذي يفتح عليه زر واتساب العائم في الموقع.',
    contact_email: 'البريد في التذييل وصفحة «تواصل معنا».',
    google_maps_url: 'رابط الخريطة في صفحة «تواصل معنا» وصفحة الفروع.',
    contact_address: 'العنوان المعروض في التذييل وصفحة «تواصل معنا».',

    social_facebook: 'أيقونة فيسبوك في تذييل الموقع. اتركه فارغاً لإخفائها.',
    social_instagram: 'أيقونة إنستغرام في التذييل. اتركه فارغاً لإخفائها.',
    social_tiktok: 'أيقونة تيك توك في التذييل. اتركه فارغاً لإخفائها.',

    seo_title: 'العنوان الذي يظهر في نتائج البحث وعند مشاركة رابط الموقع.',
    seo_description: 'الوصف تحت العنوان في نتائج البحث. الأفضل ألا يتجاوز 160 حرفاً.',

    site_logo: 'الشعار في ترويسة كل صفحة من صفحات الموقع.',
    site_favicon: 'الأيقونة الصغيرة في تبويب المتصفح.',

    whatsapp_order_template:
      'نص رسالة واتساب التي تُرسل للعميل من صفحة الطلب. المتغيرات بين قوسين تُستبدل ببيانات الطلب الحقيقية.',

    payment_methods: 'طرق الدفع المعروضة للعميل في صفحة الدفع.',
    shipping_methods: 'طرق التوصيل المعروضة في صفحة الدفع.'
  };

  function annotate() {
    Object.keys(WHERE).forEach(function (name) {
      var field = document.querySelector('[name="' + name + '"]');
      if (!field) return;

      var group = field.closest('.mb-3') || field.parentElement;
      if (!group || group.querySelector('[data-settings-where]')) return;

      var note = document.createElement('small');
      note.setAttribute('data-settings-where', name);
      note.style.cssText =
        'display:block; margin-top:4px; font-size:11px; line-height:1.6;' +
        'color:var(--text-muted, #94a3b8);';
      note.textContent = WHERE[name];
      group.appendChild(note);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', annotate);
  } else {
    annotate();
  }
})();
