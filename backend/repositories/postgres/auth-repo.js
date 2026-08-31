/**
 * SQLite Auth & Admin Users Repository
 * 
 * Encapsulates all database queries for admin_users, roles, role_permissions, and audit_logs.
 * Methods are synchronous (better-sqlite3).
 * No business logic / auth tokens / bcrypt hashing — only data access.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresAuthRepo extends PostgresBaseRepository {
  /**
   * Find an active admin user with joined role name by username.
   * @param {string} username
   * @returns {object|undefined}
   */
  async findAdminByUsername(username) {
    return await this.db.prepare(`
      SELECT u.*, r.name as role_name 
      FROM admin_users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.username = ? AND u.is_active = 1
    `).get(username);
  }

  /**
   * Find an admin user by ID.
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findAdminById(id) {
    return await this.db.prepare(
      'SELECT id, username, full_name, email, role, role_id, is_active FROM admin_users WHERE id = ?'
    ).get(id);
  }

  /**
   * Find full admin user record by ID.
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findAdminFullById(id) {
    return await this.db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  }

  /**
   * Find all admin users with optional filters and pagination.
   * @param {object} [filters={}]
   * @param {string} [filters.search]
   * @param {number|string} [filters.role_id]
   * @param {number} [filters.limit]
   * @param {number} [filters.offset]
   * @returns {Array}
   */
  async findAllAdminUsers(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.search) {
      where += ' AND (u.username ILIKE ? OR u.full_name ILIKE ? OR u.email ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.role_id) {
      where += ' AND u.role_id = ?';
      params.push(Number(filters.role_id));
    }

    let sql = `
      SELECT u.id, u.username, u.full_name, u.email, u.role, u.role_id, u.is_active, u.last_login, u.created_at, r.name as role_name
      FROM admin_users u
      LEFT JOIN roles r ON r.id = u.role_id
      ${where}
      ORDER BY u.id DESC
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
   * Count admin users matching filters.
   * @param {object} [filters={}]
   * @returns {number}
   */
  async countAdminUsers(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.search) {
      where += ' AND (u.username ILIKE ? OR u.full_name ILIKE ? OR u.email ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.role_id) {
      where += ' AND u.role_id = ?';
      params.push(Number(filters.role_id));
    }

    const sql = `SELECT COUNT(*) as count FROM admin_users u ${where}`;
    return (await this.db.prepare(sql).get(...params)).count;
  }

  /**
   * Total count of all admin users.
   * @returns {number}
   */
  async countAdminUsersTotal() {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM admin_users').get()).count;
  }

  /**
   * Update admin user last login timestamp.
   * @param {number|string} id
   * @returns {import('better-sqlite3').RunResult}
   */
  async updateLastLogin(id) {
    return await this.db.prepare("UPDATE admin_users SET last_login = NOW() WHERE id = ?").run(id);
  }

  /**
   * Create an admin user.
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async createAdminUser(data) {
    return await this.db.prepare(`
      INSERT INTO admin_users (username, password_hash, full_name, email, role, role_id, is_active)
      VALUES (@username, @password_hash, @full_name, @email, @role, @role_id, @is_active)
    `).run({
      username: data.username,
      password_hash: data.password_hash,
      full_name: data.full_name || '',
      email: data.email || null,
      role: data.role || 'admin',
      role_id: data.role_id || 2,
      is_active: data.is_active ? 1 : 0
    });
  }

  /**
   * Update admin user details.
   * @param {number|string} id
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async updateAdminUser(id, data) {
    return await this.db.prepare(`
      UPDATE admin_users 
      SET username = @username, full_name = @full_name, email = @email,
          role = @role, role_id = @role_id, is_active = @is_active, updated_at = NOW()
      WHERE id = @id
    `).run({
      id,
      username: data.username,
      full_name: data.full_name || '',
      email: data.email || null,
      role: data.role || 'admin',
      role_id: data.role_id || 2,
      is_active: data.is_active ? 1 : 0
    });
  }

  /**
   * Update admin user password hash.
   * @param {number|string} id
   * @param {string} passwordHash
   * @returns {import('better-sqlite3').RunResult}
   */
  async updateAdminPassword(id, passwordHash) {
    return await this.db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  }

  /**
   * Delete an admin user.
   * @param {number|string} id
   * @returns {import('better-sqlite3').RunResult}
   */
  async deleteAdminUser(id) {
    return await this.db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  }

  /**
   * Find role by ID.
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findRoleById(id) {
    return await this.db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  }

  /**
   * Find all roles.
   * @returns {Array}
   */
  async findAllRoles() {
    return await this.db.prepare('SELECT * FROM roles ORDER BY id').all();
  }

  /**
   * Insert an audit log record.
   * @param {object} data
   * @returns {import('better-sqlite3').RunResult}
   */
  async logAction(data) {
    const oldVal = data.old_values !== undefined && data.old_values !== null 
      ? (typeof data.old_values === 'string' ? data.old_values : JSON.stringify(data.old_values)) 
      : null;
    const newVal = data.new_values !== undefined && data.new_values !== null 
      ? (typeof data.new_values === 'string' ? data.new_values : JSON.stringify(data.new_values)) 
      : null;
    const entityId = data.entity_id !== undefined && data.entity_id !== null ? String(data.entity_id) : null;

    return await this.db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, old_values, new_values, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.user_id || null,
      data.action,
      data.entity,
      entityId,
      oldVal,
      newVal,
      data.ip_address || null
    );
  }
}

module.exports = PostgresAuthRepo;
