const crypto = require('crypto');
const { getRepositories } = require('../../repositories');
const { logActionAudit } = require('./audit-service');

function generateRequestId() {
  const now = new Date();
  const y = now.getFullYear();
  // Was `1000 + Math.random() * 9000` -- 9000 possible ids per year from a
  // non-cryptographic PRNG. ai_customer_requests.request_id carries a UNIQUE
  // index, so by the birthday bound a collision (and therefore a hard insert
  // failure on a customer's support ticket) became more likely than not at
  // around 112 tickets in a year. Six crypto-random digits matches the format
  // the sibling generator in customer-request-repo.js already produces and
  // widens the space 100x.
  const rand = crypto.randomInt(0, 1000000);
  return `REQ-${y}-${String(rand).padStart(6, '0')}`;
}

const STATUS_LABELS_AR = {
  pending: 'جديد',
  new: 'جديد',
  in_progress: 'قيد المراجعة',
  in_review: 'قيد المراجعة',
  contacted: 'تم التواصل',
  resolved: 'تم التنفيذ',
  completed: 'تم التنفيذ',
  cancelled: 'مغلق',
  closed: 'مغلق'
};

function normalizeStatus(status) {
  const map = {
    'جديد': 'pending',
    'new': 'pending',
    'pending': 'pending',
    'قيد المراجعة': 'in_progress',
    'in_review': 'in_progress',
    'in_progress': 'in_progress',
    'تم التواصل': 'in_progress',
    'contacted': 'in_progress',
    'تم التنفيذ': 'resolved',
    'completed': 'resolved',
    'resolved': 'resolved',
    'مغلق': 'cancelled',
    'closed': 'cancelled',
    'cancelled': 'cancelled'
  };
  return map[status] || 'pending';
}

async function createCustomerRequest({
  sessionId = null,
  conversationId = null,
  customerName,
  phone,
  orderId = null,
  category = 'general',
  requestText,
  requestedProducts = null,
  quantity = 1,
  budget = null,
  najmNotes = null,
  priority = 'normal',
  ipAddress = null
}) {
  const repos = getRepositories();
  const requestId = generateRequestId();
  const safeName = String(customerName || 'عميل').trim();
  const safePhone = String(phone || '').trim();
  const safeText = String(requestText || '').trim();
  const safeCategory = String(category || 'general').trim();
  const safeProducts = requestedProducts ? (typeof requestedProducts === 'object' ? JSON.stringify(requestedProducts) : String(requestedProducts)) : null;
  const safeNotes = najmNotes ? String(najmNotes).trim() : null;
  const safePriority = ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal';

  const insertId = await repos.ai.createAiCustomerRequest({
    requestId,
    conversationId: conversationId || null,
    customerName: safeName,
    phone: safePhone,
    orderId: orderId ? String(orderId).trim() : null,
    category: safeCategory,
    requestText: safeText,
    requestedProducts: safeProducts,
    quantity: Number(quantity) || 1,
    budget: budget ? Number(budget) : null,
    najmNotes: safeNotes,
    priority: safePriority
  });

  // Sync to canonical customer_requests table
  try {
    const canRes = await repos.customerRequests.create({
      request_id: requestId,
      request_type: 'ai_najm',
      customer_name: safeName,
      phone: safePhone,
      subject: `طلب عبر مساعد نجم (${safeCategory})`,
      message: safeText || `طلب منتجات: ${safeProducts || ''}`,
      priority: safePriority === 'urgent' ? 'urgent' : (safePriority === 'high' ? 'high' : 'normal'),
      source: 'najm',
      page_url: '/najm',
      entity_type: orderId ? 'order' : (safeProducts ? 'product' : null),
      entity_id: orderId || null,
      admin_notes: safeNotes || null
    });

    const { notificationService } = require('../notification-service');
    await notificationService.createNotification({
      type: 'najm',
      entityType: 'customer_request',
      entityId: canRes?.id || canRes?.lastInsertRowid || insertId,
      title: 'طلب جديد عبر مساعد نجم الذكي',
      message: `طلب من العميل ${safeName} (${safePhone}) عبر المحادثة الذكية`,
      actionUrl: `/admin/requests/${canRes?.id || canRes?.lastInsertRowid || insertId}`
    });
  } catch (err) {
    console.error('Error syncing Najm request to canonical customer_requests:', err.message);
  }

  logActionAudit({
    sessionId,
    action: 'create_customer_request',
    targetType: 'customer_request',
    targetId: requestId,
    payload: { customerName: safeName, phone: safePhone, orderId, category: safeCategory, requestText: safeText, requestedProducts: safeProducts, budget, priority: safePriority },
    result: 'success',
    ipAddress
  });

  return {
    success: true,
    id: insertId,
    requestId,
    status: 'pending',
    statusLabel: 'جديد',
    message: `تم تسجيل طلبك برقم متابعة رسمي: ${requestId} وسيتم التواصل معك من فريق الإدارة وخدمة العملاء في أقرب وقت.`
  };
}

async function listCustomerRequests({ status = null, category = null, search = '', limit = 50, offset = 0 } = {}) {
  const normStatus = status && status !== 'all' ? normalizeStatus(status) : null;
  const rows = await getRepositories().ai.listAiCustomerRequests({
    status: normStatus,
    category: category && category !== 'all' ? category : null,
    search,
    limit,
    offset
  });
  return (rows || []).map(r => ({
    ...r,
    statusLabel: STATUS_LABELS_AR[r.status] || r.status
  }));
}

async function getCustomerRequest(idOrRequestId) {
  const row = await getRepositories().ai.getAiCustomerRequestById(idOrRequestId);
  if (!row) return null;
  return {
    ...row,
    statusLabel: STATUS_LABELS_AR[row.status] || row.status
  };
}

async function updateCustomerRequestStatus(id, status, adminNotes = '', adminId = null) {
  const normStatus = normalizeStatus(status);
  await getRepositories().ai.updateAiCustomerRequestStatus(id, normStatus, adminNotes);
  return await getCustomerRequest(id);
}

module.exports = {
  createCustomerRequest,
  listCustomerRequests,
  getCustomerRequest,
  updateCustomerRequestStatus,
  generateRequestId,
  STATUS_LABELS_AR,
  normalizeStatus
};
