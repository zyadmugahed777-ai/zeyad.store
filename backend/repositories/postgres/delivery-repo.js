/**
 * SQLite Delivery Repository
 * Encapsulates all database queries for delivery_policies, delivery_provinces,
 * and product-level delivery/installation specifications.
 * Methods are synchronous (better-sqlite3). No business logic.
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresDeliveryRepo extends PostgresBaseRepository {
  /**
   * Find delivery policies with optional filtering
   * @param {Object} [filters={}]
   * @param {boolean} [filters.activeOnly=true]
   * @param {string} [filters.categoryScope]
   * @param {string} [filters.zoneScope]
   * @returns {Array<Object>}
   */
  async findPolicies(filters = {}) {
    let sql = 'SELECT * FROM delivery_policies WHERE 1=1';
    const params = [];

    if (filters.activeOnly !== false) {
      sql += ' AND is_active = 1';
    }
    if (filters.categoryScope) {
      sql += ' AND (category_scope = ? OR category_scope = "all")';
      params.push(filters.categoryScope);
    }
    if (filters.zoneScope) {
      sql += ' AND (zone_scope = ? OR zone_scope = "all")';
      params.push(filters.zoneScope);
    }

    sql += ' ORDER BY sort_order ASC, id ASC';
    return await this.db.prepare(sql).all(...params);
  }

  /**
   * Find delivery policy by primary key ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findPolicyById(id) {
    if (!id) return null;
    return await this.db.prepare('SELECT * FROM delivery_policies WHERE id = ?').get(id) || null;
  }

  /**
   * Find delivery policy by unique code
   * @param {string} code
   * @returns {Object|null}
   */
  async findPolicyByCode(code) {
    if (!code) return null;
    const cleanCode = String(code).trim();
    return await this.db.prepare('SELECT * FROM delivery_policies WHERE code = ?').get(cleanCode) || null;
  }

  /**
   * Create a new delivery policy
   * @param {Object} data
   * @returns {number} Inserted ID
   */
  async createPolicy(data) {
    const insert = this.db.prepare(`
      INSERT INTO delivery_policies (
        code, name_ar, name_en, description, category_scope, zone_scope,
        service_type, pricing_type, min_price_yer, max_price_yer, min_price_sar, max_price_sar,
        fixed_price_yer, fixed_price_sar, is_active, sort_order, notes, created_at, updated_at
      ) VALUES (
        @code, @name_ar, @name_en, @description, @category_scope, @zone_scope,
        @service_type, @pricing_type, @min_price_yer, @max_price_yer, @min_price_sar, @max_price_sar,
        @fixed_price_yer, @fixed_price_sar, @is_active, @sort_order, @notes, NOW(), NOW()
      )
    `);

    const res = insert.run({
      code: String(data.code || '').trim(),
      name_ar: String(data.name_ar || '').trim(),
      name_en: data.name_en ? String(data.name_en).trim() : null,
      description: data.description ? String(data.description).trim() : null,
      category_scope: data.category_scope || 'all',
      zone_scope: data.zone_scope || 'all',
      service_type: data.service_type || 'delivery',
      pricing_type: data.pricing_type || 'range',
      min_price_yer: Number(data.min_price_yer || 0),
      max_price_yer: Number(data.max_price_yer || 0),
      min_price_sar: Number(data.min_price_sar || 0),
      max_price_sar: Number(data.max_price_sar || 0),
      fixed_price_yer: Number(data.fixed_price_yer || 0),
      fixed_price_sar: Number(data.fixed_price_sar || 0),
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      sort_order: Number(data.sort_order || 0),
      notes: data.notes ? String(data.notes).trim() : null
    });

    return res.lastInsertRowid;
  }

  /**
   * Update existing delivery policy
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async updatePolicy(id, data) {
    const current = await this.findPolicyById(id);
    if (!current) return false;

    const res = await this.db.prepare(`
      UPDATE delivery_policies SET
        name_ar = ?,
        name_en = ?,
        description = ?,
        category_scope = ?,
        zone_scope = ?,
        service_type = ?,
        pricing_type = ?,
        min_price_yer = ?,
        max_price_yer = ?,
        min_price_sar = ?,
        max_price_sar = ?,
        fixed_price_yer = ?,
        fixed_price_sar = ?,
        is_active = ?,
        sort_order = ?,
        notes = ?,
        updated_at = NOW()
      WHERE id = ?
    `).run(
      data.name_ar !== undefined ? data.name_ar : current.name_ar,
      data.name_en !== undefined ? data.name_en : current.name_en,
      data.description !== undefined ? data.description : current.description,
      data.category_scope !== undefined ? data.category_scope : current.category_scope,
      data.zone_scope !== undefined ? data.zone_scope : current.zone_scope,
      data.service_type !== undefined ? data.service_type : current.service_type,
      data.pricing_type !== undefined ? data.pricing_type : current.pricing_type,
      data.min_price_yer !== undefined ? data.min_price_yer : current.min_price_yer,
      data.max_price_yer !== undefined ? data.max_price_yer : current.max_price_yer,
      data.min_price_sar !== undefined ? data.min_price_sar : current.min_price_sar,
      data.max_price_sar !== undefined ? data.max_price_sar : current.max_price_sar,
      data.fixed_price_yer !== undefined ? data.fixed_price_yer : current.fixed_price_yer,
      data.fixed_price_sar !== undefined ? data.fixed_price_sar : current.fixed_price_sar,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : current.is_active,
      data.sort_order !== undefined ? Number(data.sort_order) : current.sort_order,
      data.notes !== undefined ? data.notes : current.notes,
      id
    );

    return res.changes > 0;
  }

  /**
   * Toggle delivery policy active state
   * @param {number|string} id
   * @returns {number|null} New active state (1 or 0) or null if not found
   */
  async togglePolicy(id) {
    const current = await this.findPolicyById(id);
    if (!current) return null;

    const newStatus = current.is_active ? 0 : 1;
    await this.db.prepare("UPDATE delivery_policies SET is_active = ?, updated_at = NOW() WHERE id = ?").run(newStatus, id);
    return newStatus;
  }

  /**
   * Delete delivery policy
   * @param {number|string} id
   * @returns {boolean}
   */
  async deletePolicy(id) {
    const res = await this.db.prepare('DELETE FROM delivery_policies WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /**
   * Find provinces list
   * @param {boolean} [activeOnly=true]
   * @returns {Array<Object>}
   */
  async findProvinces(activeOnly = true) {
    let sql = 'SELECT * FROM delivery_provinces';
    if (activeOnly) {
      sql += ' WHERE is_active = 1';
    }
    sql += ' ORDER BY sort_order ASC, id ASC';
    return await this.db.prepare(sql).all();
  }

  /**
   * Find province by ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findProvinceById(id) {
    if (!id) return null;
    return await this.db.prepare('SELECT * FROM delivery_provinces WHERE id = ?').get(id) || null;
  }

  /**
   * Toggle province active status
   * @param {number|string} id
   * @returns {number|null} New active status (1 or 0) or null if not found
   */
  async toggleProvince(id) {
    const current = await this.findProvinceById(id);
    if (!current) return null;

    const newStatus = current.is_active ? 0 : 1;
    await this.db.prepare("UPDATE delivery_provinces SET is_active = ?, updated_at = NOW() WHERE id = ?").run(newStatus, id);
    return newStatus;
  }

  /**
   * Fetch product delivery and installation attributes for an array of product identifiers
   * @param {Array<string|number>} productIdentifiers
   * @returns {Array<Object>}
   */
  async findProductsDeliveryInfo(productIdentifiers = []) {
    if (!productIdentifiers || productIdentifiers.length === 0) return [];

    const cleanIds = productIdentifiers.filter(Boolean);
    if (cleanIds.length === 0) return [];

    const placeholders = cleanIds.map(() => '?').join(',');
    const sql = `
      SELECT p.id, p.product_id, p.sku, p.title, p.category_id, p.price,
             p.delivery_policy_type, p.delivery_fixed_fee_sar,
             p.requires_installation, p.installation_fee_sar,
             c.slug as category_slug, c.name_ar as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id IN (${placeholders}) OR p.product_id IN (${placeholders}) OR p.sku IN (${placeholders})
    `;

    try {
      return await this.db.prepare(sql).all(...cleanIds, ...cleanIds, ...cleanIds);
    } catch (_) {
      return [];
    }
  }

  /**
   * Get operational statistics for delivery dashboard
   * @returns {Object}
   */
  async getStats() {
    const policies = await this.findPolicies({ activeOnly: false });
    const provinces = await this.findProvinces(false);

    return {
      totalPolicies: policies.length,
      activePolicies: policies.filter(p => p.is_active === true || p.is_active === 1).length,
      totalProvinces: provinces.length,
      activeProvinces: provinces.filter(p => p.is_active === true || p.is_active === 1).length
    };
  }
}

module.exports = PostgresDeliveryRepo;
