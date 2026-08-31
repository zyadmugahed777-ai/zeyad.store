/**
 * Common helpers for Zeyad For Business Backend
 */

/**
 * Format price with mathematical conversion according to currency.
 * Base price in database is in Saudi Riyal (SAR).
 * Exchange Rates:
 * 1 SAR = 140 YER (ريال يمني)
 * 1 USD = 3.75 SAR (دولار أمريكي)
 */
function formatPrice(amount, currency = 'SAR', exchangeRateSarToYer = 140) {
  if (amount == null || isNaN(amount)) {
    const c = (currency || 'SAR').toUpperCase();
    return c === 'USD' ? '$0' : (c === 'YER' || c === 'ر.ي' ? '0 ر.ي' : '0 ر.س');
  }
  
  const num = Number(amount);
  const cur = (currency || 'SAR').toUpperCase();
  const yerRate = Number(exchangeRateSarToYer) || 140;

  if (cur === 'YER' || cur === 'ر.ي') {
    const converted = Math.round(num * yerRate);
    return new Intl.NumberFormat('ar-SA').format(converted) + ' ر.ي';
  } else if (cur === 'USD' || cur === '$') {
    const converted = (num / 3.75);
    return '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(converted);
  } else {
    // Default SAR (ريال سعودي)
    return new Intl.NumberFormat('ar-SA').format(num) + ' ر.س';
  }
}

/**
 * Format date for display (Arabic-friendly)
 */
/**
 * Render a date for an <input type="date"> (YYYY-MM-DD).
 *
 * The admin forms used to do `row.start_date.split('T')[0]` and
 * `row.start_date.replace(' ', 'T')` directly in the template. That worked
 * on SQLite, which hands back date columns as strings. PostgreSQL hands back
 * a real Date object, which has neither .split nor .replace -- so opening any
 * coupon, banner or offer that had a date set died with
 * "coupon.start_date.split is not a function" and rendered a 500 page.
 *
 * Accepts a Date, an ISO string, a "YYYY-MM-DD HH:mm:ss" string, or null.
 * Returns '' for anything unusable so the input simply renders empty.
 *
 * Uses local calendar fields, not toISOString(), so a date does not shift a
 * day backwards for anyone east of UTC (Yemen is UTC+3).
 */
function toDateInput(value) {
  const d = toDateOrNull(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Render a date for an <input type="datetime-local"> (YYYY-MM-DDTHH:mm).
 * Same reasoning as toDateInput above.
 */
function toDateTimeInput(value) {
  const d = toDateOrNull(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  // "2026-08-27 10:30:00" is not valid ISO-8601; normalise before parsing.
  const d = new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-YE', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

/**
 * Format date-time for display
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-YE', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Validate Yemeni phone number
 */
function isValidYemeniPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^(00967|\+967|7)\d{8,9}$/.test(cleaned);
}

/**
 * Arabic-Indic (U+0660..U+0669) and Extended Arabic-Indic (U+06F0..U+06F9)
 * digits arrive from Arabic keyboards and from text pasted out of WhatsApp.
 * They read as a phone number to a person and as nothing at all to a regex,
 * so a customer who typed one could never be found again. Fold them to ASCII
 * before anything else looks at the string.
 */
function toAsciiDigits(value) {
  return String(value == null ? '' : value)
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48))
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48));
}

