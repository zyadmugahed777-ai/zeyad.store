/**
 * SQLite Admin AI Conversations & Messages Repository
 * Handles ai_conversations and ai_messages tables.
 */
class AdminAiConversationsRepo {
  constructor(db) {
    this.db = db;
  }

  async listConversations(userId, search = '', limit = 60) {
    const like = `%${String(search || '').trim()}%`;
    return await this.db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM ai_conversations
      WHERE deleted_at IS NULL AND created_by = ? AND title ILIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(userId, like, limit);
  }

  async createConversation(title, userId) {
    const result = await this.db.prepare(`
      INSERT INTO ai_conversations (title, created_by)
      VALUES (?, ?)
    `).run(title, userId || null);
    return this.getConversationById(result.lastInsertRowid);
  }

  async getConversationById(id) {
    return await this.db.prepare(`
      SELECT id, title, created_at, updated_at
      FROM ai_conversations
      WHERE id = ? AND deleted_at IS NULL
    `).get(id);
  }

  async getMessages(conversationId) {
    const rows = await this.db.prepare(`
      SELECT id, role, content, metadata, created_at
      FROM ai_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(conversationId);
    return rows.map((message) => ({
      ...message,
      metadata: message.metadata ? (typeof message.metadata === 'object' ? message.metadata : JSON.parse(message.metadata)) : null
    }));
  }

  async renameConversation(id, title, userId) {
    return await this.db.prepare(`
      UPDATE ai_conversations
      SET title = ?, updated_at = NOW()
      WHERE id = ? AND created_by = ?
    `).run(String(title || 'محادثة'), id, userId);
  }

  async deleteConversation(id, userId) {
    return await this.db.prepare(`
      UPDATE ai_conversations
      SET deleted_at = NOW()
      WHERE id = ? AND created_by = ?
    `).run(id, userId);
  }

  async clearMessages(id) {
    return await this.db.prepare('DELETE FROM ai_messages WHERE conversation_id = ?').run(id);
  }

  async addMessage(conversationId, role, content, metadata = null) {
    const result = await this.db.prepare(`
      INSERT INTO ai_messages (conversation_id, role, content, metadata)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, role, String(content || ''), metadata ? JSON.stringify(metadata) : null);
    await this.touch(conversationId);
    return result.lastInsertRowid;
  }

  async touch(conversationId) {
    return await this.db.prepare("UPDATE ai_conversations SET updated_at = NOW() WHERE id = ?").run(conversationId);
  }
}

module.exports = AdminAiConversationsRepo;
