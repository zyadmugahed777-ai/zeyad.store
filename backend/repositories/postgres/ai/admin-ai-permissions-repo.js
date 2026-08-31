/**
 * SQLite Admin AI Permissions Repository
 * Handles ai_permissions table.
 */
class AdminAiPermissionsRepo {
  constructor(db) {
    this.db = db;
  }

  async getPermissions() {
    return await this.db.prepare(`
      SELECT permission_key, label_ar, group_name, operation_type, is_enabled, updated_at
      FROM ai_permissions
      ORDER BY group_name, operation_type, permission_key
    `).all();
  }

  async hasPermission(permissionKey) {
    const row = await this.db.prepare('SELECT is_enabled FROM ai_permissions WHERE permission_key = ?').get(permissionKey);
    return Boolean(row && row.is_enabled);
  }

  async updatePermission(permissionKey, isEnabled) {
    return await this.db.prepare(`
      UPDATE ai_permissions
      SET is_enabled = ?, updated_at = NOW()
      WHERE permission_key = ?
    `).run(isEnabled ? 1 : 0, permissionKey);
  }
}

module.exports = AdminAiPermissionsRepo;
