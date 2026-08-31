/**
 * SQLite Admin AI Provider & System Instructions Repository
 * Handles ai_provider_settings and ai_system_instructions tables.
 */
class AdminAiProviderRepo {
  constructor(db) {
    this.db = db;
  }

  async getProviderSettings() {
    let row = await this.db.prepare('SELECT * FROM ai_provider_settings WHERE id = 1').get();
    if (!row) {
      await this.db.prepare('INSERT INTO ai_provider_settings (id) VALUES (1)').run();
      row = await this.db.prepare('SELECT * FROM ai_provider_settings WHERE id = 1').get();
    }
    return row;
  }

  async updateProviderSettings(data) {
    return await this.db.prepare(`
      UPDATE ai_provider_settings SET
        provider = ?,
        model = ?,
        api_base_url = ?,
        encrypted_api_token = ?,
        token_hint = ?,
        region = ?,
        temperature = ?,
        max_tokens = ?,
        request_timeout = ?,
        enable_streaming = ?,
        enable_tool_calling = ?,
        enable_vision = ?,
        system_prompt_override = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = 1
    `).run(
      data.provider,
      data.model,
      data.api_base_url,
      data.encrypted_api_token,
      data.token_hint,
      data.region,
      data.temperature,
      data.max_tokens,
      data.request_timeout,
      data.enable_streaming,
      data.enable_tool_calling,
      data.enable_vision,
      data.system_prompt_override,
      data.updated_by
    );
  }

  async getActiveSystemInstructions() {
    return await this.db.prepare(`
      SELECT * FROM ai_system_instructions
      WHERE is_active = 1
      ORDER BY version DESC
      LIMIT 1
    `).get();
  }

  async getInstructionHistory(limit = 20) {
    return await this.db.prepare(`
      SELECT id, version, body, created_at
      FROM ai_system_instructions
      ORDER BY version DESC
      LIMIT ?
    `).all(limit);
  }

  async getMaxInstructionVersion() {
    return (await this.db.prepare('SELECT MAX(version) as version FROM ai_system_instructions').get())?.version || 0;
  }

  async deactivateAllInstructions() {
    return await this.db.prepare('UPDATE ai_system_instructions SET is_active = 0').run();
  }

  async insertSystemInstruction(body, version, updatedBy) {
    return await this.db.prepare(`
      INSERT INTO ai_system_instructions (body, version, is_active, updated_by)
      VALUES (?, ?, TRUE, ?)
    `).run(body, version, updatedBy || null);
  }
}

module.exports = AdminAiProviderRepo;
