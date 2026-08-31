/**
 * SQLite Newsletter Repository
 * 
 * Encapsulates all database queries for the newsletter table.
 * Methods are synchronous (better-sqlite3).
 * No business logic — only data access.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresNewsletterRepo extends PostgresBaseRepository {
  /**
   * Subscribe an email address to the newsletter.
   * Silently ignores duplicate email subscriptions without throwing.
   * @param {string} email
   * @returns {boolean} true if inserted or already subscribed
   */
  async subscribe(email) {
    try {
      await this.db.prepare('INSERT INTO newsletter (email) VALUES (?)').run(email);
      return true;
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE constraint failed')) {
        return true;
      }
      throw e;
    }
  }

  /**
   * Unsubscribe an email from the newsletter.
   * @param {string} email
   * @returns {import('better-sqlite3').RunResult}
   */
  async unsubscribe(email) {
    return await this.db.prepare('DELETE FROM newsletter WHERE email = ?').run(email);
  }

  /**
   * Check if an email is subscribed.
   * @param {string} email
   * @returns {object|undefined}
   */
  async findByEmail(email) {
    return await this.db.prepare('SELECT * FROM newsletter WHERE email = ?').get(email);
  }

  /**
   * Find all newsletter subscriptions.
   * @returns {Array}
   */
  async findAll() {
    return await this.db.prepare('SELECT * FROM newsletter ORDER BY created_at DESC').all();
  }

  /**
   * Count total subscriptions.
   * @returns {number}
   */
  async count() {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM newsletter').get()).count;
  }
}

module.exports = PostgresNewsletterRepo;
