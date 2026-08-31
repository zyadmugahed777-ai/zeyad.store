/**
 * Official customer WhatsApp message builder.
 *
 * Why this exists
 * ---------------
 * The admin's "contact the customer" button used to open WhatsApp with
 * `order.whatsapp_message` -- a string captured by the storefront at checkout
 * and stored on the order row. Two problems with that:
 *
 *   1. Only 8 of 33 existing orders carry one, so on most orders the button
 *      did not render at all.
 *   2. What it does carry is the customer's own checkout blurb, not a message
 *      from the company. It reads nothing like a business contacting a client.
 *
 * The message is now composed server-side, for every order, from a template
 * the admin can edit (settings key `whatsapp_order_template`, group
 * `orders`). Falling back to a sane built-in default when unset means the
 * button works before anyone touches the setting.
 *
 * Placeholders are `{{name}}`-style. Unknown placeholders are left untouched
 * rather than blanked, so a typo in the template is visible instead of silent.
 */

const DEFAULT_TEMPLATE = [
  'مرحباً {{customer_name}}، تحية طيبة من {{store_name}}.',
  '',
  'نتواصل معكم بخصوص طلبكم رقم: {{order_id}}',
  'تاريخ الطلب: {{order_date}}',
  '',
  'تفاصيل الطلب:',
  '{{items}}',
  '',
  'الإجمالي: {{total}}',
  'طريقة الدفع: {{payment_method}}',
  '{{delivery_line}}',
  '',
  'حالة الطلب حالياً: {{status_label}}',
  '{{status_message}}',
  '',
  'نشكر لكم ثقتكم بنا، ونبقى في خدمتكم لأي استفسار.',
  '{{store_name}}'
].join('\n');

/**
 * A sentence describing what happens next, specific to the order's state.
 * Written in the company's voice -- this is what the customer actually reads.
 */
const STATUS_MESSAGES = {
  pending: 'طلبكم قيد المراجعة لدى فريقنا، وسيتم تأكيده والتواصل معكم في أقرب وقت.',
  confirmed: 'تم تأكيد طلبكم بنجاح، وسيتم البدء في تجهيزه.',
  processing: 'طلبكم قيد التجهيز حالياً، وسنخبركم فور خروجه للتوصيل.',
  shipped: 'تم تسليم طلبكم لمندوب التوصيل، وسيتواصل معكم لتحديد وقت الاستلام.',
  delivered: 'تم توصيل طلبكم بنجاح. نأمل أن ينال رضاكم، ونسعد بملاحظاتكم.',
  cancelled: 'تم إلغاء هذا الطلب. إن كان الإلغاء عن طريق الخطأ، يسعدنا خدمتكم من جديد.'
};

const STATUS_LABELS = {
  pending: 'في الانتظار',
  confirmed: 'تم التأكيد',
  processing: 'قيد التجهيز',
  shipped: 'مع مندوب التوصيل',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي'
};

/**
 * Render the item lines of the message.
 * @param {Array<Object>} items
 * @param {(n: number|string) => string} money
 */
function renderItems(items, money) {
  if (!Array.isArray(items) || items.length === 0) return '—';
  return items
    .map((it, i) => {
      const qty = Number(it.quantity) || 1;
      const colour = (it.selected_color || '').trim();
      const parts = [`${i + 1}. ${it.product_title || 'منتج'}`];
      if (colour) parts.push(`اللون: ${colour}`);
      parts.push(`الكمية: ${qty}`);
      if (it.total != null || it.price != null) {
        parts.push(money(it.total != null ? it.total : Number(it.price) * qty));
      }
      return parts.join(' — ');
    })
    .join('\n');
}

/**
 * Build the message body for one order.
 *
 * @param {Object} params
 * @param {Object} params.order       order row (order_id, status, total, ...)
 * @param {Array<Object>} params.items order items (product_title, quantity, ...)
 * @param {Object} [params.settings]  settings map, for store name / template
 * @param {Function} [params.formatDate]  date formatter
 * @param {Function} [params.paymentLabel] payment-slug -> Arabic label
 * @returns {string} the message text, ready to be URL-encoded
 */
