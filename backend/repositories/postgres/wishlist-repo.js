/**
 * Zeyad For Business — SQLite Wishlist Repository
 * 
 * Database access layer for customer & guest wishlists and wishlist items.
 * Handles database operations only (pure persistence, no business logic changes).
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresWishlistRepo extends PostgresBaseRepository {
  /**
   * Find or create an active wishlist for user or guest
   * @param {Object} params
   * @param {number|string} [params.userId]
   * @param {string} [params.guestId]
   * @returns {Object|null} wishlist record with { id, user_id, guest_id }
   */
  async findOrCreateWishlist({ userId = null, guestId = null } = {}) {
    if (userId) {
      let wl = await this.db.prepare('SELECT * FROM wishlists WHERE user_id = ?').get(userId);
      if (!wl) {
        const res = await this.db.prepare('INSERT INTO wishlists (user_id) VALUES (?)').run(userId);
        wl = { id: Number(res.lastInsertRowid), user_id: userId, guest_id: null };
      }
      return wl;
    } else if (guestId) {
      await this.db.prepare(`
        INSERT INTO guest_sessions (guest_id, created_at, last_active_at) 
        VALUES (?, NOW(), NOW()) 
        ON CONFLICT (guest_id) DO UPDATE SET last_active_at = NOW()
      `).run(String(guestId));

      let wl = await this.db.prepare('SELECT * FROM wishlists WHERE guest_id = ?').get(String(guestId));
      if (!wl) {
        const res = await this.db.prepare('INSERT INTO wishlists (guest_id) VALUES (?)').run(String(guestId));
        wl = { id: Number(res.lastInsertRowid), user_id: null, guest_id: String(guestId) };
      }
      return wl;
    }
    return null;
  }

  /**
   * Find wishlist by user ID
   * @param {number|string} userId
   * @returns {Object|null}
   */
  async findByUserId(userId) {
    return await this.db.prepare('SELECT * FROM wishlists WHERE user_id = ?').get(userId) || null;
  }

  /**
   * Find wishlist by guest ID
   * @param {string} guestId
   * @returns {Object|null}
   */
  async findByGuestId(guestId) {
    return await this.db.prepare('SELECT * FROM wishlists WHERE guest_id = ?').get(String(guestId)) || null;
  }

  /**
   * Find wishlist by primary ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    return await this.db.prepare('SELECT * FROM wishlists WHERE id = ?').get(id) || null;
  }

  /**
   * Get all items in a wishlist with product details
   * @param {number|string} wishlistId
   * @returns {Array<Object>}
   */
  async getItems(wishlistId) {
    return await this.db.prepare(`
      SELECT 
        wi.id as item_id,
        wi.wishlist_id,
        wi.product_id as raw_product_id,
        p.id as internal_id,
        p.product_id as code,
        p.title,
        p.price,
        p.old_price,
        p.brand,
        p.sku,
        p.stock_status,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM wishlist_items wi
      LEFT JOIN products p ON (p.product_id = wi.product_id OR CAST(p.id AS TEXT) = wi.product_id OR p.sku = wi.product_id)
      WHERE wi.wishlist_id = ?
    `).all(wishlistId);
  }

  /**
   * Check if a product exists in a wishlist
   * @param {number|string} wishlistId
   * @param {string} productId
   * @returns {boolean}
   */
  async hasItem(wishlistId, productId) {
    const row = await this.db.prepare('SELECT id FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?').get(wishlistId, String(productId));
    return Boolean(row);
  }

  /**
   * Add a product to a wishlist (idempotent, duplicates ignored)
   * @param {number|string} wishlistId
   * @param {string} productId
   * @returns {{ isAdded: boolean }}
   */
  async addItem(wishlistId, productId) {
    const existing = await this.hasItem(wishlistId, productId);
    if (existing) {
      return { isAdded: false };
    }
    await this.db.prepare('INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (?, ?)').run(wishlistId, String(productId));
    return { isAdded: true };
  }

  /**
   * Remove a product from a wishlist
   * @param {number|string} wishlistId
   * @param {string} productId
   * @returns {boolean} true if removed
   */
  async removeItem(wishlistId, productId) {
    const res = await this.db.prepare('DELETE FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?').run(wishlistId, String(productId));
    return res.changes > 0;
  }

  /**
   * Toggle a product in a wishlist (add if not present, remove if present)
   * @param {number|string} wishlistId
   * @param {string} productId
   * @returns {{ isAdded: boolean }}
   */
  async toggleItem(wishlistId, productId) {
    const existing = await this.db.prepare('SELECT id FROM wishlist_items WHERE wishlist_id = ? AND product_id = ?').get(wishlistId, String(productId));
    if (existing) {
      await this.db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(existing.id);
      return { isAdded: false };
    } else {
      await this.db.prepare('INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (?, ?)').run(wishlistId, String(productId));
      return { isAdded: true };
    }
  }

  /**
   * Clear all items from a wishlist
   * @param {number|string} wishlistId
   * @returns {number} number of cleared items
   */
  async clearWishlist(wishlistId) {
    const res = await this.db.prepare('DELETE FROM wishlist_items WHERE wishlist_id = ?').run(wishlistId);
    return res.changes;
  }

  /**
   * Delete an entire wishlist and its items
   * @param {number|string} wishlistId
   * @returns {boolean}
   */
  async deleteWishlist(wishlistId) {
    return this.db.transaction(async function() {
      await this.db.prepare('DELETE FROM wishlist_items WHERE wishlist_id = ?').run(wishlistId);
      const res = await this.db.prepare('DELETE FROM wishlists WHERE id = ?').run(wishlistId);
      return res.changes > 0;
    })();
  }

  /**
   * Merge guest wishlist into user wishlist atomically
   * @param {string} guestId
   * @param {number|string} userId
   * @returns {{ success: boolean, merged: number, empty?: boolean, ignored?: boolean }}
   */
  async mergeWishlists(guestId, userId) {
    if (!guestId || !userId) {
      return { success: true, ignored: true };
    }

    const guestWl = await this.findByGuestId(guestId);
    if (!guestWl) {
      return { success: true, empty: true };
    }

    const userWl = await this.findOrCreateWishlist({ userId });
    const guestItems = await this.db.prepare('SELECT product_id FROM wishlist_items WHERE wishlist_id = ?').all(guestWl.id);

    await this.db.transaction(async function() {
      const insertStmt = this.db.prepare('INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (?, ?)');
      for (const item of guestItems) {
        await insertStmt.run(userWl.id, item.product_id);
      }
      await this.db.prepare('DELETE FROM wishlist_items WHERE wishlist_id = ?').run(guestWl.id);
      await this.db.prepare('DELETE FROM wishlists WHERE id = ?').run(guestWl.id);
    })();

    return { success: true, merged: guestItems.length };
  }

  /**
   * Count items in a wishlist
   * @param {number|string} wishlistId
   * @returns {number}
   */
  async countItems(wishlistId) {
    const row = await this.db.prepare('SELECT COUNT(*) as count FROM wishlist_items WHERE wishlist_id = ?').get(wishlistId);
    return row?.count || 0;
  }

  /**
   * Get aggregate wishlist stats
   * @returns {{ totalWishlists: number, totalItems: number }}
   */
  async getStats() {
    const totalWishlists = (await this.db.prepare('SELECT COUNT(*) as count FROM wishlists').get())?.count || 0;
    const totalItems = (await this.db.prepare('SELECT COUNT(*) as count FROM wishlist_items').get())?.count || 0;
    return { totalWishlists, totalItems };
  }
}

module.exports = PostgresWishlistRepo;
