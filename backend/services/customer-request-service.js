/**
 * Zeyad For Business - Canonical Customer Request Engine
 * Unified Customer Request Service, Anti-Spoofing & Event Persistence
 * Refactored in Phase 1 Batch 4 to use Repository Layer.
 */

const { getRepositories } = require('../repositories');
const { notificationService } = require('./notification-service');
const { sanitize, normalizePhone } = require('../utils/helpers');

const REQUEST_TYPE_MAP = {
  contact: 'طلب اتصال (نحن نتصل بك)',
  consultation: 'طلب استشارة هندسية / فنية',
  quote: 'طلب عرض سعر / تسعير',
  appointment: 'حجز موعد زيارة معرض',
  design: 'طلب تصميم داخلي / ديكور',
  installation: 'طلب تركيب وضبط',
  maintenance: 'طلب صيانة وضمان',
  ai_najm: 'طلب عبر مساعد نجم الذكي',
  general: 'طلب عام'
};

const REQUEST_STATUS_MAP = {
  new: 'جديد',
  in_review: 'قيد المراجعة',
  contacted: 'تم التواصل',
  in_progress: 'جاري المعالجة',
  completed: 'تم التنفيذ',
  closed: 'مغلق',
  rejected: 'غير معتمد'
};

const REQUEST_PRIORITY_MAP = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'عالية',
  urgent: 'عاجلة ⚠️'
};

class CustomerRequestService {
  get repo() {
    return getRepositories().customerRequests;
  }

  /**
   * Anti-Spoofing & Entity Existence Verification
   */
  /**
   * Anti-Spoofing & Entity Existence Verification
   */
  async verifyLinkedEntity(entityType, entityId, customerPhone = null) {
    if (!entityType || !entityId) return { entityType: null, entityId: null, entityData: null };

    const type = String(entityType).trim().toLowerCase();
    const id = String(entityId).trim();
    const repos = getRepositories();

    try {
      if (type === 'product') {
        // findById() resolves numeric id, product_id and sku in one call, so
        // pass the raw identifier straight through. The previous chain coerced
        // non-numeric ids to 0 and then fell back to findByProductId()/
        // findBySku(), neither of which exists -- turning an unmatched
        // product reference into a TypeError.
        const prod = await repos.products.findById(id);
        if (prod) return { entityType: 'product', entityId: String(prod.id), entityData: prod };
      }

      if (type === 'category') {
        const cat = (await repos.categories.findById(isNaN(Number(id)) ? 0 : Number(id))) || (await repos.categories.findBySlugWithCount(id));
        if (cat) return { entityType: 'category', entityId: String(cat.id), entityData: cat };
      }

      if (type === 'order') {
        const ord = await repos.orders.findById(id);
        if (ord) {
          // Cross-customer security check
          if (customerPhone && ord.customer_phone && normalizePhone(ord.customer_phone) !== normalizePhone(customerPhone)) {
            return { entityType: null, entityId: null, entityData: null, warning: 'Cross-customer order spoofing prevented' };
          }
          return { entityType: 'order', entityId: String(ord.id), entityData: ord };
        }
      }
    } catch (_) {}

    return { entityType: null, entityId: null, entityData: null };
  }

  /**
   * Create a new canonical customer request
   */
  async createRequest({
    requestType = 'contact',
    customerName,
    phone,
    email = null,
    city = null,
    priority = 'normal',
    source = 'web',
    pageUrl = null,
    entityType = null,
    entityId = null,
    subject = null,
    message = '',
    attachments = null,
    contextData = null,
    adminNotes = null,
    guestId = null,
    customerId = null
  }) {
    const safeName = sanitize(customerName || '');
    const safePhone = normalizePhone(phone);

    if (!safeName) {
      throw new Error('الاسم مطلوب لتسجيل الطلب');
    }
    if (!safePhone || safePhone.length < 8) {
      throw new Error('رقم الهاتف مطلوب وصحيح للتواصل وتأكيد الطلب');
    }

    const safeType = REQUEST_TYPE_MAP[requestType] ? requestType : 'contact';
    const safePriority = REQUEST_PRIORITY_MAP[priority] ? priority : 'normal';
    const safeSource = sanitize(source || 'web');
    const safePageUrl = sanitize(pageUrl || '');
    const safeSubject = sanitize(subject || REQUEST_TYPE_MAP[safeType]);
    const safeMessage = sanitize(message || '');
    const safeEmail = sanitize(email || '');
    const safeCity = sanitize(city || '');

    // Anti-spoofing validation on linked entity
    const verified = await this.verifyLinkedEntity(entityType, entityId, safePhone);

    // Format attachments and context as valid JSON
    let attachmentsJson = null;
    if (attachments) {
      const arr = Array.isArray(attachments) ? attachments : [attachments].filter(Boolean);
      if (arr.length > 0) attachmentsJson = JSON.stringify(arr);
    }

    let contextJson = null;
    if (contextData) {
      try {
        contextJson = typeof contextData === 'string' ? contextData : JSON.stringify(contextData);
      } catch (_) {}
    }

    // Atomic insert and ID generation via Repository
    const created = await this.repo.create({
      request_type: safeType,
      customer_id: customerId || null,
      guest_id: guestId || null,
      customer_name: safeName,
      phone: safePhone,
      email: safeEmail,
      city: safeCity,
      priority: safePriority,
      source: safeSource,
      page_url: safePageUrl,
      entity_type: verified.entityType,
      entity_id: verified.entityId,
      subject: safeSubject,
      message: safeMessage,
      attachments: attachmentsJson,
      context_data: contextJson,
      admin_notes: adminNotes || null
    });

    // Create linked admin notification
    try {
      const typeLabel = REQUEST_TYPE_MAP[safeType] || 'طلب عميل';
      await notificationService.createNotification({
        type: 'request',
        entityType: 'customer_request',
        entityId: created.id,
        title: `${typeLabel} جديد`,
        message: `${typeLabel} رقم ${created.requestId} من: ${safeName} (${safePhone})`,
        actionUrl: `/admin/requests/${created.id}`
      });
    } catch (err) {
      console.error('Error creating notification for request:', err.message);
    }

    return {
      id: created.id,
      requestId: created.requestId,
      requestType: safeType,
      requestTypeAr: REQUEST_TYPE_MAP[safeType],
      status: 'new',
      statusAr: REQUEST_STATUS_MAP.new,
      customerName: safeName,
      phone: safePhone
    };
  }