function buildOrderMessage({ order, items = [], settings = {}, formatDate, paymentLabel }) {
  if (!order) return '';

  // Money is rendered in the order's own currency with NO conversion, and
  // that is deliberate. Verified against the live data:
  //
  //   ZFB-2026-000024  currency=YER rate=140  total=70560  total_sar=504
  //                    504 x 140 = 70560, so total is already in YER
  //   ZFB-2026-000033  currency=SAR rate=140  total=308    total_sar=308
  //   ZFB-2026-000001  currency=YER rate=1    total=11596  total_sar=0
  //
  // In every case order.total (and order_items.total) is denominated in
  // order.currency, while the *_sar columns hold the SAR equivalent.
  // Passing these through utils/helpers.formatPrice would be wrong twice
  // over: that helper expects a SAR input and multiplies by the exchange
  // rate, so a YER order would be inflated 140-fold in a message sent to a
  // customer, and the 23 legacy orders whose total_sar is 0 have no SAR
  // figure to convert from at all. Formatting the stored amount as-is needs
  // no rate and cannot drift.
  const symbol = String(order.currency || 'SAR').toUpperCase() === 'YER' ? 'ر.ي' : 'ر.س';
  const money = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return n.toLocaleString('ar-SA') + ' ' + symbol;
  };

  const storeName =
    settings.store_name_ar || settings.site_name || settings.store_name_en || 'زياد ستور';

  const status = String(order.status || 'pending').toLowerCase();

  const deliveryBits = [order.city, order.district, order.address_detail]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  const deliveryLine = deliveryBits.length
    ? `عنوان التوصيل: ${deliveryBits.join(' - ')}`
    : '';

  const values = {
    customer_name: (order.first_name || order.customer_name || 'عميلنا الكريم').trim(),
    store_name: storeName,
    order_id: order.order_id || order.id || '',
    order_date:
      typeof formatDate === 'function' && order.created_at
        ? formatDate(order.created_at)
        : '',
    items: renderItems(items, money),
    total: money(order.total),
    // payment_method_label is NULL on every order in the database, so relying
    // on it alone leaked the raw slug ("money-transfer") into a customer-facing
    // message. Translate the slug as the fallback.
    payment_method:
      order.payment_method_label ||
      (typeof paymentLabel === 'function' ? paymentLabel(order.payment_method) : '') ||
      order.payment_method ||
      'غير محدد',
    delivery_line: deliveryLine,
    status_label: STATUS_LABELS[status] || order.status || '',
    status_message: STATUS_MESSAGES[status] || ''
  };

  const template =
    (settings.whatsapp_order_template && String(settings.whatsapp_order_template).trim()) ||
    DEFAULT_TEMPLATE;

  const rendered = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) => {
    const k = String(key).toLowerCase();
    // Leave an unknown placeholder visible so a template typo is obvious
    // rather than silently producing a gap in a message sent to a customer.
    return Object.prototype.hasOwnProperty.call(values, k) ? values[k] : match;
  });

  // Collapse the blank lines left behind by empty optional values (an order
  // with no delivery address should not ship with a stray empty line).
  return rendered
    .split('\n')
    .filter((line, i, arr) => !(line.trim() === '' && (arr[i - 1] || '').trim() === ''))
    .join('\n')
    .trim();
}

/**
 * Normalise a Yemeni phone number to the international form WhatsApp expects.
 * Returns '' when there is nothing dialable, so the caller can hide the button
 * instead of producing a broken wa.me link.
 */
/**
 * What each kind of customer request is actually called.
 *
 * The admin's request screen greeted every one of them with "بخصوص طلبك رقم"
 * -- "regarding your order" -- no matter what it was. A customer who asked for
 * a quote on a bedroom set was answered as though they had placed an order,
 * which is both wrong and confusing for them. These are the five types the
 * database actually holds: ai_najm (38), contact (10), quote (9),
 * appointment (3), consultation (3).
 */
const REQUEST_TYPE_WORDING = {
  quote: {
    noun: 'طلب عرض السعر',
    opening: 'نتواصل معك بخصوص طلب عرض السعر رقم',
    closing: 'وسنوافيك بعرض السعر في أقرب وقت.'
  },
  ai_najm: {
    noun: 'طلبك عبر مساعد نجم',
    opening: 'نتواصل معك بخصوص طلبك رقم',
    closing: 'وسنساعدك في استكمال طلبك.'
  },
  consultation: {
    noun: 'طلب الاستشارة',
    opening: 'نتواصل معك بخصوص طلب الاستشارة رقم',
    closing: 'وسيتواصل معك أحد مختصينا.'
  },
  appointment: {
    noun: 'طلب الموعد',
    opening: 'نتواصل معك بخصوص طلب الموعد رقم',
    closing: 'لتأكيد الموعد المناسب لك.'
  },
  contact: {
    noun: 'رسالتك',
    opening: 'نتواصل معك بخصوص رسالتك رقم',
    closing: 'وسنجيب على استفسارك.'
  }
};

const DEFAULT_REQUEST_WORDING = {
  noun: 'طلبك',
  opening: 'نتواصل معك بخصوص طلبك رقم',
  closing: 'وسنعود إليك قريباً.'
};

/**
 * A formal message for a customer request, worded for what the request is.
 *
 * Kept deliberately short: this opens a conversation, it does not replace it.
 * The subject line is included when there is one, so the customer can see at a
 * glance which of their enquiries is being answered.
 */
function buildRequestMessage({ request, settings = {} }) {
  if (!request) return '';

  const storeName =
    settings.store_name_ar || settings.site_name || settings.store_name_en || 'زياد ستور';

  const wording = REQUEST_TYPE_WORDING[String(request.request_type || '').toLowerCase()]
    || DEFAULT_REQUEST_WORDING;

  const name = String(request.customer_name || '').trim();
  const greeting = name ? `مرحباً ${name}،` : 'مرحباً،';

  const lines = [
    greeting,
    `${wording.opening} ${request.request_id} لدى ${storeName}.`
  ];

  const subject = String(request.subject || '').trim();
  if (subject) lines.push(`الموضوع: ${subject}`);

  lines.push(wording.closing);

  return lines.join(String.fromCharCode(10));
}

/** Full wa.me link for a customer request, or '' when it has no usable phone. */
function buildRequestLink(params) {
  const number = toWhatsAppNumber(params.request && params.request.phone);
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(buildRequestMessage(params))}`;
}

function toWhatsAppNumber(phone, defaultCountryCode = '967') {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(defaultCountryCode)) return digits;
  return defaultCountryCode + digits.replace(/^0+/, '');
}

/**
 * Full wa.me link for an order, or '' when the order has no usable phone.
 */
function buildOrderLink(params) {
  const number = toWhatsAppNumber(params.order && params.order.phone);
  if (!number) return '';
  const text = buildOrderMessage(params);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

module.exports = {
  buildOrderMessage,
  buildRequestMessage,
  buildRequestLink,
  REQUEST_TYPE_WORDING,
  buildOrderLink,
  toWhatsAppNumber,
  DEFAULT_TEMPLATE,
  STATUS_MESSAGES,
  STATUS_LABELS
};
