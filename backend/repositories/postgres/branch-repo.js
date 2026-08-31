/**
 * SQLite Branch Repository
 * 
 * Encapsulates all database queries for the branches table.
 * Methods are synchronous (better-sqlite3).
 * No business logic — only data access.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresBranchRepo extends PostgresBaseRepository {
  /**
   * Find all branches with optional filtering.
   * @param {object} [filters={}]
   * @param {number|boolean} [filters.is_active]
   * @returns {Array}
   */
  async findAll(filters = {}) {
    let sql = 'SELECT * FROM branches WHERE 1=1';
    const params = [];

    if (filters.is_active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(filters.is_active ? 1 : 0);
    }

    sql += ' ORDER BY sort_order ASC, id ASC';
    return await this.db.prepare(sql).all(...params);
  }

  /**
   * Find a branch by its ID.
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
  }

  /**
   * Create a new branch.
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async create(data) {
    return await this.db.prepare(`
      INSERT INTO branches (
        name_ar, name_en, city, address, phone, whatsapp, 
        google_maps, working_hours, image, sort_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name_ar,
      data.name_en || null,
      data.city || null,
      data.address || null,
      data.phone || null,
      data.whatsapp || null,
      data.google_maps || null,
      data.working_hours || null,
      data.image || null,
      data.sort_order || 0,
      data.is_active ? 1 : 0
    );
  }

  /**
   * Update an existing branch.
   * @param {number|string} id
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async update(id, data) {
    return await this.db.prepare(`
      UPDATE branches SET 
        name_ar = ?, 
        name_en = ?, 
        city = ?, 
        address = ?, 
        phone = ?, 
        whatsapp = ?, 
        google_maps = ?, 
        working_hours = ?, 
        image = ?, 
        sort_order = ?, 
        is_active = ?
      WHERE id = ?
    `).run(
      data.name_ar,
      data.name_en || null,
      data.city || null,
      data.address || null,
      data.phone || null,
      data.whatsapp || null,
      data.google_maps || null,
      data.working_hours || null,
      data.image || null,
      data.sort_order || 0,
      data.is_active ? 1 : 0,
      id
    );
  }

  /**
   * Delete a branch by ID.
   * @param {number|string} id
   * @returns {import('better-sqlite3').RunResult}
   */
  async delete(id) {
    return await this.db.prepare('DELETE FROM branches WHERE id = ?').run(id);
  }
}

module.exports = PostgresBranchRepo;
