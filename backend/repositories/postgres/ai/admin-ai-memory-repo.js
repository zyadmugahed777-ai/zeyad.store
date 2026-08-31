/**
 * SQLite Admin AI Memory Repository
 * Handles ai_memory table (store knowledge and business rules).
 */
class AdminAiMemoryRepo {
  constructor(db) {
    this.db = db;
  }

  async getKnowledge() {
    return await this.db.prepare(`
      SELECT id, title, content, updated_at
      FROM ai_memory
      WHERE memory_type = 'store_knowledge' AND is_active = 1
      ORDER BY updated_at DESC, id DESC
    `).all();
  }

  async deactivateKnowledge() {
    return await this.db.prepare("UPDATE ai_memory SET is_active = 0, updated_at = NOW() WHERE memory_type = 'store_knowledge'").run();
  }

  async insertKnowledge(title, content, updatedBy) {
    return await this.db.prepare(`
      INSERT INTO ai_memory (memory_type, title, content, updated_by)
      VALUES ('store_knowledge', ?, ?, ?)
    `).run(title, content, updatedBy || null);
  }

  async getMemory(limit = 100) {
    return await this.db.prepare(`
      SELECT id, memory_type, title, content, updated_at
      FROM ai_memory
      WHERE memory_type != 'store_knowledge' AND is_active = 1
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `).all(limit);
  }

  async insertMemoryItem(memoryType, title, content, updatedBy) {
    return await this.db.prepare(`
      INSERT INTO ai_memory (memory_type, title, content, updated_by)
      VALUES (?, ?, ?, ?)
    `).run(memoryType || 'business_rule', title || '', content || '', updatedBy || null);
  }

  async updateMemoryItem(id, memoryType, title, content, updatedBy) {
    return await this.db.prepare(`
      UPDATE ai_memory SET memory_type = ?, title = ?, content = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ? AND memory_type != 'store_knowledge'
    `).run(memoryType || 'business_rule', title || '', content || '', updatedBy || null, id);
  }

  async deleteMemory(id) {
    return await this.db.prepare("UPDATE ai_memory SET is_active = 0, updated_at = NOW() WHERE id = ?").run(id);
  }

  async clearMemory() {
    return await this.db.prepare("UPDATE ai_memory SET is_active = 0, updated_at = NOW()").run();
  }
}

module.exports = AdminAiMemoryRepo;
