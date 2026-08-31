/**
 * SQLite Session Repository
 * 
 * Encapsulates all database queries for sessions and guest_sessions tables.
 * Used by SessionStore and guest session tracking.
 * Pure data access layer — 0 Express dependencies.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresSessionRepo extends PostgresBaseRepository {
  /**
   * Get active unexpired session by sid
   * @param {string} sid
   * @returns {Object|null}
   */
  async get(sid) {
    if (!sid) return null;
    const row = await this.db.prepare(`
      SELECT sess FROM sessions WHERE sid = ? AND expired > NOW()
    `).get(String(sid));

    if (!row || !row.sess) return null;
    try {
      return typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess;
    } catch (_) {
      return null;
    }
  }

  /**
   * Insert or update a session with TTL
   * @param {string} sid
   * @param {Object} sessData
   * @param {number} maxAgeSeconds
   * @returns {boolean}
   */
  async set(sid, sessData, maxAgeSeconds = 86400) {
    if (!sid) return false;
    const modifier = `+${Math.max(1, Number(maxAgeSeconds) || 86400)} seconds`;
    const json = typeof sessData === 'string' ? sessData : JSON.stringify(sessData);

    const stmt = this.db.prepare(`
      INSERT INTO sessions (sid, sess, expired)
      VALUES (?, ?, datetime('now', ?))
      ON CONFLICT(sid) DO UPDATE SET
        sess = excluded.sess,
        expired = excluded.expired
    `);

    await stmt.run(String(sid), json, modifier);
    return true;
  }

  /**
   * Destroy a session by sid
   * @param {string} sid
   * @returns {boolean}
   */
  async destroy(sid) {
    if (!sid) return false;
    await this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(String(sid));
    return true;
  }

  /**
   * Touch (extend expiration of) an existing session
   * @param {string} sid
   * @param {number} maxAgeSeconds
   * @returns {boolean}
   */
  async touch(sid, maxAgeSeconds = 86400) {
    if (!sid) return false;
    const modifier = `+${Math.max(1, Number(maxAgeSeconds) || 86400)} seconds`;
    await this.db.prepare(`
      UPDATE sessions SET expired = datetime('now', ?) WHERE sid = ?
    `).run(modifier, String(sid));
    return true;
  }

  /**
   * Clear all sessions
   * @returns {boolean}
   */
  async clear() {
    await this.db.prepare('DELETE FROM sessions').run();
    return true;
  }

  /**
   * Get count of active unexpired sessions
   * @returns {number}
   */
  async length() {
    const row = await this.db.prepare(`
      SELECT COUNT(*) as count FROM sessions WHERE expired > NOW()
    `).get();
    return row ? row.count : 0;
  }

  /**
   * Delete all expired sessions (Garbage Collection)
   * @returns {number} number of deleted sessions
   */
  async cleanupExpired() {
    const res = await this.db.prepare(`
      DELETE FROM sessions WHERE expired::timestamptz <= NOW()
    `).run();
    return res.changes || 0;
  }

  /**
   * Ensure a guest session exists in guest_sessions table
   * @param {string} guestId
   * @returns {boolean}
   */
  async ensureGuestSession(guestId) {
    if (!guestId) return false;
    await this.db.prepare(`
      INSERT INTO guest_sessions (guest_id, created_at, last_active_at)
      VALUES (?, NOW(), NOW())
      ON CONFLICT(guest_id) DO UPDATE SET
        last_active_at = NOW()
    `).run(String(guestId));
    return true;
  }

  /**
   * Get guest session details
   * @param {string} guestId
   * @returns {Object|null}
   */
  async getGuestSession(guestId) {
    if (!guestId) return null;
    return await this.db.prepare('SELECT * FROM guest_sessions WHERE guest_id = ?').get(String(guestId)) || null;
  }

  /**
   * Touch guest session last_active_at
   * @param {string} guestId
   * @returns {boolean}
   */
  async touchGuestSession(guestId) {
    if (!guestId) return false;
    await this.db.prepare(`
      UPDATE guest_sessions SET last_active_at = NOW() WHERE guest_id = ?
    `).run(String(guestId));
    return true;
  }

  /**
   * Delete guest session
   * @param {string} guestId
   * @returns {boolean}
   */
  async deleteGuestSession(guestId) {
    if (!guestId) return false;
    await this.db.prepare('DELETE FROM guest_sessions WHERE guest_id = ?').run(String(guestId));
    return true;
  }
}

module.exports = PostgresSessionRepo;
