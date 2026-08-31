/**
 * SQLite Customer Request Repository
 * Encapsulates all database operations for customer_requests and legacy operations.
 * Methods are synchronous (better-sqlite3). No business logic.
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresCustomerRequestRepo extends PostgresBaseRepository {
  /**
   * Find single request by numeric ID or string request_id
   * @param {number|string} idOrRequestId
   * @returns {Object|null}
   */
  async findById(idOrRequestId) {
    return await this.db.prepare(`
      SELECT * FROM customer_requests
      WHERE CAST(id AS TEXT) = ? OR request_id = ? OR UPPER(request_id) = ?
    `).get(idOrRequestId, String(idOrRequestId), String(idOrRequestId).toUpperCase()) || null;
  }

  /**
   * Find single request by request_id
   * @param {string} requestId
   * @returns {Object|null}
   */
  async findByRequestId(requestId) {
    return await this.db.prepare(`
      SELECT * FROM customer_requests
      WHERE request_id = ? OR UPPER(request_id) = ?
    `).get(requestId, String(requestId).toUpperCase()) || null;
  }

  /**
   * Create a new canonical customer request with atomic sequential request_id
   * @param {Object} data
   * @returns {{ id: number, requestId: string }}
   */
  async create(data) {
    const createTx = this.db.transaction(async function() {
      const lastRow = await this.db.prepare('SELECT MAX(id) as max_id FROM customer_requests').get();
      const nextId = (lastRow?.max_id || 0) + 1;
      // The year was hardcoded to 2026, so every request created from 2027
      // onwards would still have been stamped REQ-2026-. nextId is a global
      // sequence, so ids stay unique across the year boundary regardless.
      const requestId = `REQ-${new Date().getFullYear()}-${String(nextId).padStart(6, '0')}`;

      const stmt = this.db.prepare(`
        INSERT INTO customer_requests (
          request_id, request_type, customer_id, guest_id, customer_name, phone, email, city,
          status, priority, source, page_url, entity_type, entity_id, subject, message,
          attachments, context_data, admin_notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          'new', ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, NOW(), NOW()
        )
      `);

      const result = await stmt.run(
        requestId,
        data.request_type || 'contact',
        data.customer_id || null,
        data.guest_id || null,
        data.customer_name,
        data.phone,
        data.email || '',
        data.city || '',
        data.priority || 'normal',
        data.source || 'web',
        data.page_url || '',
        data.entity_type || null,
        data.entity_id || null,
        data.subject || '',
        data.message || '',
        data.attachments || null,
        data.context_data || null,
        data.admin_notes || null
      );

      return {
        id: result.lastInsertRowid,
        requestId
      };
    });

    return await createTx();
  }

  /**
   * Find all requests matching filters with pagination
   * @param {Object} filters
   * @param {number} limit
   * @param {number} offset
   * @returns {Array<Object>}
   */
  async findAll(filters = {}, limit = 20, offset = 0) {
    let sql = 'SELECT * FROM customer_requests WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (request_id ILIKE ? OR customer_name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR subject ILIKE ? OR message ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.status && filters.status !== 'all') {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.type && filters.type !== 'all') {
      sql += ' AND request_type = ?';
      params.push(filters.type);
    }

    if (filters.priority && filters.priority !== 'all') {
      sql += ' AND priority = ?';
      params.push(filters.priority);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await this.db.prepare(sql).all(...params);
  }

  /**
   * Count requests matching filters
   * @param {Object} filters
   * @returns {number}
   */
  async count(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM customer_requests WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (request_id ILIKE ? OR customer_name ILIKE ? OR phone ILIKE ? OR email ILIKE ? OR subject ILIKE ? OR message ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.status && filters.status !== 'all') {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.type && filters.type !== 'all') {
      sql += ' AND request_type = ?';
      params.push(filters.type);
    }

    if (filters.priority && filters.priority !== 'all') {
      sql += ' AND priority = ?';
      params.push(filters.priority);
    }

    return (await this.db.prepare(sql).get(...params))?.count || 0;
  }

  /**
   * Get operational statistics from customer_requests table
   * @returns {Object}
   */
  async getStats() {
    return {
      total: (await this.db.prepare('SELECT COUNT(*) as count FROM customer_requests').get())?.count || 0,
      new: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_requests WHERE status = 'new'").get())?.count || 0,
      in_review: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_requests WHERE status = 'in_review'").get())?.count || 0,
      contacted: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_requests WHERE status = 'contacted'").get())?.count || 0,
      in_progress: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_requests WHERE status = 'in_progress'").get())?.count || 0,
      completed: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_requests WHERE status IN ('completed', 'closed')").get())?.count || 0,
      rejected: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_requests WHERE status = 'rejected'").get())?.count || 0
    };
  }

  /**
   * Get request count breakdown by status
   * @returns {Array<{ status: string, count: number }>}
   */
  async getStatusCounts() {
    return await this.db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM customer_requests 
      GROUP BY status
    `).all();
  }

  /**
   * Get request count breakdown by request_type
   * @returns {Array<{ request_type: string, count: number }>}
   */
  async getTypeCounts() {
    return await this.db.prepare(`
      SELECT request_type, COUNT(*) as count 
      FROM customer_requests 
      GROUP BY request_type
    `).all();
  }

  /**
   * Update request status and admin notes
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async updateStatus(id, data) {
    const fields = [];
    const params = [];

    const allowed = ['status', 'priority', 'admin_notes', 'assigned_to', 'contacted_at', 'resolved_at'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return false;

    fields.push("updated_at = NOW()");
    params.push(id);

    const sql = `UPDATE customer_requests SET ${fields.join(', ')} WHERE id = ?`;
    const result = await this.db.prepare(sql).run(...params);
    return result.changes > 0;
  }

  /**
   * Find previous requests by customer phone
   * @param {string} phone
   * @param {number|string} excludeId
   * @param {number} limit
   * @returns {Array<Object>}
   */
  async findPreviousByPhone(phone, excludeId = 0, limit = 5) {
    if (!phone) return [];
    return await this.db.prepare(`
      SELECT id, request_id, request_type, status, created_at
      FROM customer_requests
      WHERE phone = ? AND id != ?
      ORDER BY id DESC LIMIT ?
    `).all(phone, excludeId, limit);
  }

  /**
   * Find linked product details
   * @param {string|number} entityId
   * @returns {Object|null}
   */
  async findLinkedProduct(entityId) {
    return await this.db.prepare(`
      SELECT id, product_id, title, price, old_price, brand, warranty,
             (SELECT image_path FROM product_images WHERE product_id = products.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM products WHERE CAST(id AS TEXT) = ? OR product_id = ?
    `).get(entityId, entityId) || null;
  }

  /**
   * Find linked order details
   * @param {string|number} entityId
   * @returns {Object|null}
   */
  async findLinkedOrder(entityId) {
    return await this.db.prepare(`
      SELECT id, order_id, status, total, currency, created_at FROM orders WHERE CAST(id AS TEXT) = ? OR order_id = ?
    `).get(entityId, entityId) || null;
  }

  /**
   * Find audit logs for a request
   * @param {number|string} requestId
   * @param {number} limit
   * @returns {Array<Object>}
   */
  async findAuditLogs(requestId, limit = 10) {
    try {
      return await this.db.prepare(`
        SELECT a.*, u.full_name as admin_name
        FROM audit_logs a
        LEFT JOIN admin_users u ON a.user_id = u.id
        WHERE a.entity = 'customer_request' AND a.entity_id = ?
        ORDER BY a.id DESC LIMIT ?
      `).all(String(requestId), limit);
    } catch (_) {
      return [];
    }
  }

  // =============================================
  // Legacy Mirror Tables (Preserved for compatibility)
  // =============================================

  async createLegacyContact(data) {
    try {
      return await this.db.prepare(`
        INSERT INTO contact_messages (full_name, phone, email, subject, message)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.full_name, data.phone, data.email || '', data.subject || '', data.message || '');
    } catch (_) {
      return null;
    }
  }

  async createLegacyAppointment(data) {
    try {
      return await this.db.prepare(`
        INSERT INTO appointments (full_name, phone, branch, date, time, visit_type, city, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.full_name, data.phone, data.branch || '', data.date || '', data.time || '', data.visit_type || '', data.city || '', data.notes || '');
    } catch (_) {
      return null;
    }
  }

  async createLegacyConsultation(data) {
    try {
      return await this.db.prepare(`
        INSERT INTO consultations (full_name, phone, consultation_type, details, city, contact_method, attachments)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(data.full_name, data.phone, data.consultation_type || '', data.details || '', data.city || '', data.contact_method || '', data.attachments || '[]');
    } catch (_) {
      return null;
    }
  }

  async createLegacyDesign(data) {
    try {
      return await this.db.prepare(`
        INSERT INTO design_requests (full_name, phone, design_type, dimensions, budget, style_pref, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(data.full_name, data.phone, data.design_type || '', data.dimensions || '', data.budget || '', data.style_pref || '', data.details || '');
    } catch (_) {
      return null;
    }
  }

  async createLegacyQuote(data) {
    try {
      return await this.db.prepare(`
        INSERT INTO quote_requests (full_name, phone, company_name, email, project_type, products_details, boq_file)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(data.full_name, data.phone, data.company_name || '', data.email || '', data.project_type || '', data.products_details || '', data.boq_file || '');
    } catch (_) {
      return null;
    }
  }
}

module.exports = PostgresCustomerRequestRepo;
