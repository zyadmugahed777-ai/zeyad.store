/**
 * SQLite Najm Customer AI Settings & Instructions Repository
 * Handles ai_najm_settings and ai_najm_instructions tables.
 */
class NajmSettingsRepo {
  constructor(db) {
    this.db = db;
  }

  async getSettings() {
    let row = await this.db.prepare('SELECT * FROM ai_najm_settings WHERE id = 1').get();
    if (!row) {
      await this.db.prepare('INSERT INTO ai_najm_settings (id) VALUES (1)').run();
      row = await this.db.prepare('SELECT * FROM ai_najm_settings WHERE id = 1').get();
    }
    return row;
  }

  async saveSettings(data) {
    return await this.db.prepare(`
      UPDATE ai_najm_settings SET
        provider = ?,
        model = ?,
        api_base_url = ?,
        encrypted_api_token = ?,
        token_hint = ?,
        temperature = ?,
        max_tokens = ?,
        request_timeout = ?,
        enable_vision = ?,
        enable_tools = ?,
        is_active = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = 1
    `).run(
      data.provider,
      data.model,
      data.api_base_url,
      data.encrypted_api_token,
      data.token_hint,
      data.temperature,
      data.max_tokens,
      data.request_timeout,
      data.enable_vision,
      data.enable_tools,
      data.is_active,
      data.updated_by
    );
  }

  async getActiveInstructions() {
    return await this.db.prepare(`
      SELECT * FROM ai_najm_instructions
      WHERE is_active = 1
      ORDER BY version DESC
      LIMIT 1
    `).get();
  }

  async getMaxInstructionVersion() {
    return (await this.db.prepare('SELECT MAX(version) as version FROM ai_najm_instructions').get())?.version || 0;
  }

  async deactivateAllInstructions() {
    return await this.db.prepare('UPDATE ai_najm_instructions SET is_active = 0').run();
  }

  async insertInstructions(sections, fullPrompt, version, adminId) {
    return await this.db.prepare(`
      INSERT INTO ai_najm_instructions (
        agent_identity, core_instructions, tone_and_style, sales_policy,
        pricing_policy, orders_and_reservation_policy, human_handoff_policy,
        tool_rules, vision_rules, full_prompt, version, is_active, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
    `).run(
      sections.agent_identity,
      sections.core_instructions,
      sections.tone_and_style,
      sections.sales_policy,
      sections.pricing_policy,
      sections.orders_and_reservation_policy,
      sections.human_handoff_policy,
      sections.tool_rules,
      sections.vision_rules,
      fullPrompt,
      version,
      adminId || null
    );
  }
}

module.exports = NajmSettingsRepo;
