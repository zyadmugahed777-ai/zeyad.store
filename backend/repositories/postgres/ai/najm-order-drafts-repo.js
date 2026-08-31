/**
 * SQLite Najm Conversational Order Drafts Repository
 * Handles ai_order_drafts table (temporary conversational checkout snapshots).
 */
class NajmOrderDraftsRepo {
  constructor(db) {
    this.db = db;
  }

  async createDraft({
    draftToken,
    idempotencyKey,
    sessionId,
    customerPayload,
    itemsPayload,
    subtotal,
    shippingFee = 0,
    total,
    expiresAt
  }) {
    const res = await this.db.prepare(`
      INSERT INTO ai_order_drafts (
        draft_token, idempotency_key, session_id,
        customer_payload, items_payload, subtotal,
        shipping_fee, total, is_confirmed, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?, NOW())
    `).run(
      draftToken,
      idempotencyKey,
      sessionId,
      typeof customerPayload === 'string' ? customerPayload : JSON.stringify(customerPayload || {}),
      typeof itemsPayload === 'string' ? itemsPayload : JSON.stringify(itemsPayload || []),
      subtotal,
      shippingFee,
      total,
      expiresAt
    );
    return res.lastInsertRowid;
  }

  async getDraftByToken(draftToken) {
    return await this.db.prepare('SELECT * FROM ai_order_drafts WHERE draft_token = ?').get(draftToken);
  }

  /**
   * Looks up a draft eligible for confirmation: unconfirmed, not expired,
   * and (when sessionId is provided) owned by that session. draft_token is
   * only a 32-bit random value, so without the expiry and ownership checks
   * a brute-forced or leaked token could be confirmed by anyone, at any
   * time, regardless of who actually built the cart it represents.
   * @param {string} draftToken
   * @param {string|null} [sessionId] Pass the confirming request's own
   *   session/guest id to also enforce ownership. Omit only for internal/
   *   trusted callers that intentionally skip the ownership check.
   */
  async getUnconfirmedDraftByToken(draftToken, sessionId = null) {
    if (sessionId) {
      return await this.db.prepare(
        'SELECT * FROM ai_order_drafts WHERE draft_token = ? AND is_confirmed = 0 AND expires_at > NOW() AND session_id = ?'
      ).get(draftToken, sessionId);
    }
    return await this.db.prepare(
      'SELECT * FROM ai_order_drafts WHERE draft_token = ? AND is_confirmed = 0 AND expires_at > NOW()'
    ).get(draftToken);
  }

  /**
   * Atomically marks a draft confirmed, but only if it is still
   * unconfirmed -- the conditional UPDATE is the actual idempotency
   * guard against two concurrent confirm requests for the same token
   * both succeeding (a plain SELECT-then-UPDATE has a race window a
   * single atomic statement does not).
   * @returns {boolean} true if this call performed the confirmation
   */
  async confirmDraft(draftId) {
    const result = await this.db.prepare(
      'UPDATE ai_order_drafts SET is_confirmed = 1 WHERE id = ? AND is_confirmed = 0'
    ).run(draftId);
    return result.changes > 0;
  }
}

module.exports = NajmOrderDraftsRepo;
