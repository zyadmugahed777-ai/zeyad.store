/**
 * Zeyad For Business — SQLite Offer Repository
 * 
 * Database access layer for promotional offers and discounts.
 * Handles database operations only (pure persistence, no file I/O).
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresOfferRepo extends PostgresBaseRepository {
  /**
   * List offers with filtering, search, and pagination
   * @param {Object} options
   * @param {string} [options.search]
   * @param {string} [options.status]
   * @param {string} [options.placement]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @returns {{ offers: Array, totalItems: number }}
   */
  async findAll({ search = '', status = '', placement = '', limit = 20, offset = 0 } = {}) {
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ' AND (o.title_ar ILIKE ? OR o.coupon_code ILIKE ? OR o.description ILIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ' AND o.status = ?';
      params.push(status);
    }
    if (placement) {
      where += ' AND o.placement ILIKE ?';
      params.push(`%${placement}%`);
    }

    const countRow = await this.db.prepare(`SELECT COUNT(*) as count FROM offers o ${where}`).get(...params);
    const totalItems = countRow?.count || 0;

    const offers = await this.db.prepare(`
      SELECT o.*, d.name_ar as department_name, c.name_ar as category_name, p.title as product_title
      FROM offers o
      LEFT JOIN departments d ON d.id = o.department_id
      LEFT JOIN categories c ON c.id = o.category_id
      LEFT JOIN products p ON p.id = o.product_id_ref
      ${where}
      ORDER BY o.sort_order ASC, o.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { offers, totalItems };
  }

  /**
   * Find active offers for public website
   * @param {string} [nowIso]
   * @returns {Array}
   */
  async findActive(nowIso = new Date().toISOString()) {
    return await this.db.prepare(`
      SELECT * FROM offers 
      WHERE is_active = 1 
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
      ORDER BY sort_order ASC, id DESC
    `).all(nowIso, nowIso);
  }

  /**
   * Find offer by primary key ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM offers WHERE id = ?').get(id) || null;
  }

  /**
   * Create a new offer record
   * @param {Object} offer
   * @returns {Object} created record with id
   */
  async create(offer) {
    const stmt = this.db.prepare(`
      INSERT INTO offers (
        title_ar, title_en, description, image, button_text, link, coupon_code,
        discount_type, discount_value, discount_amount, min_order, start_date, end_date,
        applicable_categories, applicable_products, department_id, category_id, product_id_ref,
        placement, status, is_active, sort_order
      ) VALUES (
        @title_ar, @title_en, @description, @image, @button_text, @link, @coupon_code,
        @discount_type, @discount_value, @discount_amount, @min_order, @start_date, @end_date,
        @applicable_categories, @applicable_products, @department_id, @category_id, @product_id_ref,
        @placement, @status, @is_active, @sort_order
      )
    `);

    const result = await stmt.run({
      title_ar: offer.title_ar,
      title_en: offer.title_en || '',
      description: offer.description || '',
      image: offer.image || null,
      button_text: offer.button_text || '',
      link: offer.link || '',
      coupon_code: (offer.coupon_code || '').toUpperCase(),
      discount_type: offer.discount_type || 'percentage',
      discount_value: Number(offer.discount_value || 0),
      discount_amount: Number(offer.discount_amount || 0),
      min_order: offer.min_order ? Number(offer.min_order) : null,
      start_date: offer.start_date || null,
      end_date: offer.end_date || null,
      applicable_categories: offer.applicable_categories || '',
      applicable_products: offer.applicable_products || '',
      department_id: offer.department_id || null,
      category_id: offer.category_id || null,
      product_id_ref: offer.product_id_ref || null,
      placement: offer.placement || 'home',
      status: offer.status || 'draft',
      is_active: offer.is_active !== undefined ? offer.is_active : (offer.status === 'active' ? 1 : 0),
      sort_order: Number(offer.sort_order || 0)
    });

    return {
      id: Number(result.lastInsertRowid),
      ...offer
    };
  }

  /**
   * Update an existing offer record
   * @param {number|string} id
   * @param {Object} offer
   * @returns {boolean} true if updated
   */
  async update(id, offer) {
    const stmt = this.db.prepare(`
      UPDATE offers SET
        title_ar = @title_ar, title_en = @title_en, description = @description, image = @image,
        button_text = @button_text, link = @link, coupon_code = @coupon_code,
        discount_type = @discount_type, discount_value = @discount_value, discount_amount = @discount_amount,
        min_order = @min_order, start_date = @start_date, end_date = @end_date,
        applicable_categories = @applicable_categories, applicable_products = @applicable_products,
        department_id = @department_id, category_id = @category_id, product_id_ref = @product_id_ref,
        placement = @placement, status = @status, is_active = @is_active, sort_order = @sort_order,
        updated_at = NOW()
      WHERE id = @id
    `);

    const result = await stmt.run({
      id,
      title_ar: offer.title_ar,
      title_en: offer.title_en || '',
      description: offer.description || '',
      image: offer.image || null,
      button_text: offer.button_text || '',
      link: offer.link || '',
      coupon_code: (offer.coupon_code || '').toUpperCase(),
      discount_type: offer.discount_type || 'percentage',
      discount_value: Number(offer.discount_value || 0),
      discount_amount: Number(offer.discount_amount || 0),
      min_order: offer.min_order ? Number(offer.min_order) : null,
      start_date: offer.start_date || null,
      end_date: offer.end_date || null,
      applicable_categories: offer.applicable_categories || '',
      applicable_products: offer.applicable_products || '',
      department_id: offer.department_id || null,
      category_id: offer.category_id || null,
      product_id_ref: offer.product_id_ref || null,
      placement: offer.placement || 'home',
      status: offer.status || 'draft',
      is_active: offer.is_active !== undefined ? offer.is_active : (offer.status === 'active' ? 1 : 0),
      sort_order: Number(offer.sort_order || 0)
    });

    return result.changes > 0;
  }

  /**
   * Delete an offer record by ID
   * @param {number|string} id
   * @returns {boolean} true if deleted
   */
  async delete(id) {
    const result = await this.db.prepare('DELETE FROM offers WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Execute bulk action on an array of offer IDs atomically
   * @param {string} action - 'delete' | 'activate' | 'hide'
   * @param {Array<number|string>} ids
   * @returns {number} number of affected records
   */
  async bulkAction(action, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');

    return this.db.transaction(async function() {
      if (action === 'delete') {
        const res = await this.db.prepare(`DELETE FROM offers WHERE id IN (${placeholders})`).run(...ids);
        return res.changes;
      } else if (action === 'activate') {
        const res = await this.db.prepare(`UPDATE offers SET status = 'active', is_active = 1 WHERE id IN (${placeholders})`).run(...ids);
        return res.changes;
      } else if (action === 'hide') {
        const res = await this.db.prepare(`UPDATE offers SET status = 'hidden', is_active = 0 WHERE id IN (${placeholders})`).run(...ids);
        return res.changes;
      }
      return 0;
    })();
  }

  /**
   * Update sort order for multiple offers atomically
   * @param {Array<number|string>} ids - Ordered list of offer IDs
   * @returns {boolean} true if successful
   */
  async updateSortOrder(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return false;

    this.db.transaction(async function() {
      const updateStmt = this.db.prepare('UPDATE offers SET sort_order = ? WHERE id = ?');
      for (let index = 0; index < (ids || []).length; index++) {
        const id = ids[index];
        await updateStmt.run(index + 1, id);
      }
    })();

    return true;
  }

  /**
   * Retrieve dropdown options (departments, categories, products) for admin form
   * @returns {{ departments: Array, categories: Array, products: Array }}
   */
  async listFormOptions() {
    const departments = await this.db.prepare('SELECT id, name_ar FROM departments ORDER BY sort_order, id').all();
    const categories = await this.db.prepare('SELECT id, name_ar FROM categories ORDER BY sort_order, id').all();
    const products = await this.db.prepare('SELECT id, title FROM products ORDER BY id DESC LIMIT 300').all();
    return { departments, categories, products };
  }

  /**
   * Get aggregate offer stats
   * @returns {Object}
   */
  async getStats() {
    const total = (await this.db.prepare('SELECT COUNT(*) as count FROM offers').get())?.count || 0;
    const active = (await this.db.prepare('SELECT COUNT(*) as count FROM offers WHERE is_active = 1').get())?.count || 0;
    const hidden = (await this.db.prepare("SELECT COUNT(*) as count FROM offers WHERE status = 'hidden' OR is_active = 0").get())?.count || 0;
    return { total, active, hidden };
  }
}

module.exports = PostgresOfferRepo;
