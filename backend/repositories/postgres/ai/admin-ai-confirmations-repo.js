/**
 * SQLite Admin AI Action Confirmations Repository
 * Handles ai_action_confirmations table (high-risk write operations lifecycle).
 */
class AdminAiConfirmationsRepo {
  constructor(db) {
    this.db = db;
  }

  async createConfirmation(conversationId, userId, toolName, payload) {
    // Redact sensitive payload before saving
    let safePayload = '';
    try {
      const parsed = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
      if (parsed.apiToken) parsed.apiToken = '[REDACTED_SECRET]';
      if (parsed.password) parsed.password = '[REDACTED_SECRET]';
      safePayload = JSON.stringify(parsed);
    } catch (_) {
      safePayload = String(payload || '{}');
    }

    const res = await this.db.prepare(`
      INSERT INTO ai_action_confirmations (conversation_id, user_id, tool_name, payload)
      VALUES (?, ?, ?, ?)
    `).run(conversationId || null, userId || null, toolName, safePayload);
    return res.lastInsertRowid;
  }

  async getPendingConfirmation(confirmationId) {
    return await this.db.prepare('SELECT * FROM ai_action_confirmations WHERE id = ? AND status = ?').get(confirmationId, 'pending');
  }

  async getConfirmationById(confirmationId) {
    return await this.db.prepare('SELECT * FROM ai_action_confirmations WHERE id = ?').get(confirmationId);
  }

  async confirmAction(confirmationId) {
    return await this.db.prepare("UPDATE ai_action_confirmations SET status = 'confirmed', confirmed_at = NOW() WHERE id = ?").run(confirmationId);
  }

  async rejectConfirmation(confirmationId) {
    return await this.db.prepare("UPDATE ai_action_confirmations SET status = 'rejected' WHERE id = ?").run(confirmationId);
  }
}

module.exports = AdminAiConfirmationsRepo;
