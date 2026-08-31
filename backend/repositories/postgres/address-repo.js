/**
 * SQLite Address Repository
 * Encapsulates all database queries for addresses table.
 * Methods are synchronous (better-sqlite3). No business logic.
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresAddressRepo extends PostgresBaseRepository {
  /**
   * Find address by primary key ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    if (!id) return null;
    return await this.db.prepare('SELECT * FROM addresses WHERE id = ?').get(id) || null;
  }

  /**
   * Find all addresses belonging to a customer
   * @param {number|string} customerId
   * @returns {Array<Object>}
   */
  async findByCustomer(customerId) {
    if (!customerId) return [];
    return await this.db.prepare(`
      SELECT * FROM addresses 
      WHERE customer_id = ? 
      ORDER BY is_default DESC, id DESC
    `).all(Number(customerId));
  }

  /**
   * Find all addresses belonging to a guest session
   * @param {string} guestId
   * @returns {Array<Object>}
   */
  async findByGuest(guestId) {
    if (!guestId) return [];
    return await this.db.prepare(`
      SELECT * FROM addresses 
      WHERE guest_id = ? AND customer_id IS NULL 
      ORDER BY is_default DESC, id DESC
    `).all(String(guestId));
  }

  /**
   * Find default address for a customer or guest session
   * @param {number|string|null} customerId
   * @param {string|null} guestId
   * @returns {Object|null}
   */
  async findDefault(customerId = null, guestId = null) {
    if (customerId) {
      return await this.db.prepare('SELECT * FROM addresses WHERE customer_id = ? AND is_default = 1 LIMIT 1').get(Number(customerId)) || null;
    }
    if (guestId) {
      return await this.db.prepare('SELECT * FROM addresses WHERE guest_id = ? AND customer_id IS NULL AND is_default = 1 LIMIT 1').get(String(guestId)) || null;
    }
    return null;
  }

  /**
   * Clear is_default flag for all addresses of a customer or guest
   * @param {number|string|null} customerId
   * @param {string|null} guestId
   * @returns {number} Number of updated rows
   */
  async clearDefaults(customerId = null, guestId = null) {
    if (customerId) {
      const res = this.db.prepare('UPDATE addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE customer_id = ?').run(Number(customerId));
      return res.changes;
    }
    if (guestId) {
      const res = this.db.prepare('UPDATE addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE guest_id = ? AND customer_id IS NULL').run(String(guestId));
      return res.changes;
    }
    return 0;
  }

  /**
   * Create a new address record
   * @param {Object} data
   * @returns {number} Inserted address ID
   */
  async create(data) {
    const stmt = this.db.prepare(`
      INSERT INTO addresses (
        customer_id, guest_id, title, country, province, city, district,
        street, address_line, formatted_address, building_info,
        latitude, longitude, is_default, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, NOW(), NOW()
      )
    `);

    const res = await stmt.run(
      data.customer_id ? Number(data.customer_id) : null,
      data.customer_id ? null : (data.guest_id ? String(data.guest_id) : null),
      data.title || 'عنوان التوصيل',
      data.country || 'اليمن',
      data.province || data.city || 'صنعاء',
      data.city || data.province || 'صنعاء',
      data.district || null,
      data.street || null,
      data.address_line || null,
      data.formatted_address || null,
      data.building_info || null,
      data.latitude !== undefined && data.latitude !== null ? Number(data.latitude) : null,
      data.longitude !== undefined && data.longitude !== null ? Number(data.longitude) : null,
      data.is_default ? 1 : 0,
      data.notes || null
    );

    return res.lastInsertRowid;
  }

  /**
   * Update existing address record
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async update(id, data) {
    const current = await this.findById(id);
    if (!current) return false;

    const res = await this.db.prepare(`
      UPDATE addresses SET
        title = ?,
        country = ?,
        province = ?,
        city = ?,
        district = ?,
        street = ?,
        address_line = ?,
        formatted_address = ?,
        building_info = ?,
        latitude = ?,
        longitude = ?,
        is_default = ?,
        notes = ?,
        updated_at = NOW()
      WHERE id = ?
    `).run(
      data.title !== undefined ? data.title : current.title,
      data.country !== undefined ? data.country : current.country,
      data.province !== undefined ? data.province : current.province,
      data.city !== undefined ? data.city : current.city,
      data.district !== undefined ? data.district : current.district,
      data.street !== undefined ? data.street : current.street,
      data.address_line !== undefined ? data.address_line : current.address_line,
      data.formatted_address !== undefined ? data.formatted_address : current.formatted_address,
      data.building_info !== undefined ? data.building_info : current.building_info,
      data.latitude !== undefined ? (data.latitude !== null ? Number(data.latitude) : null) : current.latitude,
      data.longitude !== undefined ? (data.longitude !== null ? Number(data.longitude) : null) : current.longitude,
      data.is_default !== undefined ? (data.is_default ? 1 : 0) : current.is_default,
      data.notes !== undefined ? data.notes : current.notes,
      id
    );

    return res.changes > 0;
  }

  /**
   * Delete address record by ID
   * @param {number|string} id
   * @returns {boolean}
   */
  async delete(id) {
    const res = await this.db.prepare('DELETE FROM addresses WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /**
   * Count total addresses matching filter criteria
   * @param {Object} [filters={}]
   * @returns {number}
   */
  async count(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.customerId) {
      where += ' AND customer_id = ?';
      params.push(Number(filters.customerId));
    }
    if (filters.guestId) {
      where += ' AND guest_id = ? AND customer_id IS NULL';
      params.push(String(filters.guestId));
    }

    return (await this.db.prepare(`SELECT COUNT(*) as count FROM addresses ${where}`).get(...params))?.count || 0;
  }

  /**
   * Find paginated addresses matching filter criteria
   * @param {Object} [filters={}]
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @returns {Array<Object>}
   */
  async findAll(filters = {}, limit = 50, offset = 0) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.customerId) {
      where += ' AND customer_id = ?';
      params.push(Number(filters.customerId));
    }
    if (filters.guestId) {
      where += ' AND guest_id = ? AND customer_id IS NULL';
      params.push(String(filters.guestId));
    }

    return await this.db.prepare(`
      SELECT * FROM addresses
      ${where}
      ORDER BY is_default DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  }
}

module.exports = PostgresAddressRepo;
