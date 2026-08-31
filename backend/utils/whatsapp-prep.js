/**
 * WhatsApp message formatter for Zeyad For Business
 * Prepares order data as formatted WhatsApp messages
 * NOT connected to WhatsApp API - just formats text
 */

const { formatPrice, paymentLabel, statusLabel } = require('./helpers');

/**
 * Format a complete order as a WhatsApp message
 * @param {object} order - Order object with customer and items
 * @returns {string} Formatted WhatsApp message
 */
function formatOrderForWhatsApp(order) {
  const lines = [];

  lines.push(`🛒 *طلب جديد #${order.order_id}*`);
  lines.push('');
  lines.push(`📅 ${new Date(order.created_at).toLocaleString('ar-YE')}`);
  lines.push('');

  // Customer info
  lines.push('👤 *بيانات العميل:*');
  if (order.customer_name) lines.push(`   الاسم: ${order.customer_name}`);
  if (order.customer_phone) lines.push(`   الهاتف: ${order.customer_phone}`);
  if (order.city) lines.push(`   المدينة: ${order.city}`);
  if (order.address_detail) lines.push(`   العنوان: ${order.district || ''} - ${order.address_detail}`);
  lines.push('');

  // Items
  if (order.items && order.items.length > 0) {
    lines.push('📦 *المنتجات:*');
    order.items.forEach((item, i) => {
      lines.push(`   ${i + 1}. ${item.product_title}`);
      lines.push(`      الكمية: ${item.quantity} × ${formatPrice(item.price)}`);
    });
    lines.push('');
  }

  // Totals
  lines.push('💰 *الملخص:*');
  if (order.subtotal) lines.push(`   المجموع: ${formatPrice(order.subtotal)}`);
  if (order.discount > 0) lines.push(`   الخصم: -${formatPrice(order.discount)}`);
  if (order.shipping_fee > 0) lines.push(`   التوصيل: ${formatPrice(order.shipping_fee)}`);
  lines.push(`   *الإجمالي: ${formatPrice(order.total)}*`);
  lines.push('');

  // Payment
  if (order.payment_method) {
    lines.push(`💳 طريقة الدفع: ${paymentLabel(order.payment_method)}`);
  }

  // Delivery
  if (order.delivery_method) {
    lines.push(`🚚 طريقة التوصيل: ${order.delivery_method}`);
  }

  // Notes
  if (order.notes) {
    lines.push('');
    lines.push(`📝 ملاحظات: ${order.notes}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('زياد ستور | Zeyad For Business');

  return lines.join('\n');
}

/**
 * Format appointment as WhatsApp message
 */
function formatAppointmentForWhatsApp(appointment) {
  const lines = [];
  lines.push('📅 *حجز موعد جديد*');
  lines.push('');
  lines.push(`👤 الاسم: ${appointment.full_name}`);
  lines.push(`📱 الهاتف: ${appointment.phone}`);
  if (appointment.branch) lines.push(`🏢 الفرع: ${appointment.branch}`);
  if (appointment.date) lines.push(`📅 التاريخ: ${appointment.date}`);
  if (appointment.time) lines.push(`🕐 الوقت: ${appointment.time}`);
  if (appointment.visit_type) lines.push(`📋 نوع الزيارة: ${appointment.visit_type}`);
  if (appointment.notes) lines.push(`📝 ملاحظات: ${appointment.notes}`);
  return lines.join('\n');
}

/**
 * Format consultation request as WhatsApp message
 */
function formatConsultationForWhatsApp(consultation) {
  const lines = [];
  lines.push('💡 *طلب استشارة جديد*');
  lines.push('');
  lines.push(`👤 الاسم: ${consultation.full_name}`);
  lines.push(`📱 الهاتف: ${consultation.phone}`);
  if (consultation.consultation_type) lines.push(`📋 النوع: ${consultation.consultation_type}`);
  if (consultation.details) lines.push(`📝 التفاصيل: ${consultation.details}`);
  return lines.join('\n');
}

/**
 * Generate wa.me link (for future use)
 */
function generateWhatsAppLink(phoneNumber, message) {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

module.exports = {
  formatOrderForWhatsApp,
  formatAppointmentForWhatsApp,
  formatConsultationForWhatsApp,
  generateWhatsAppLink
};