/**
 * Normalize a phone number to its canonical national form.
 *
 * The phone number is the customer's identity, so two spellings of the same
 * number must collapse to one string or one person ends up with two accounts.
 * The live table proves this went wrong already: id 3 holds '+967770420928'
 * and id 4 holds '770420928' -- one person, two rows -- while id 6 holds
 * '0501234567' with its trunk zero still attached.
 *
 * The rules, in order: fold Arabic digits, drop every character that is not a
 * digit, drop the Yemeni country code in any of its three spellings, then
 * drop a single trunk '0'. What is left is the national number and nothing
 * else.
 *
 * Existing rows are NOT rewritten by this -- that would be a destructive data
 * migration. Lookups tolerate the old spellings instead: see phoneVariants()
 * and the customer repositories' findByPhone().
 */
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = toAsciiDigits(phone).trim();

  const hadPlus = cleaned.startsWith('+');
  cleaned = cleaned.replace(/\D/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('00967')) cleaned = cleaned.substring(5);
  else if (hadPlus && cleaned.startsWith('967')) cleaned = cleaned.substring(3);
  else if (cleaned.startsWith('967') && cleaned.length > 9) cleaned = cleaned.substring(3);

  if (cleaned.length > 1 && cleaned.startsWith('0')) cleaned = cleaned.substring(1);

  return cleaned;
}

/**
 * Every spelling under which a given phone number may already be stored.
 *
 * normalizePhone() defines the canonical form for everything written from now
 * on, but rows written before it existed carry '+967...', '00967...', '967...'
 * or a leading trunk zero. A customer typing their number has to reach their
 * own account whichever shape it happens to be sitting in, so identity lookups
 * match this whole set rather than one string.
 *
 * The canonical form is always first, so a caller resolving several rows to
 * one can prefer the canonical row deterministically.
 *
 * @param {string} phone
 * @returns {string[]} unique candidate spellings, canonical form first
 */
function phoneVariants(phone) {
  const national = normalizePhone(phone);
  if (!national) return [];

  return [...new Set([
    national,
    `0${national}`,
    `967${national}`,
    `+967${national}`,
    `00967${national}`
  ])];
}

/**
 * Parse pagination params from query string
 */
function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build pagination info object
 */
