/**
 * SQLite Najm Customer Conversations & Messages Repository
 * Handles ai_customer_conversations and ai_customer_messages tables.
 */
class NajmConversationsRepo {
  constructor(db) {
    this.db = db;
  }

  async getOrCreateConversation(sessionId, guestId = null, userId = null) {
    let conv = await this.db.prepare('SELECT * FROM ai_customer_conversations WHERE session_id = ?').get(sessionId);
    if (!conv) {
      const res = await this.db.prepare(`
        INSERT INTO ai_customer_conversations (session_id, guest_id, user_id, title, message_count, created_at, updated_at)
        VALUES (?, ?, ?, 'محادثة جديدة مع نجم', 0, NOW(), NOW())
      `).run(sessionId, guestId || null, userId || null);
      conv = { id: res.lastInsertRowid, session_id: sessionId, guest_id: guestId, user_id: userId, title: 'محادثة جديدة مع نجم', message_count: 0 };
    }
    return conv;
  }

  async getConversationById(id) {
    return await this.db.prepare('SELECT * FROM ai_customer_conversations WHERE id = ?').get(id);
  }

  async listConversations(limit = 50) {
    return await this.db.prepare('SELECT * FROM ai_customer_conversations ORDER BY updated_at DESC LIMIT ?').all(limit);
  }

  async getMessages(conversationId, limit = 50) {
    return await this.db.prepare(`
      SELECT * FROM ai_customer_messages
      WHERE conversation_id = ?
      ORDER BY id ASC
      LIMIT ?
    `).all(conversationId, limit);
  }

  async getRecentContextMessages(conversationId, limit = 6) {
    const rows = await this.db.prepare(`
      SELECT sender as role, content FROM ai_customer_messages
      WHERE conversation_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(conversationId, limit);
    return (rows || []).slice().reverse();
  }

  async addMessage(conversationId, sender, content, imageUrl = null, payload = null) {
    const payloadStr = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null;
    return await this.db.prepare(`
      INSERT INTO ai_customer_messages (conversation_id, sender, content, image_url, payload, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `).run(conversationId, sender, String(content || ''), imageUrl || null, payloadStr);
  }

  async updateState(conversationId, title, state = {}, incrementCount = 2) {
    return await this.db.prepare(`
      UPDATE ai_customer_conversations SET
        message_count = message_count + ?,
        title = CASE WHEN message_count = 0 THEN ? ELSE title END,
        state = ?,
        updated_at = NOW()
      WHERE id = ?
    `).run(
      incrementCount,
      String(title || 'محادثة مع نجم').slice(0, 40),
      typeof state === 'string' ? state : JSON.stringify(state || {}),
      conversationId
    );
  }

  async countTotal() {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM ai_customer_conversations').get())?.count || 0;
  }

  async countTotalMessages() {
    return (await this.db.prepare('SELECT COUNT(*) as count FROM ai_customer_messages').get())?.count || 0;
  }
}

module.exports = NajmConversationsRepo;
