/**
 * Zeyad For Business - Unified Notification Engine
 * Event-to-Notification Linking & Entity Direct Resolution Service
 * Refactored in Phase 1 Batch 4 to use Repository Layer.
 */

const { getRepositories } = require('../repositories');

class NotificationService {
  get repo() {
    return getRepositories().notifications;
  }

  /**
   * Create an event-linked notification
   */
  /**
   * Create an event-linked notification
   */
  async createNotification({
    type = 'system',
    entityType = null,
    entityId = null,
    title,
    message = '',
    actionUrl = null
  }) {
    if (!title || !title.trim()) {
      throw new Error('عنوان الإشعار مطلوب');
    }

    const safeTitle = title.trim();
    const safeMessage = (message || '').trim();
    const safeType = (type || 'system').trim();
    const safeEntityType = entityType ? String(entityType).trim() : null;
    const safeEntityId = entityId ? String(entityId).trim() : null;

    // Automatically construct canonical actionUrl if not provided
    let safeActionUrl = actionUrl ? String(actionUrl).trim() : null;
    if (!safeActionUrl && safeEntityType && safeEntityId) {
      if (safeEntityType === 'customer_request') {
        safeActionUrl = `/admin/requests/${safeEntityId}`;
      } else if (safeEntityType === 'customer_report') {
        safeActionUrl = `/admin/customer-reports/${safeEntityId}`;
      } else if (safeEntityType === 'order') {
        safeActionUrl = `/admin/orders/${safeEntityId}`;
      } else if (safeEntityType === 'customer') {
        safeActionUrl = `/admin/customers/${safeEntityId}`;
      }
    }

    const insertedId = await this.repo.create({
      type: safeType,
      entity_type: safeEntityType,
      entity_id: safeEntityId,
      reference_id: safeEntityId && !isNaN(Number(safeEntityId)) ? Number(safeEntityId) : null,
      title: safeTitle,
      message: safeMessage,
      action_url: safeActionUrl,
      is_read: 0
    });

    return {
      id: insertedId,
      type: safeType,
      entityType: safeEntityType,
      entityId: safeEntityId,
      title: safeTitle,
      message: safeMessage,
      actionUrl: safeActionUrl,
      isRead: 0,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Resolve notification and verify underlying entity exists
   * Returns safe target URL or fallback
   */
  async resolveNotification(id) {
    const notification = await this.repo.findById(id);

    if (!notification) {
      return {
        success: false,
        targetUrl: '/admin/notifications',
        warning: 'الإشعار المطلوب غير موجود'
      };
    }

    // Mark as read
    await this.repo.markAsRead(id);

    const entityType = notification.entity_type || notification.type;
    const entityId = notification.entity_id || notification.reference_id;

    if (!entityType || !entityId) {
      return {
        success: true,
        targetUrl: notification.action_url || '/admin/notifications',
        notification
      };
    }

    const repos = getRepositories();

    // Verify entity existence in SQLite
    if (entityType === 'customer_request' || entityType === 'request' || entityType === 'contact' || entityType === 'quote' || entityType === 'appointment' || entityType === 'consultation' || entityType === 'design' || entityType === 'installation' || entityType === 'maintenance' || entityType === 'najm') {
      const exists = await repos.customerRequests.findById(entityId);
      if (exists) {
        return { success: true, targetUrl: `/admin/requests/${exists.id}`, notification };
      }
      return { success: true, targetUrl: '/admin/requests', warning: 'تمت إزالة الطلب المرتبط بهذا الإشعار', notification };
    }

    if (entityType === 'customer_report' || entityType === 'report') {
      const exists = (await repos.customerReports.findByReportNumber(entityId)) || (await repos.customerReports.findById(entityId));
      if (exists) {
        return { success: true, targetUrl: `/admin/customer-reports/${exists.id}`, notification };
      }
      return { success: true, targetUrl: '/admin/customer-reports', warning: 'تمت إزالة البلاغ المرتبط بهذا الإشعار', notification };
    }

    if (entityType === 'order') {
      const exists = await repos.orders.findById(entityId);
      if (exists) {
        return { success: true, targetUrl: `/admin/orders/${exists.id}`, notification };
      }
      return { success: true, targetUrl: '/admin/orders', warning: 'تمت إزالة الطلب الشرائي المرتبط بهذا الإشعار', notification };
    }

    if (entityType === 'customer') {
      const exists = await repos.customers.findById(entityId);
      if (exists) {
        return { success: true, targetUrl: `/admin/customers/${exists.id}`, notification };
      }
      return { success: true, targetUrl: '/admin/customers', warning: 'العميل غير موجود', notification };
    }

    return {
      success: true,
      targetUrl: notification.action_url || '/admin/notifications',
      notification
    };
  }

  /**
   * Get unread notification count
   */
  getUnreadCount() {
    return this.repo.getUnreadCount();
  }

  /**
   * Get recent notifications
   */
  getRecentNotifications(limit = 10, since = null) {
    return this.repo.getRecent(limit, since);
  }

  /**
   * Mark single notification as read
   */
  markAsRead(id) {
    return this.repo.markAsRead(id);
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead() {
    return this.repo.markAllAsRead();
  }
}

const notificationService = new NotificationService();

module.exports = {
  NotificationService,
  notificationService
};
