/**
 * SQLite Najm Customer Requests Repository
 * Handles ai_customer_requests table (conversational human handoff mirror).
 */
class NajmRequestsRepo {
  constructor(db) {
    this.db = db;
  }

  async createRequest({
    requestId,
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
    priority = 'normal'
  }) {
    const res = await this.db.prepare(`
      INSERT INTO ai_customer_requests (
        request_id, conversation_id, customer_name, phone,
        order_id, category, request_text, requested_products,
        quantity, budget, najm_notes, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())
    `).run(
      requestId,
      conversationId || null,
      customerName,
      phone,
      orderId || null,
      category,
      requestText,
      requestedProducts,
      quantity,
      budget,
      najmNotes,
      priority
    );
    return res.lastInsertRowid;
  }

  async listRequests({ status = null, category = null, search = '', limit = 50, offset = 0 } = {}) {
    let sql = 'SELECT * FROM ai_customer_requests WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      sql += ' AND (request_id ILIKE ? OR customer_name ILIKE ? OR phone ILIKE ? OR request_text ILIKE ? OR requested_products ILIKE ?)';
      params.push(q, q, q, q, q);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Math.min(Number(limit) || 50, 100), Math.max(Number(offset) || 0, 0));

    return await this.db.prepare(sql).all(...params);
  }

  async getRequestById(idOrRequestId) {
    return await this.db.prepare(`
      SELECT * FROM ai_customer_requests
      WHERE CAST(id AS TEXT) = ? OR request_id = ?
    `).get(idOrRequestId, String(idOrRequestId));
  }

  async updateStatus(idOrRequestId, status, adminNotes = null) {
    return await this.db.prepare(`
      UPDATE ai_customer_requests SET
        status = ?,
        admin_notes = COALESCE(?, admin_notes),
        updated_at = NOW()
      WHERE CAST(id AS TEXT) = ? OR request_id = ?
    `).run(status, adminNotes ? String(adminNotes).trim() : null, idOrRequestId, String(idOrRequestId));
  }

  async countTotal() {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM ai_customer_requests').get())?.count || 0;
  }

  async countByStatus(status) {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM ai_customer_requests WHERE status = ?').get(status))?.count || 0;
  }

  async countByStatuses(statuses = []) {
    if (!statuses.length) return 0;
    const placeholders = statuses.map(() => '?').join(',');
    return (await this.db.prepare(`SELECT COUNT(*) as count FROM ai_customer_requests WHERE status IN (${placeholders})`).get(...statuses))?.count || 0;
  }
}

module.exports = NajmRequestsRepo;
