/**
 * SQLite Notification Repository
 * Encapsulates all database queries for notifications table.
 * Methods are synchronous (better-sqlite3). No business logic.
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresNotificationRepo extends PostgresBaseRepository {
  /**
   * Find notification by ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) || null;
  }

  /**
   * Find all notifications matching filters with pagination
   * @param {Object} filters
   * @param {number} limit
   * @param {number} offset
   * @returns {Array<Object>}
   */
  async findAll(filters = {}, limit = 20, offset = 0) {
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (title ILIKE ? OR message ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.read !== undefined && filters.read !== '') {
      sql += ' AND is_read = ?';
      params.push(filters.read === '1' || filters.read === 1 ? 1 : 0);
    }

    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.entityType) {
      sql += ' AND entity_type = ?';
      params.push(filters.entityType);
    }

    if (filters.since) {
      sql += ' AND created_at > ?';
      params.push(filters.since);
    }

    // Default admin order: unread first, then by created_at desc
    if (filters.adminOrder) {
      sql += ' ORDER BY is_read ASC, created_at DESC';
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await this.db.prepare(sql).all(...params);
  }

  /**
   * Count notifications matching filters
   * @param {Object} filters
   * @returns {number}
   */
  async count(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM notifications WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (title ILIKE ? OR message ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.read !== undefined && filters.read !== '') {
      sql += ' AND is_read = ?';
      params.push(filters.read === '1' || filters.read === 1 ? 1 : 0);
    }

    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.entityType) {
      sql += ' AND entity_type = ?';
      params.push(filters.entityType);
    }

    return (await this.db.prepare(sql).get(...params))?.count || 0;
  }

  /**
   * Get unread notification count
   * @returns {number}
   */
  async getUnreadCount() {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get())?.count || 0;
  }

  /**
   * Get recent notifications (for polling/badges)
   * @param {number} limit
   * @param {string|null} since
   * @returns {Array<Object>}
   */
  async getRecent(limit = 10, since = null) {
    const limitNum = Math.min(Math.max(Number(limit) || 10, 1), 50);
    if (since) {
      return await this.db.prepare(`
        SELECT * FROM notifications 
        WHERE created_at > ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `).all(since, limitNum);
    }
    return await this.db.prepare(`
      SELECT * FROM notifications 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(limitNum);
  }

  /**
   * Create a new notification
   * @param {Object} data
   * @returns {number} Inserted ID
   */
  async create(data) {
    const stmt = this.db.prepare(`
      INSERT INTO notifications (
        type, entity_type, entity_id, reference_id, title, message, action_url, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `);

    const result = await stmt.run(
      data.type || 'system',
      data.entity_type || null,
      data.entity_id ? String(data.entity_id) : null,
      data.reference_id ? Number(data.reference_id) : (data.entity_id && !isNaN(Number(data.entity_id)) ? Number(data.entity_id) : null),
      data.title,
      data.message || '',
      data.action_url || null,
      data.is_read ? 1 : 0
    );

    return result.lastInsertRowid;
  }

  /**
   * Mark single notification as read
   * @param {number|string} id
   * @returns {boolean}
   */
  async markAsRead(id) {
    const result = await this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Mark all unread notifications as read
   * @returns {number} Changes count
   */
  async markAllAsRead() {
    const result = await this.db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();
    return result.changes;
  }

  /**
   * Mark multiple notifications as read
   * @param {Array<number|string>} ids
   * @returns {number} Changes count
   */
  async markMultipleAsRead(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db.prepare(`UPDATE notifications SET is_read = 1 WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  }

  /**
   * Mark multiple notifications as unread
   * @param {Array<number|string>} ids
   * @returns {number} Changes count
   */
  async markMultipleAsUnread(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db.prepare(`UPDATE notifications SET is_read = 0 WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  }

  /**
   * Delete single notification by ID
   * @param {number|string} id
   * @returns {boolean}
   */
  async delete(id) {
    const result = await this.db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Delete multiple notifications by ID
   * @param {Array<number|string>} ids
   * @returns {number} Changes count
   */
  async deleteMultiple(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db.prepare(`DELETE FROM notifications WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  }
}

module.exports = PostgresNotificationRepo;
