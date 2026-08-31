/**
 * SQLite AI Analytics Events Repository
 * Handles ai_analytics_events table.
 */
class AiAnalyticsRepo {
  constructor(db) {
    this.db = db;
  }

  async logEvent(eventType, sessionId = null, metadata = null) {
    return await this.db.prepare(`
      INSERT INTO ai_analytics_events (event_type, session_id, metadata, created_at)
      VALUES (?, ?, ?, NOW())
    `).run(
      eventType,
      sessionId,
      metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null
    );
  }

  async getEventStats(period = '30d') {
    return await this.db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM ai_analytics_events
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY event_type
    `).all();
  }
}

module.exports = AiAnalyticsRepo;
