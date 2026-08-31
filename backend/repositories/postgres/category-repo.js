/**
 * SQLite Category Repository
 * 
 * Encapsulates all database queries for the categories table and its direct relationships.
 * Methods are synchronous (better-sqlite3).
 * No business logic — only data access.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresCategoryRepo extends PostgresBaseRepository {
  /**
   * Find categories with optional filters, product counts, and pagination.
   * @param {object} [filters={}]
   * @param {number|boolean} [filters.is_active]
   * @param {number|string} [filters.department_id]
   * @param {number|string} [filters.parent_id]
   * @param {string} [filters.search]
   * @param {string} [filters.status]
   * @param {boolean} [filters.withProductCount=false] Include active product count
   * @param {boolean} [filters.withAdminProductCount=false] Include all non-archived products count & department name
   * @param {number} [filters.limit]
   * @param {number} [filters.offset]
   * @returns {Array}
   */
  async findAll(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.is_active !== undefined && filters.is_active !== '') {
      where += ' AND c.is_active = ?';
      params.push(filters.is_active ? 1 : 0);
    }

    // See department-repo: a non-numeric status used to become NaN and make
    // PostgreSQL reject the whole query.
    if (filters.status !== undefined && filters.status !== '' && filters.status !== null) {
      const flag = String(filters.status).trim();
      if (flag === '0' || flag === '1' || flag === 'true' || flag === 'false') {
        where += ' AND c.is_active = ?';
        params.push(flag === '1' || flag === 'true' ? 1 : 0);
      }
    }

    if (filters.parent_id !== undefined) {
      where += ' AND c.parent_id = ?';
      params.push(filters.parent_id);
    }

    if (filters.department_id !== undefined && filters.department_id !== '') {
      where += ' AND c.department_id = ?';
      params.push(filters.department_id);
    }

    if (filters.search) {
      where += ' AND (c.name_ar ILIKE ? OR c.name_en ILIKE ? OR c.slug ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    let selectCols = 'c.*';
    let joins = '';
    let orderBy = 'c.sort_order ASC, c.id ASC';

    if (filters.withProductCount) {
      selectCols = `
        c.*, 
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)) as product_count
      `;
      orderBy = 'c.sort_order ASC';
    } else if (filters.withAdminProductCount) {
      selectCols = `
        c.*, d.name_ar as department_name,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND (p.is_archived = 0 OR p.is_archived IS NULL)) as products_count,
        COALESCE(c.image, '/assets/placeholder.svg') as display_image
      `;
      joins = 'LEFT JOIN departments d ON c.department_id = d.id';
      orderBy = 'c.department_id ASC, c.sort_order ASC';
    }

    let sql = `SELECT ${selectCols} FROM categories c ${joins} ${where} ORDER BY ${orderBy}`;

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
   * Count categories matching filters.
   * @param {object} [filters={}]
   * @returns {number}
   */
  async count(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.is_active !== undefined && filters.is_active !== '') {
      where += ' AND c.is_active = ?';
      params.push(filters.is_active ? 1 : 0);
    }

    // See department-repo: a non-numeric status used to become NaN and make
    // PostgreSQL reject the whole query.
    if (filters.status !== undefined && filters.status !== '' && filters.status !== null) {
      const flag = String(filters.status).trim();
      if (flag === '0' || flag === '1' || flag === 'true' || flag === 'false') {
        where += ' AND c.is_active = ?';
        params.push(flag === '1' || flag === 'true' ? 1 : 0);
      }
    }

    if (filters.department_id !== undefined && filters.department_id !== '') {
      where += ' AND c.department_id = ?';
      params.push(filters.department_id);
    }

    if (filters.search) {
      where += ' AND (c.name_ar ILIKE ? OR c.name_en ILIKE ? OR c.slug ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    const sql = `SELECT COUNT(*) as count FROM categories c ${where}`;
    return (await this.db.prepare(sql).get(...params)).count;
  }

  /**
   * Find a category by its internal ID.
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  /**
   * Find active category by slug or ID with product count.
   * @param {string|number} slugOrId
   * @returns {object|undefined}
   */
  async findBySlugWithCount(slugOrId) {
    const slugStr = String(slugOrId);
    return await this.db.prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)) as product_count
      FROM categories c 
      WHERE (c.slug = ? OR CAST(c.id AS TEXT) = ?) AND c.is_active = 1
    `).get(slugStr, slugStr);
  }

  /**
   * Find active products belonging to a category.
   * @param {number|string} categoryId
   * @param {number} [limit=100]
   * @returns {Array}
   */
  async findCategoryProducts(categoryId, limit = 100) {
    return await this.db.prepare(`
      SELECT p.*,
             (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      WHERE p.category_id = ? AND p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)
      ORDER BY p.sort_order ASC, p.id DESC
      LIMIT ?
    `).all(categoryId, limit);
  }

  /**
   * Find simple category list for a department.
   * @param {number|string} departmentId
   * @returns {Array<{id: number, name_ar: string}>}
   */
  async findByDepartment(departmentId) {
    return await this.db.prepare(
      'SELECT id, name_ar FROM categories WHERE department_id = ? AND is_active = 1 ORDER BY sort_order ASC'
    ).all(departmentId);
  }

  /**
   * Count products currently assigned to a category.
   * @param {number|string} categoryId
   * @returns {number}
   */
  async getProductCount(categoryId) {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(categoryId)).count;
  }

  /**
   * Find active categories for sitemap generation.
   * @returns {Array<{id: number, slug: string, updated_at: string}>}
   */
  async findActiveForSitemap() {
    return await this.db.prepare('SELECT id, slug, updated_at FROM categories WHERE is_active = 1').all();
  }

  /**
   * Get mapping of category code -> category ID.
   * @returns {Record<string, number>}
   */
  async getCodeToIdMap() {
    const rows = await this.db.prepare('SELECT id, code FROM categories').all();
    const map = {};
    for (const r of rows) {
      if (r.code) map[r.code] = r.id;
    }
    return map;
  }

  /**
   * Create a new category.
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async create(data) {
    return await this.db.prepare(`
      INSERT INTO categories (code, department_id, slug, name_ar, name_en, image, description_ar, sort_order, display_style, is_active)
      VALUES (@code, @department_id, @slug, @name_ar, @name_en, @image, @description_ar, @sort_order, @display_style, @is_active)
    `).run({
      code: data.code,
      department_id: data.department_id,
      slug: data.slug,
      name_ar: data.name_ar,
      name_en: data.name_en || null,
      image: data.image || null,
      description_ar: data.description_ar || null,
      sort_order: data.sort_order || 0,
      /* NULL means "the default card shape". The route has already reduced
         anything unrecognised to null, and the column carries a CHECK
         constraint saying the same thing. */
      display_style: data.display_style || null,
      is_active: data.is_active ? 1 : 0
    });
  }

  /**
   * Update an existing category.
   * @param {number|string} id
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async update(id, data) {
    return await this.db.prepare(`
      UPDATE categories 
      SET department_id = @department_id, slug = @slug, name_ar = @name_ar, name_en = @name_en, 
          image = @image, description_ar = @description_ar, sort_order = @sort_order,
          display_style = @display_style, is_active = @is_active, updated_at = NOW()
      WHERE id = @id
    `).run({
      id,
      department_id: data.department_id,
      slug: data.slug,
      name_ar: data.name_ar,
      name_en: data.name_en || null,
      image: data.image || null,
      description_ar: data.description_ar || null,
      sort_order: data.sort_order || 0,
      /* NULL means "the default card shape". The route has already reduced
         anything unrecognised to null, and the column carries a CHECK
         constraint saying the same thing. */
      display_style: data.display_style || null,
      is_active: data.is_active ? 1 : 0
    });
  }

  /**
   * Delete a category by ID.
   * @param {number|string} id
   * @returns {import('better-sqlite3').RunResult}
   */
  async delete(id) {
    return await this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  /**
   * Find active categories with product counts for customer tools
   * @returns {Array}
   */
  async findActiveWithProductCounts() {
    return await this.db.prepare(`
      SELECT c.id, c.name_ar, c.slug, c.description_ar, c.image,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) as product_count
      FROM categories c
      WHERE c.is_active = 1
      ORDER BY c.sort_order ASC, c.id ASC
    `).all();
  }
}

module.exports = PostgresCategoryRepo;
