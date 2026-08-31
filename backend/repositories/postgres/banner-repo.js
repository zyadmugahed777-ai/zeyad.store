/**
 * Zeyad For Business — SQLite Banner Repository
 * 
 * Database access layer for promotional banners.
 * Handles database operations only (pure persistence, no file I/O).
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresBannerRepo extends PostgresBaseRepository {
  /**
   * List banners with filtering, search, and pagination
   * @param {Object} options
   * @param {string} [options.search]
   * @param {string} [options.position]
   * @param {string} [options.status]
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @returns {{ banners: Array, totalItems: number }}
   */
  async findAll({ search = '', position = '', status = '', limit = 20, offset = 0 } = {}) {
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ' AND (title ILIKE ? OR subtitle ILIKE ? OR link ILIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (position) {
      where += ' AND position = ?';
      params.push(position);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const countRow = await this.db.prepare(`SELECT COUNT(*) as count FROM banners ${where}`).get(...params);
    const totalItems = countRow?.count || 0;

    const banners = await this.db.prepare(`
      SELECT * FROM banners
      ${where}
      ORDER BY position ASC, sort_order ASC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { banners, totalItems };
  }

  /**
   * Find active banners by placement position for public website
   * @param {string} [position='home']
   * @param {string} [nowIso]
   * @returns {Array}
   */
  async findActiveByPosition(position = 'home', nowIso = new Date().toISOString()) {
    return await this.db.prepare(`
      SELECT * FROM banners 
      WHERE is_active = 1 
      AND position = ?
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date IS NULL OR end_date >= ?)
      ORDER BY sort_order ASC
    `).all(position, nowIso, nowIso);
  }

  /**
   * Find banner by primary key ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM banners WHERE id = ?').get(id) || null;
  }

  /**
   * Create a new banner record
   * @param {Object} banner
   * @returns {Object} created record with id
   */
  async create(banner) {
    const stmt = this.db.prepare(`
      INSERT INTO banners (
        title, subtitle, body, image, desktop_image, mobile_image, button_text, link,
        position, start_date, end_date, status, is_active, sort_order
      ) VALUES (
        @title, @subtitle, @body, @image, @desktop_image, @mobile_image, @button_text, @link,
        @position, @start_date, @end_date, @status, @is_active, @sort_order
      )
    `);

    const result = await stmt.run({
      title: banner.title,
      subtitle: banner.subtitle || '',
      body: banner.body || '',
      image: banner.image || '',
      desktop_image: banner.desktop_image || banner.image || '',
      mobile_image: banner.mobile_image || '',
      button_text: banner.button_text || '',
      link: banner.link || '',
      position: banner.position || 'home',
      start_date: banner.start_date || null,
      end_date: banner.end_date || null,
      status: banner.status || 'draft',
      is_active: banner.is_active !== undefined ? banner.is_active : (banner.status === 'active' ? 1 : 0),
      sort_order: Number(banner.sort_order || 0)
    });

    return {
      id: Number(result.lastInsertRowid),
      ...banner
    };
  }

  /**
   * Update an existing banner record
   * @param {number|string} id
   * @param {Object} banner
   * @returns {boolean} true if updated
   */
  async update(id, banner) {
    const stmt = this.db.prepare(`
      UPDATE banners SET
        title = @title, subtitle = @subtitle, body = @body, image = @image,
        desktop_image = @desktop_image, mobile_image = @mobile_image,
        button_text = @button_text, link = @link, position = @position,
        start_date = @start_date, end_date = @end_date,
        status = @status, is_active = @is_active, sort_order = @sort_order
      WHERE id = @id
    `);

    const result = await stmt.run({
      id,
      title: banner.title,
      subtitle: banner.subtitle || '',
      body: banner.body || '',
      image: banner.image || '',
      desktop_image: banner.desktop_image || banner.image || '',
      mobile_image: banner.mobile_image || '',
      button_text: banner.button_text || '',
      link: banner.link || '',
      position: banner.position || 'home',
      start_date: banner.start_date || null,
      end_date: banner.end_date || null,
      status: banner.status || 'draft',
      is_active: banner.is_active !== undefined ? banner.is_active : (banner.status === 'active' ? 1 : 0),
      sort_order: Number(banner.sort_order || 0)
    });

    return result.changes > 0;
  }

  /**
   * Delete a banner record by ID
   * @param {number|string} id
   * @returns {boolean} true if deleted
   */
  async delete(id) {
    const result = await this.db.prepare('DELETE FROM banners WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Execute bulk action on an array of banner IDs atomically
   * @param {string} action - 'delete' | 'activate' | 'hide'
   * @param {Array<number|string>} ids
   * @returns {number} number of affected records
   */
  async bulkAction(action, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');

    return this.db.transaction(async function() {
      if (action === 'delete') {
        const res = await this.db.prepare(`DELETE FROM banners WHERE id IN (${placeholders})`).run(...ids);
        return res.changes;
      } else if (action === 'activate') {
        const res = await this.db.prepare(`UPDATE banners SET status = 'active', is_active = 1 WHERE id IN (${placeholders})`).run(...ids);
        return res.changes;
      } else if (action === 'hide') {
        const res = await this.db.prepare(`UPDATE banners SET status = 'hidden', is_active = 0 WHERE id IN (${placeholders})`).run(...ids);
        return res.changes;
      }
      return 0;
    })();
  }

  /**
   * Update sort order for multiple banners atomically
   * @param {Array<number|string>} ids - Ordered list of banner IDs
   * @returns {boolean} true if successful
   */
  async updateSortOrder(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return false;

    this.db.transaction(async function() {
      const updateStmt = this.db.prepare('UPDATE banners SET sort_order = ? WHERE id = ?');
      for (let index = 0; index < (ids || []).length; index++) {
        const id = ids[index];
        await updateStmt.run(index + 1, id);
      }
    })();

    return true;
  }

  /**
   * Get aggregate banner stats
   * @returns {Object}
   */
  async getStats() {
    const total = (await this.db.prepare('SELECT COUNT(*) as count FROM banners').get())?.count || 0;
    const active = (await this.db.prepare('SELECT COUNT(*) as count FROM banners WHERE is_active = 1').get())?.count || 0;
    const hidden = (await this.db.prepare("SELECT COUNT(*) as count FROM banners WHERE status = 'hidden' OR is_active = 0").get())?.count || 0;
    return { total, active, hidden };
  }
}

module.exports = PostgresBannerRepo;
