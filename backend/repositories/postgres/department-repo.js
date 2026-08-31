/**
 * SQLite Department Repository
 * 
 * Encapsulates all database queries for the departments table.
 * Methods are synchronous (better-sqlite3).
 * No business logic — only data access.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresDepartmentRepo extends PostgresBaseRepository {
  /**
   * Find departments with optional filters and counts.
   * @param {object} [filters={}]
   * @param {string} [filters.search]
   * @param {string|number} [filters.status]
   * @param {number|boolean} [filters.is_active]
   * @param {number} [filters.limit]
   * @param {number} [filters.offset]
   * @returns {Array}
   */
  async findAll(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.search) {
      where += ' AND (d.name_ar ILIKE ? OR d.name_en ILIKE ? OR d.slug ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    // Anything that is not a clean 0/1 is ignored rather than coerced. The old
    // Number() cast turned a stray value into NaN, which PostgreSQL rejected
    // with 'invalid input syntax for type boolean: "NaN"' and 500'd the page.
    if (filters.status !== undefined && filters.status !== '' && filters.status !== null) {
      const flag = String(filters.status).trim();
      if (flag === '0' || flag === '1' || flag === 'true' || flag === 'false') {
        where += ' AND d.is_active = ?';
        params.push(flag === '1' || flag === 'true' ? 1 : 0);
      }
    }

    if (filters.is_active !== undefined && filters.is_active !== '') {
      where += ' AND d.is_active = ?';
      params.push(filters.is_active ? 1 : 0);
    }

    let sql = `
      SELECT d.*, 
             (SELECT COUNT(*) FROM subcategories s WHERE s.department_id = d.id) as subcats_count,
             (SELECT COUNT(*) FROM products p WHERE p.department_id = d.id) as products_count
      FROM departments d 
      ${where} 
      ORDER BY d.sort_order ASC, d.id ASC
    `;

    if (filters.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(Number(filters.limit));
      if (filters.offset !== undefined) {
        sql += ' OFFSET ?';
        params.push(Number(filters.offset));
      }
    }

    return await this.db.prepare(sql).all(...params);
  }

  /**
   * Count departments matching filters.
   * @param {object} [filters={}]
   * @returns {number}
   */
  async count(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.search) {
      where += ' AND (name_ar ILIKE ? OR name_en ILIKE ? OR slug ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.status !== undefined && filters.status !== '') {
      where += ' AND is_active = ?';
      params.push(Number(filters.status));
    }

    if (filters.is_active !== undefined && filters.is_active !== '') {
      where += ' AND is_active = ?';
      params.push(filters.is_active ? 1 : 0);
    }

    const sql = `SELECT COUNT(*) as count FROM departments ${where}`;
    return (await this.db.prepare(sql).get(...params)).count;
  }

  /**
   * Simple list of active/all departments for dropdowns.
   * @returns {Array<{id: number, name_ar: string}>}
   */
  async listSimple() {
    return await this.db.prepare('SELECT id, name_ar FROM departments ORDER BY sort_order ASC').all();
  }

  /**
   * Find a department by ID.
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
  }

  /**
   * Find a department by slug.
   * @param {string} slug
   * @returns {object|undefined}
   */
  async findBySlug(slug) {
    return await this.db.prepare('SELECT * FROM departments WHERE slug = ?').get(slug);
  }

  /**
   * Count subcategories linked to a department.
   * @param {number|string} departmentId
   * @returns {number}
   */
  async countSubcategories(departmentId) {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM subcategories WHERE department_id = ?').get(departmentId)).count;
  }

  /**
   * Count products linked to a department.
   * @param {number|string} departmentId
   * @returns {number}
   */
  async countProducts(departmentId) {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM products WHERE department_id = ?').get(departmentId)).count;
  }

  /**
   * Create a new department.
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async create(data) {
    return await this.db.prepare(`
      INSERT INTO departments (slug, name_ar, name_en, icon, image, description_ar, description_en, sort_order, is_active)
      VALUES (@slug, @name_ar, @name_en, @icon, @image, @description_ar, @description_en, @sort_order, @is_active)
    `).run({
      slug: data.slug,
      name_ar: data.name_ar,
      name_en: data.name_en || null,
      icon: data.icon || null,
      image: data.image || null,
      description_ar: data.description_ar || null,
      description_en: data.description_en || null,
      sort_order: data.sort_order || 0,
      is_active: data.is_active ? 1 : 0
    });
  }

  /**
   * Update an existing department.
   * @param {number|string} id
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async update(id, data) {
    return await this.db.prepare(`
      UPDATE departments 
      SET slug = @slug, name_ar = @name_ar, name_en = @name_en, icon = @icon, image = @image,
          description_ar = @description_ar, description_en = @description_en, sort_order = @sort_order, 
          is_active = @is_active, updated_at = NOW()
      WHERE id = @id
    `).run({
      id,
      slug: data.slug,
      name_ar: data.name_ar,
      name_en: data.name_en || null,
      icon: data.icon || null,
      image: data.image || null,
      description_ar: data.description_ar || null,
      description_en: data.description_en || null,
      sort_order: data.sort_order || 0,
      is_active: data.is_active ? 1 : 0
    });
  }

  /**
   * Delete a department by ID.
   * @param {number|string} id
   * @returns {import('better-sqlite3').RunResult}
   */
  async delete(id) {
    return await this.db.prepare('DELETE FROM departments WHERE id = ?').run(id);
  }
}

module.exports = PostgresDepartmentRepo;
