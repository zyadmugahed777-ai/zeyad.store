/**
 * SQLite AI Audit & Activity Repository
 * Handles ai_action_audits and ai_activity_logs tables.
 */
class AiAuditRepo {
  constructor(db) {
    this.db = db;
  }

  async logActionAudit({
    sessionId = null,
    userId = null,
    action,
    targetType = null,
    targetId = null,
    payload = {},
    result = 'success',
    provider = null,
    model = null,
    ipAddress = null
  }) {
    // Redact sensitive secrets from payload
    let safePayload = '';
    try {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
      if (parsed.apiToken) parsed.apiToken = '[REDACTED_SECRET]';
      if (parsed.password) parsed.password = '[REDACTED_SECRET]';
      safePayload = JSON.stringify(parsed);
    } catch (_) {
      safePayload = String(payload || '{}');
    }

    return await this.db.prepare(`
      INSERT INTO ai_action_audits (
        session_id, user_id, action, target_type, target_id,
        payload, result, provider, model, ip_address, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `).run(
      sessionId,
      userId,
      String(action || 'unknown'),
      targetType,
      targetId ? String(targetId) : null,
      safePayload,
      String(result || 'success'),
      provider,
      model,
      ipAddress
    );
  }

  async getRecentAudits(limit = 100, action = null) {
    let sql = 'SELECT * FROM ai_action_audits';
    const params = [];
    if (action) {
      sql += ' WHERE action = ?';
      params.push(action);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);
    return await this.db.prepare(sql).all(...params);
  }

  async logActivity({
    userId = null,
    action,
    toolName = null,
    affectedType = null,
    affectedId = null,
    oldValue = null,
    newValue = null,
    result = 'success',
    confirmationStatus = 'not_required'
  }) {
    return await this.db.prepare(`
      INSERT INTO ai_activity_logs (
        user_id, action, tool_name, affected_type, affected_id,
        old_value, new_value, result, confirmation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      action,
      toolName,
      affectedType,
      affectedId ? String(affectedId) : null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      result,
      confirmationStatus
    );
  }

  async getActivity(limit = 100) {
    return await this.db.prepare(`
      SELECT l.*, u.full_name as user_name
      FROM ai_activity_logs l
      LEFT JOIN admin_users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(Number(limit) || 100);
  }

  async countActionAudits(action = null, result = null) {
    let sql = 'SELECT COUNT(*) as count FROM ai_action_audits WHERE 1=1';
    const params = [];
    if (action) {
      sql += ' AND action = ?';
      params.push(action);
    }
    if (result) {
      sql += ' AND result = ?';
      params.push(result);
    }
    return (await this.db.prepare(sql).get(...params))?.count || 0;
  }

  async getTopActionTargets(action = 'add_to_cart', limit = 5) {
    return await this.db.prepare(`
      SELECT target_id as product_id, COUNT(*) as recommendations_count
      FROM ai_action_audits
      WHERE action = ?
      GROUP BY target_id
      ORDER BY recommendations_count DESC
      LIMIT ?
    `).all(action, Number(limit) || 5);
  }
}

module.exports = AiAuditRepo;