  /**
   * List customer requests with filters and pagination
   */
  async listRequests({
    search = '',
    status = '',
    type = '',
    priority = '',
    page = 1,
    limit = 20
  } = {}) {
    const cleanSearch = String(search || '').trim();
    const cleanStatus = String(status || '').trim();
    const cleanType = String(type || '').trim();
    const cleanPriority = String(priority || '').trim();
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const filters = {
      search: cleanSearch,
      status: cleanStatus,
      type: cleanType,
      priority: cleanPriority
    };

    const totalItems = await this.repo.count(filters);
    const rows = await this.repo.findAll(filters, limitNum, offset);
    const items = (rows || []).map(r => this.formatRequestRecord(r));

    return {
      items,
      totalItems,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalItems / limitNum) || 1
    };
  }

  /**
   * Get single request by ID or Request Number
   */
  async getRequest(idOrRequestId) {
    const row = await this.repo.findById(idOrRequestId);
    if (!row) return null;

    const formatted = this.formatRequestRecord(row);

    // Fetch linked entity details if exists
    if (formatted.entity_type && formatted.entity_id) {
      if (formatted.entity_type === 'product') {
        formatted.linkedProduct = await this.repo.findLinkedProduct(formatted.entity_id);
      } else if (formatted.entity_type === 'order') {
        formatted.linkedOrder = await this.repo.findLinkedOrder(formatted.entity_id);
      }
    }

    // Fetch audit history
    formatted.auditLogs = await this.repo.findAuditLogs(formatted.id);

    return formatted;
  }

  /**
   * Update request status, priority, and notes with full audit logging
   */
  async updateStatus(id, { status, priority, admin_notes, assigned_to }, adminUser = null, ip = '127.0.0.1') {
    const current = await this.repo.findById(id);

    if (!current) {
      throw new Error('الطلب غير موجود');
    }

    const newStatus = status && REQUEST_STATUS_MAP[status] ? status : current.status;
    const newPriority = priority && REQUEST_PRIORITY_MAP[priority] ? priority : current.priority;
    const newNotes = admin_notes !== undefined ? sanitize(admin_notes) : current.admin_notes;
    const newAssigned = assigned_to !== undefined ? sanitize(assigned_to) : current.assigned_to;

    let contactedAt = current.contacted_at;
    let resolvedAt = current.resolved_at;

    if (newStatus === 'contacted' && !current.contacted_at) {
      contactedAt = new Date().toISOString();
    }
    if (['completed', 'closed'].includes(newStatus) && !current.resolved_at) {
      resolvedAt = new Date().toISOString();
    }

    await this.repo.updateStatus(id, {
      status: newStatus,
      priority: newPriority,
      admin_notes: newNotes,
      assigned_to: newAssigned,
      contacted_at: contactedAt,
      resolved_at: resolvedAt
    });

    // Audit Logging
    try {
      await getRepositories().auth.logAction({
        user_id: adminUser?.id || null,
        action: 'UPDATE_REQUEST_STATUS',
        entity: 'customer_request',
        entity_id: String(id),
        old_values: JSON.stringify({ status: current.status, priority: current.priority, notes: current.admin_notes }),
        new_values: JSON.stringify({ status: newStatus, priority: newPriority, notes: newNotes }),
        ip_address: ip || '127.0.0.1'
      });
    } catch (e) {
      console.error('Audit log error on request update:', e.message);
    }

    return await this.getRequest(id);
  }

  /**
   * Get operational statistics purely from Repository
   */
  async getRequestStats() {
    return await this.repo.getStats();
  }

  formatRequestRecord(r) {
    let parsedAttachments = [];
    try {
      if (r.attachments) parsedAttachments = JSON.parse(r.attachments);
    } catch (_) {}

    let parsedContext = null;
    try {
      if (r.context_data) parsedContext = JSON.parse(r.context_data);
    } catch (_) {}

    return {
      ...r,
      type_ar: REQUEST_TYPE_MAP[r.request_type] || r.request_type,
      status_ar: REQUEST_STATUS_MAP[r.status] || r.status,
      priority_ar: REQUEST_PRIORITY_MAP[r.priority] || r.priority,
      attachmentsList: Array.isArray(parsedAttachments) ? parsedAttachments : [],
      contextObject: parsedContext
    };
  }
}

const customerRequestService = new CustomerRequestService();

module.exports = {
  CustomerRequestService,
  customerRequestService,
  REQUEST_TYPE_MAP,
  REQUEST_STATUS_MAP,
  REQUEST_PRIORITY_MAP
};
