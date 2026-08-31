/**
 * SQLite Customer Report Repository
 * Encapsulates all database operations for customer_reports table.
 * Methods are synchronous (better-sqlite3). No business logic.
 */
const crypto = require('crypto');
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresCustomerReportRepo extends PostgresBaseRepository {
  /**
   * Find report by numeric ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM customer_reports WHERE id = ?').get(id) || null;
  }

  /**
   * Find report by report_number (case-insensitive)
   * @param {string} reportNumber
   * @returns {Object|null}
   */
  async findByReportNumber(reportNumber) {
    if (!reportNumber) return null;
    const clean = String(reportNumber).trim().toUpperCase();
    return await this.db.prepare(`
      SELECT * FROM customer_reports
      WHERE report_number = ? OR UPPER(report_number) = ?
    `).get(clean, clean) || null;
  }

  /**
   * Find report by report_number or matching phone
   * @param {string} reportNumber
   * @param {string} phone
   * @returns {Object|null}
   */
  async findByReportNumberAndPhone(reportNumber, phone) {
    if (!reportNumber) return null;
    const clean = String(reportNumber).trim().toUpperCase();
    return await this.db.prepare(`
      SELECT * FROM customer_reports
      WHERE report_number = ? OR (customer_phone = ? AND report_number = ?)
    `).get(clean, phone || '', clean) || null;
  }

  /**
   * Create a new customer report with atomic sequential report_number and tracking token
   * @param {Object} data
   * @returns {{ reportId: number, reportNumber: string, trackingToken: string }}
   */
  async create(data) {
    const trackingToken = crypto.randomBytes(8).toString('hex');

    const createTx = this.db.transaction(async function() {
      const lastRow = await this.db.prepare('SELECT MAX(id) as max_id FROM customer_reports').get();
      const nextId = (lastRow?.max_id || 0) + 1;
      const reportNumber = `BUG-2026-${String(nextId).padStart(6, '0')}`;

      const stmt = this.db.prepare(`
        INSERT INTO customer_reports (
          report_number, tracking_token, customer_name, customer_phone, customer_email,
          issue_type, issue_type_ar, page_url, description, expected_behavior, actual_behavior,
          image_path, context_data, status, priority, ip_address, user_agent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, NOW(), NOW())
      `);

      const result = await stmt.run(
        reportNumber,
        trackingToken,
        data.customer_name || '',
        data.customer_phone || '',
        data.customer_email || '',
        data.issue_type || 'other',
        data.issue_type_ar || 'مشكلة أخرى',
        data.page_url || '',
        data.description || '',
        data.expected_behavior || '',
        data.actual_behavior || '',
        data.image_path || null,
        data.context_data || null,
        data.priority || 'medium',
        data.ip_address || '127.0.0.1',
        data.user_agent || ''
      );

      return {
        reportId: result.lastInsertRowid,
        reportNumber,
        trackingToken
      };
    });

    return await createTx();
  }

  /**
   * Find all customer reports matching filters with pagination
   * @param {Object} filters
   * @param {number} limit
   * @param {number} offset
   * @returns {Array<Object>}
   */
  async findAll(filters = {}, limit = 20, offset = 0) {
    let sql = 'SELECT * FROM customer_reports WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (report_number ILIKE ? OR customer_name ILIKE ? OR customer_phone ILIKE ? OR description ILIKE ? OR issue_type_ar ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.status && filters.status !== 'all') {
      sql += ' AND status = ?';
      params.push(filters.status);
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
   * Count customer reports matching filters
   * @param {Object} filters
   * @returns {number}
   */
  async count(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM customer_reports WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (report_number ILIKE ? OR customer_name ILIKE ? OR customer_phone ILIKE ? OR description ILIKE ? OR issue_type_ar ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.status && filters.status !== 'all') {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.priority && filters.priority !== 'all') {
      sql += ' AND priority = ?';
      params.push(filters.priority);
    }

    return (await this.db.prepare(sql).get(...params))?.count || 0;
  }

  /**
   * Get operational statistics for customer reports
   * @returns {Object}
   */
  async getStats() {
    return {
      total: (await this.db.prepare('SELECT COUNT(*) as count FROM customer_reports').get())?.count || 0,
      new: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_reports WHERE status = 'new'").get())?.count || 0,
      in_review: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_reports WHERE status = 'in_review'").get())?.count || 0,
      verified: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_reports WHERE status = 'verified'").get())?.count || 0,
      rewarded: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_reports WHERE status = 'rewarded' OR reward_status = 'approved'").get())?.count || 0,
      rejected: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_reports WHERE status = 'rejected'").get())?.count || 0,
      completed: (await this.db.prepare("SELECT COUNT(*) as count FROM customer_reports WHERE status IN ('completed', 'closed')").get())?.count || 0
    };
  }

  /**
   * Update report status and admin notes
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async updateStatus(id, data) {
    const fields = [];
    const params = [];

    const allowed = ['status', 'priority', 'admin_notes', 'resolved_at', 'rejected_at'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return false;

    fields.push("last_admin_action_at = NOW()", "updated_at = NOW()");
    params.push(id);

    const sql = `UPDATE customer_reports SET ${fields.join(', ')} WHERE id = ?`;
    const result = await this.db.prepare(sql).run(...params);
    return result.changes > 0;
  }

  /**
   * Update reward details for customer report
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async updateReward(id, data) {
    const result = await this.db.prepare(`
      UPDATE customer_reports SET
        reward_type = ?,
        reward_value = ?,
        reward_code = ?,
        reward_status = 'approved',
        reward_notes = ?,
        status = 'rewarded',
        approved_by = ?,
        approved_at = NOW(),
        rewarded_at = NOW(),
        last_admin_action_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `).run(
      data.reward_type,
      data.reward_value,
      data.reward_code,
      data.reward_notes || '',
      data.approved_by || 'Admin',
      id
    );

    return result.changes > 0;
  }

  /**
   * Update last customer view timestamp
   * @param {number|string} id
   * @returns {boolean}
   */
  async touchCustomerView(id) {
    try {
      const result = await this.db.prepare("UPDATE customer_reports SET last_customer_view_at = NOW() WHERE id = ?").run(id);
      return result.changes > 0;
    } catch (_) {
      return false;
    }
  }

  /**
   * Find previous reports by customer phone
   * @param {string} phone
   * @param {number|string} excludeId
   * @param {number} limit
   * @returns {Array<Object>}
   */
  async findPreviousByPhone(phone, excludeId = 0, limit = 5) {
    if (!phone) return [];
    return await this.db.prepare(`
      SELECT id, report_number, issue_type_ar, status, created_at, reward_status
      FROM customer_reports
      WHERE customer_phone = ? AND id != ?
      ORDER BY id DESC LIMIT ?
    `).all(phone, excludeId, limit);
  }

  /**
   * Find linked coupon and redeemed order for report reward
   * @param {string} rewardCode
   * @returns {{ coupon: Object|null, redeemedOrder: Object|null }}
   */
  async findLinkedCouponAndOrder(rewardCode) {
    if (!rewardCode) return { coupon: null, redeemedOrder: null };

    const coupon = await this.db.prepare('SELECT * FROM coupons WHERE code = ?').get(rewardCode) || null;
    let redeemedOrder = null;

    if (coupon) {
      redeemedOrder = await this.db.prepare(`
        SELECT id, order_id, status, total, currency, created_at
        FROM orders
        WHERE coupon_id = ? OR UPPER(coupon_code) = ?
        ORDER BY id DESC LIMIT 1
      `).get(coupon.id, coupon.code.toUpperCase()) || null;
    }

    return { coupon, redeemedOrder };
  }
}

module.exports = PostgresCustomerReportRepo;
