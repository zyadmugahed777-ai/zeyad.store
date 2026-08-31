/**
 * SQLite Media Repository
 * 
 * Encapsulates all database queries for media and media_folders tables.
 * Methods are synchronous (better-sqlite3).
 * No business logic / file processing — only data access.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresMediaRepo extends PostgresBaseRepository {
  /**
   * Find media records with optional filters.
   * @param {object} [filters={}]
   * @param {string} [filters.folder]
   * @param {string} [filters.search]
   * @param {string} [filters.type]
   * @param {number} [filters.limit]
   * @param {number} [filters.offset]
   * @returns {Array}
   */
  async findAll(filters = {}) {
    const where = [];
    const params = [];

    if (filters.folder && filters.folder !== 'all') {
      where.push('folder = ?');
      params.push(filters.folder);
    }

    if (filters.search) {
      where.push('(original_name ILIKE ? OR filename ILIKE ? OR title ILIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.type) {
      where.push('mime_type ILIKE ?');
      params.push(`${filters.type}/%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let sql = `SELECT * FROM media ${whereSql} ORDER BY created_at DESC, id DESC`;

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
   * Count media items matching filters.
   * @param {object} [filters={}]
   * @returns {number}
   */
  async count(filters = {}) {
    const where = [];
    const params = [];

    if (filters.folder && filters.folder !== 'all') {
      where.push('folder = ?');
      params.push(filters.folder);
    }

    if (filters.search) {
      where.push('(original_name ILIKE ? OR filename ILIKE ? OR title ILIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.type) {
      where.push('mime_type ILIKE ?');
      params.push(`${filters.type}/%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT COUNT(*) as count FROM media ${whereSql}`;
    return (await this.db.prepare(sql).get(...params)).count;
  }

  /**
   * Find a media item by ID.
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM media WHERE id = ?').get(id);
  }

  /**
   * Get folder summary list with item counts.
   * @returns {Array<{folder: string, count: number}>}
   */
  async getFolders() {
    return await this.db.prepare('SELECT folder, COUNT(*) as count FROM media GROUP BY folder ORDER BY folder').all();
  }

  /**
   * Create a media record.
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async create(data) {
    return await this.db.prepare(`
      INSERT INTO media (filename, original_name, mime_type, size, path, folder, title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.filename,
      data.original_name,
      data.mime_type,
      data.size,
      data.path,
      data.folder || 'general',
      data.title || data.original_name
    );
  }

  /**
   * Update media metadata.
   * @param {number|string} id
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async update(id, data) {
    return await this.db.prepare(`
      UPDATE media 
      SET title = @title, alt_text = @alt_text, description = @description,
          folder = @folder, updated_at = NOW() 
      WHERE id = @id
    `).run({
      id,
      title: (data.title || '').trim(),
      alt_text: (data.alt_text || '').trim(),
      description: (data.description || '').trim(),
      folder: (data.folder || 'general').trim()
    });
  }

  /**
   * Replace media file data.
   * @param {number|string} id
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async replace(id, data) {
    return await this.db.prepare(`
      UPDATE media 
      SET filename = ?, original_name = ?, mime_type = ?, size = ?, path = ?, updated_at = NOW()
      WHERE id = ?
    `).run(
      data.filename,
      data.original_name,
      data.mime_type,
      data.size,
      data.path,
      id
    );
  }

  /**
   * Delete a media item by ID.
   * @param {number|string} id
   * @returns {import('better-sqlite3').RunResult}
   */
  async delete(id) {
    return await this.db.prepare('DELETE FROM media WHERE id = ?').run(id);
  }
}

module.exports = PostgresMediaRepo;
