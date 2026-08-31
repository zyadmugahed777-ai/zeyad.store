/**
 * SQLite Coupon Repository
 * Encapsulates all database queries for the coupons table.
 * Methods are synchronous (better-sqlite3). No business logic.
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresCouponRepo extends PostgresBaseRepository {
  /**
   * Find coupon by uppercase code
   * @param {string} code
   * @returns {Object|null}
   */
  async findByCode(code) {
    if (!code) return null;
    const cleanCode = String(code).trim().toUpperCase();
    return await this.db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ?').get(cleanCode) || null;
  }

  /**
   * Find active valid unexpired coupon by code
   * @param {string} code
   * @returns {Object|null}
   */
  async findValidByCode(code) {
    if (!code) return null;
    const cleanCode = String(code).trim().toUpperCase();
    return await this.db.prepare(`
      SELECT * FROM coupons 
      WHERE UPPER(code) = ? AND is_active = 1 
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
        AND (max_uses <= 0 OR used_count < max_uses)
    `).get(cleanCode) || null;
  }

  /**
   * Find coupon by primary key ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    if (!id) return null;
    return await this.db.prepare('SELECT * FROM coupons WHERE id = ?').get(id) || null;
  }

  /**
   * Build WHERE clause and parameters for listing and counting coupons
   * @param {Object} filters
   * @returns {{ where: string, params: Array }}
   */
  _buildFilterQuery(filters = {}) {
    const { search, status, type, scope } = filters;
    const cleanSearch = String(search || '').trim().toUpperCase();
    const cleanStatus = String(status || '').trim();
    const cleanType = String(type || '').trim();
    const cleanScope = String(scope || '').trim();

    let where = 'WHERE 1=1';
    const params = [];

    if (cleanSearch) {
      where += ' AND (UPPER(code) ILIKE ? OR customer_phone ILIKE ? OR notes ILIKE ? OR created_by ILIKE ?)';
      params.push(`%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`, `%${cleanSearch}%`);
    }

    if (cleanStatus === 'active') {
      where += " AND is_active = 1 AND (end_date IS NULL OR end_date >= NOW()) AND (max_uses = 0 OR used_count < max_uses)";
    } else if (cleanStatus === 'inactive') {
      where += ' AND is_active = 0';
    } else if (cleanStatus === 'expired') {
      where += " AND end_date IS NOT NULL AND end_date < NOW()";
    } else if (cleanStatus === 'exhausted') {
      where += ' AND max_uses > 0 AND used_count >= max_uses';
    }

    if (cleanType && cleanType !== 'all') {
      where += ' AND discount_type = ?';
      params.push(cleanType);
    }

    if (cleanScope && cleanScope !== 'all') {
      where += ' AND scope = ?';
      params.push(cleanScope);
    }

    return { where, params };
  }

  /**
   * Count total coupons matching filter criteria
   * @param {Object} filters
   * @returns {number}
   */
  async count(filters = {}) {
    const { where, params } = this._buildFilterQuery(filters);
    return (await this.db.prepare(`SELECT COUNT(*) as count FROM coupons ${where}`).get(...params))?.count || 0;
  }

  /**
   * Find paginated coupons list matching filter criteria
   * @param {Object} filters
   * @param {number} limit
   * @param {number} offset
   * @returns {Array<Object>}
   */
  async findAll(filters = {}, limit = 20, offset = 0) {
    const { where, params } = this._buildFilterQuery(filters);
    return await this.db.prepare(`
      SELECT * FROM coupons
      ${where}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  }

  /**
   * Create a new coupon record
   * @param {Object} data
   * @returns {number} Inserted coupon ID
   */
  async create(data) {
    const stmt = this.db.prepare(`
      INSERT INTO coupons (
        code, discount_type, discount_value, min_order, max_uses, used_count,
        start_date, end_date, is_active, scope, customer_phone, customer_id,
        source_type, source_id, created_by, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, 0,
        COALESCE(?, NOW()), ?, TRUE, ?, ?, ?,
        ?, ?, ?, ?, NOW(), NOW()
      )
    `);

    const res = await stmt.run(
      data.code,
      data.discount_type,
      data.discount_value,
      data.min_order,
      data.max_uses,
      data.start_date || null,
      data.end_date || null,
      data.scope || 'public',
      data.customer_phone || null,
      data.customer_id || null,
      data.source_type || 'admin',
      data.source_id || null,
      data.created_by || 'Admin',
      data.notes || null
    );

    return res.lastInsertRowid;
  }

  /**
   * Update existing coupon record
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async update(id, data) {
    const current = await this.findById(id);
    if (!current) return false;

    const res = await this.db.prepare(`
      UPDATE coupons SET
        discount_type = ?,
        discount_value = ?,
        min_order = ?,
        max_uses = ?,
        start_date = ?,
        end_date = ?,
        is_active = ?,
        scope = ?,
        customer_phone = ?,
        notes = ?,
        updated_at = NOW()
      WHERE id = ?
    `).run(
      data.discount_type !== undefined ? data.discount_type : current.discount_type,
      data.discount_value !== undefined ? data.discount_value : current.discount_value,
      data.min_order !== undefined ? data.min_order : current.min_order,
      data.max_uses !== undefined ? data.max_uses : current.max_uses,
      data.start_date !== undefined ? data.start_date : current.start_date,
      data.end_date !== undefined ? data.end_date : current.end_date,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : current.is_active,
      data.scope !== undefined ? data.scope : current.scope,
      data.customer_phone !== undefined ? data.customer_phone : current.customer_phone,
      data.notes !== undefined ? data.notes : current.notes,
      id
    );

    return res.changes > 0;
  }

  /**
   * Delete coupon by ID
   * @param {number|string} id
   * @returns {boolean}
   */
  async delete(id) {
    const res = await this.db.prepare('DELETE FROM coupons WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /**
   * Atomic synchronous increment of coupon used_count
   * Fails atomically if usage limit has been reached concurrently.
   * @param {number|string} id
   * @returns {boolean} True if redemption succeeded, false if exhausted
   */
  async incrementUsage(id) {
    const stmt = this.db.prepare(`
      UPDATE coupons
      SET used_count = used_count + 1, updated_at = NOW()
      WHERE id = ? 
        AND is_active = 1 
        AND (max_uses = 0 OR max_uses IS NULL OR used_count < max_uses)
    `);

    const result = await stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get operational coupon analytics directly from SQLite
   * @returns {Object}
   */
  async getStats() {
    return {
      total: (await this.db.prepare('SELECT COUNT(*) as count FROM coupons').get())?.count || 0,
      active: (await this.db.prepare(`
        SELECT COUNT(*) as count FROM coupons 
        WHERE is_active = 1 
          AND (end_date IS NULL OR end_date >= NOW()) 
          AND (max_uses = 0 OR used_count < max_uses)
      `).get())?.count || 0,
      expired: (await this.db.prepare("SELECT COUNT(*) as count FROM coupons WHERE end_date IS NOT NULL AND end_date < NOW()").get())?.count || 0,
      exhausted: (await this.db.prepare("SELECT COUNT(*) as count FROM coupons WHERE max_uses > 0 AND used_count >= max_uses").get())?.count || 0,
      totalRedemptions: (await this.db.prepare('SELECT SUM(used_count) as count FROM coupons').get())?.count || 0,
      percentageCount: (await this.db.prepare("SELECT COUNT(*) as count FROM coupons WHERE discount_type = 'percentage'").get())?.count || 0,
      freeShippingCount: (await this.db.prepare("SELECT COUNT(*) as count FROM coupons WHERE discount_type = 'free_shipping'").get())?.count || 0
    };
  }

  /**
   * Find coupons matching customer ID or normalized phone
   * @param {number|string|null} customerId
   * @param {string|null} customerPhone
   * @returns {Array<Object>}
   */
  async findByCustomer(customerId, customerPhone) {
    if (!customerId && !customerPhone) return [];
    return await this.db.prepare(`
      SELECT * FROM coupons 
      WHERE (customer_id IS NOT NULL AND customer_id = ?) 
         OR (customer_phone IS NOT NULL AND customer_phone = ?)
      ORDER BY id DESC
    `).all(customerId || null, customerPhone || null);
  }

  /**
   * Find coupon linked to a specific source (e.g. customer_report)
   * @param {string} sourceType
   * @param {string|number} sourceId
   * @returns {Object|null}
   */
  async findBySource(sourceType, sourceId) {
    if (!sourceType || !sourceId) return null;
    return await this.db.prepare('SELECT * FROM coupons WHERE source_type = ? AND source_id = ? ORDER BY id DESC LIMIT 1').get(sourceType, String(sourceId)) || null;
  }

  /**
   * Find recent orders that redeemed this coupon
   * @param {number|string} couponId
   * @param {string} couponCode
   * @param {number} limit
   * @returns {Array<Object>}
   */
  async findRecentOrders(couponId, couponCode, limit = 5) {
    const cleanCode = String(couponCode || '').trim().toUpperCase();
    return await this.db.prepare(`
      SELECT id, order_id, total, currency, created_at, status
      FROM orders
      WHERE coupon_id = ? OR UPPER(coupon_code) = ?
      ORDER BY id DESC LIMIT ?
    `).all(couponId, cleanCode, limit);
  }
}

module.exports = PostgresCouponRepo;
