/**
 * SQLite Settings Repository
 * 
 * Encapsulates all database queries for the settings table.
 * Methods are synchronous (better-sqlite3).
 * No business logic — only data access.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresSettingsRepo extends PostgresBaseRepository {
  /**
   * Get all settings ordered by group and key.
   * @returns {Array<{id: number, key: string, value: string, type: string, group_name: string, updated_at: string}>}
   */
  async findAll() {
    return await this.db.prepare('SELECT * FROM settings ORDER BY group_name, key').all();
  }

  /**
   * Get all settings as a key-value dictionary map.
   * @returns {Record<string, string>}
   */
  async getAllAsMap() {
    const rows = await this.db.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const row of rows) {
      map[row.key] = row.value || '';
    }
    return map;
  }

  /**
   * Get a single setting by key.
   * @param {string} key
   * @returns {object|undefined}
   */
  async findByKey(key) {
    return await this.db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
  }

  /**
   * Get multiple settings by a list of keys.
   * @param {string[]} keys
   * @returns {Array<{key: string, value: string, type?: string, group_name?: string}>}
   */
  async findByKeys(keys) {
    if (!keys || keys.length === 0) return [];
    const placeholders = keys.map(() => '?').join(',');
    return await this.db.prepare(`
      SELECT key, value, type, group_name FROM settings WHERE key IN (${placeholders})
    `).all(...keys);
  }

  /**
   * Get settings by group name.
   * @param {string} group
   * @returns {Array}
   */
  async findByGroup(group) {
    return await this.db.prepare('SELECT * FROM settings WHERE group_name = ?').all(group);
  }

  /**
   * Get settings by multiple group names.
   * @param {string[]} groups
   * @returns {Array<{key: string, value: string, type: string}>}
   */
  async findByGroups(groups) {
    if (!groups || groups.length === 0) return [];
    const placeholders = groups.map(() => '?').join(',');
    return await this.db.prepare(`
      SELECT key, value, type FROM settings WHERE group_name IN (${placeholders})
    `).all(...groups);
  }

  /**
   * Upsert a single setting synchronously.
   * @param {string} key
   * @param {string} value
   * @param {string} [type='string']
   * @param {string} [group='general']
   * @returns {import('better-sqlite3').RunResult}
   */
  async upsert(key, value, type = 'string', group = 'general') {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value, type, group_name, updated_at)
      VALUES (?, ?, ?, ?, NOW())
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        type = excluded.type,
        group_name = excluded.group_name,
        updated_at = NOW()
    `);
    return await stmt.run(key, value, type, group);
  }

  /**
   * Bulk upsert multiple settings in a single atomic synchronous transaction.
   * @param {Array<{key: string, value: string, type: string, group_name: string}>} entries
   * @returns {boolean}
   */
  async bulkUpsert(entries) {
    if (!entries || entries.length === 0) return true;

    const updateTx = this.db.transaction(async function(items) {
      const stmt = this.db.prepare(`
        INSERT INTO settings (key, value, type, group_name, updated_at)
        VALUES (?, ?, ?, ?, NOW())
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          type = excluded.type,
          group_name = excluded.group_name,
          updated_at = NOW()
      `);

      for (const item of items) {
        await stmt.run(
          item.key,
          item.value !== null && item.value !== undefined ? String(item.value) : '',
          item.type || 'string',
          item.group_name || 'general'
        );
      }
    });

    await updateTx(entries);
    return true;
  }
}

module.exports = PostgresSettingsRepo;