function paginationInfo(page, limit, totalItems) {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

/**
 * Sanitize string input
 */
function sanitize(str) {
  if (!str) return '';
  return String(str).trim();
}

/**
 * Get status badge color
 */
function statusColor(status) {
  const colors = {
    'pending': '#f59e0b',
    'confirmed': '#3b82f6',
    'processing': '#8b5cf6',
    'shipped': '#06b6d4',
    'delivered': '#10b981',
    'cancelled': '#ef4444',
    'read': '#6b7280'
  };
  return colors[status] || '#6b7280';
}

/**
 * A translucent wash of the status colour, for use as a badge background.
 *
 * The views were doing this themselves with
 *   statusColor(s).replace('rgb', 'rgba').replace(')', ', 0.1)')
 * which assumes statusColor returns an rgb() string. It returns a hex, so
 * neither replace matched and the background came out as the *same solid
 * colour as the text* -- the badge text was invisible, which is exactly what
 * the operator reported on the reports screen.
 */
function statusTint(status, alpha = 0.15) {
  const hex = String(statusColor(status)).replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return 'transparent';
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get status label in Arabic
 */
/**
 * Map a colour name to a hex value for a small swatch dot.
 *
 * Products store colours as human names ("أزرق كحلي"), which the admin lists
 * could only ever print as text. A swatch lets an operator see at a glance
 * which variant an order is for. Matching is substring-based on a normalised
 * name so compounds ("أسود مطفي") resolve to their base colour, and anything
 * unrecognised falls back to a neutral grey rather than rendering nothing.
 *
 * Accepts an already-valid CSS colour (#rrggbb) and passes it straight
 * through, so products that do store hex keep their exact colour.
 */
const COLOR_SWATCHES = [
  [['أبيض', 'ابيض', 'white'], '#f8fafc'],
  [['أسود', 'اسود', 'black'], '#1e293b'],
  [['رمادي', 'رمادى', 'grey', 'gray'], '#9ca3af'],
  [['فضي', 'فضى', 'سلفر', 'silver'], '#c0c5ce'],
  [['ذهبي', 'ذهبى', 'gold'], '#d6a84f'],
  [['بيج', 'بيچ', 'beige', 'كريمي', 'كريمى', 'cream'], '#e3d5bf'],
  [['بني', 'بنى', 'brown', 'جوز'], '#8b5e3c'],
  [['أزرق', 'ازرق', 'blue', 'كحلي', 'كحلى', 'navy'], '#2f4f7f'],
  [['أخضر', 'اخضر', 'green', 'زيتي', 'زيتى'], '#3f7d58'],
  [['أحمر', 'احمر', 'red', 'خمري', 'خمرى'], '#b3392f'],
  [['وردي', 'وردى', 'pink', 'زهري', 'زهرى'], '#e29ab0'],
  [['أصفر', 'اصفر', 'yellow'], '#e6c34a'],
  [['برتقالي', 'برتقالى', 'orange'], '#d97a34'],
  [['بنفسجي', 'بنفسجى', 'purple', 'موف'], '#7c5cbf']
];

function colorSwatch(name) {
  const raw = String(name || '').trim();
  if (!raw) return '#9ca3af';
  if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;

  // Strip Arabic diacritics and collapse alef variants so "أزرق" and "ازرق"
  // both match the same entry.
  const norm = raw
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase();

  for (const [needles, hex] of COLOR_SWATCHES) {
    if (needles.some((n) => norm.includes(n.replace(/[أإآ]/g, 'ا').toLowerCase()))) return hex;
  }
  return '#9ca3af';
}

function statusLabel(status) {
  const labels = {
    'pending': 'في الانتظار',
    'confirmed': 'تم التأكيد',
    'processing': 'قيد التجهيز',
    'shipped': 'تم الشحن',
    'delivered': 'تم التوصيل',
    'cancelled': 'ملغي'
  };
  return labels[status] || status;
}

/**
 * Payment method label in Arabic
 */
function paymentLabel(method) {
  const labels = {
    'kuraimi': 'كريمي',
    'jaib': 'جيب',
    'jawali': 'جوالي',
    'floosk': 'فلوسك',
    'one-cash': 'ون كاش',
    'bank-transfer': 'حوالة بنكية',
    'money-transfer': 'حوالة مالية',
    'cash-on-delivery': 'الدفع عند الاستلام',
    'gold': 'ذهب',
    'direct-transfer': 'تحويل مباشر'
  };
  return labels[method] || method;
}

/**
 * Visual Editor Helper
 * Outputs HTML wrapped in a data-editor span if editMode is active.
 * Otherwise outputs the plain value.
 */
function visual(locals, key, type, defaultValue) {
  const contentMap = locals.themeContent || {};
  const isEditMode = locals.editMode === true;
  
  let val = contentMap[key] !== undefined ? contentMap[key] : defaultValue;
  
  if (isEditMode) {
    // If it's an image, we don't wrap it in span, we add data attributes to the img tag?
    // Actually, returning a wrapper is easier for text/html. For images, we might need a different helper or apply attributes directly.
    if (type === 'image') {
      return `src="${val}" data-visual-key="${key}" data-visual-type="image" class="visual-editable-img"`;
    }
    if (type === 'bg-image') {
      return `style="background-image: url('${val}')" data-visual-key="${key}" data-visual-type="bg-image" class="visual-editable-bg"`;
    }
    if (type === 'link') {
      return `href="${val}" data-visual-key="${key}" data-visual-type="link" class="visual-editable-link"`;
    }
    return `<span data-visual-key="${key}" data-visual-type="${type}" class="visual-editable">${val}</span>`;
  }
  
  if (type === 'image') return `src="${val}"`;
  if (type === 'bg-image') return `style="background-image: url('${val}')"`;
  if (type === 'link') return `href="${val}"`;
  return val;
}

module.exports = {
  formatPrice,
  formatDate,
  formatDateTime,
  toDateInput,
  toDateTimeInput,
  isValidYemeniPhone,
  normalizePhone,
  phoneVariants,
  toAsciiDigits,
  parsePagination,
  paginationInfo,
  sanitize,
  statusColor,
  statusTint,
  statusLabel,
  paymentLabel,
  colorSwatch,
  visual
};
