/**
 * SQLite Cart Repository
 * Encapsulates all database queries and transactions for carts, cart_items, and guest_sessions.
 * Methods are synchronous (better-sqlite3). No business logic.
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresCartRepo extends PostgresBaseRepository {
  /**
   * Ensure a guest session record exists (for foreign key satisfaction)
   * @param {string} guestId
   */
  async ensureGuestSession(guestId) {
    if (!guestId) return;
    try {
      await this.db.prepare(`
        INSERT INTO guest_sessions (guest_id, created_at, last_active_at)
        VALUES (?, NOW(), NOW())
      `).run(guestId);
    } catch (_) {}
  }

  /**
   * Find cart by user ID
   * @param {number|string} userId
   * @returns {Object|null}
   */
  async findCartByUserId(userId) {
    if (!userId) return null;
    return await this.db.prepare('SELECT * FROM carts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) || null;
  }

  /**
   * Find unclaimed cart by guest ID
   * @param {string} guestId
   * @returns {Object|null}
   */
  async findCartByGuestId(guestId) {
    if (!guestId) return null;
    return await this.db.prepare('SELECT * FROM carts WHERE guest_id = ? AND user_id IS NULL ORDER BY id DESC LIMIT 1').get(guestId) || null;
  }

  /**
   * Find any cart by guest ID (even if associated with a user)
   * @param {string} guestId
   * @param {number|string} excludeUserId
   * @returns {Object|null}
   */
  async findGuestCartForMerge(guestId, excludeUserId) {
    if (!guestId) return null;
    return await this.db.prepare('SELECT id, coupon_code FROM carts WHERE guest_id = ? AND (user_id IS NULL OR user_id != ?) ORDER BY id DESC LIMIT 1').get(guestId, excludeUserId) || null;
  }

  /**
   * Find cart by numeric ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findCartById(id) {
    if (!id) return null;
    return await this.db.prepare('SELECT * FROM carts WHERE id = ?').get(id) || null;
  }

  /**
   * Create a new cart
   * @param {number|string|null} userId
   * @param {string|null} guestId
   * @returns {number} Inserted cart ID
   */
  async createCart(userId = null, guestId = null) {
    const result = await this.db.prepare(`
      INSERT INTO carts (user_id, guest_id, created_at, updated_at)
      VALUES (?, ?, NOW(), NOW())
    `).run(userId || null, guestId || null);

    return result.lastInsertRowid;
  }

  /**
   * Assign a guest cart to a user
   * @param {number|string} cartId
   * @param {number|string} userId
   * @returns {boolean}
   */
  async claimGuestCart(cartId, userId) {
    const result = await this.db.prepare("UPDATE carts SET user_id = ?, updated_at = NOW() WHERE id = ?").run(userId, cartId);
    return result.changes > 0;
  }

  /**
   * Update cart timestamp
   * @param {number|string} cartId
   */
  async touchCart(cartId) {
    try {
      await this.db.prepare("UPDATE carts SET updated_at = NOW() WHERE id = ?").run(cartId);
    } catch (_) {}
  }

  /**
   * Get raw joined cart items with product specs and primary image
   * @param {number|string} cartId
   * @returns {Array<Object>}
   */
  async findCartItems(cartId) {
    if (!cartId) return [];
    return await this.db.prepare(`
      SELECT 
        ci.id as cart_item_id,
        ci.cart_id,
        ci.product_id as stored_product_id,
        ci.quantity,
        ci.selected_color,
        ci.image_url as ci_image_url,
        p.id as internal_id,
        p.product_id,
        p.title,
        p.price,
        p.old_price,
        p.stock_quantity,
        p.stock_status,
        p.is_active,
        p.warranty,
        p.shipping,
        p.delivery_time,
        p.installation,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM cart_items ci
      JOIN products p ON (ci.product_id = p.product_id OR ci.product_id = p.id::TEXT)
      WHERE ci.cart_id = ?
      ORDER BY ci.id DESC
    `).all(Number(cartId));
  }

  /**
   * Find single item in cart matching product identifiers and optional color
   * @param {number|string} cartId
   * @param {string} canonicalPid
   * @param {number|string} internalId
   * @param {string} rawPid
   * @param {string|null} colorVal
   * @returns {Object|null}
   */
  async findItem(cartId, canonicalPid, internalId, rawPid, colorVal = null) {
    const pidStr = String(canonicalPid || internalId || rawPid || '1');
    const rawStr = String(rawPid || internalId || canonicalPid || '1');
    if (colorVal) {
      return await this.db.prepare(`
        SELECT id, quantity FROM cart_items 
        WHERE cart_id = ? AND (product_id = ? OR product_id = ?) AND selected_color = ?
      `).get(Number(cartId), pidStr, rawStr, colorVal) || null;
    }
    return await this.db.prepare(`
      SELECT id, quantity FROM cart_items 
      WHERE cart_id = ? AND (product_id = ? OR product_id = ?) AND (selected_color IS NULL OR selected_color = '')
    `).get(Number(cartId), pidStr, rawStr) || null;
  }

  /**
   * Find item without color filter
   * @param {number|string} cartId
   * @param {string} canonicalPid
   * @param {number|string} internalId
   * @param {string} rawPid
   * @returns {Object|null}
   */
  async findItemAnyColor(cartId, canonicalPid, internalId, rawPid) {
    const pidStr = String(canonicalPid || internalId || rawPid || '1');
    const rawStr = String(rawPid || internalId || canonicalPid || '1');
    return await this.db.prepare(`
      SELECT id, quantity FROM cart_items 
      WHERE cart_id = ? AND (product_id = ? OR product_id = ?)
    `).get(Number(cartId), pidStr, rawStr) || null;
  }

  /**
   * Add item or update existing item quantity in cart atomically
   * @param {number|string} cartId
   * @param {string} canonicalPid
   * @param {number} internalId
   * @param {string} rawPid
   * @param {number} qty
   * @param {string|null} colorVal
   * @param {string|null} imgVal
   */
  async addItem(cartId, canonicalPid, internalId, rawPid, qty, colorVal = null, imgVal = null) {
    const addItemTx = this.db.transaction(async function() {
      const existing = await this.findItem(cartId, canonicalPid, internalId, rawPid, colorVal);
      const pidToStore = String(canonicalPid || internalId || rawPid || '1');

      if (existing) {
        const newQty = existing.quantity + qty;
        await this.db.prepare(`
          UPDATE cart_items 
          SET quantity = ?, product_id = ?, selected_color = COALESCE(selected_color, ?), image_url = COALESCE(image_url, ?), updated_at = NOW() 
          WHERE id = ?
        `).run(newQty, pidToStore, colorVal, imgVal, existing.id);
      } else {
        await this.db.prepare(`
          INSERT INTO cart_items (cart_id, product_id, quantity, selected_color, image_url, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `).run(Number(cartId), pidToStore, qty, colorVal, imgVal);
      }

      await this.db.prepare("UPDATE carts SET updated_at = NOW() WHERE id = ?").run(Number(cartId));
    });

    await addItemTx();
  }

  /**
   * Update item quantity in cart atomically
   * @param {number|string} cartId
   * @param {string} canonicalPid
   * @param {number} internalId
   * @param {string} rawPid
   * @param {number} qty
   */
  async updateItem(cartId, canonicalPid, internalId, rawPid, qty) {
    const updateTx = this.db.transaction(async function() {
      const pidStr = String(canonicalPid || internalId || rawPid || '1');
      const rawStr = String(rawPid || internalId || canonicalPid || '1');
      if (isNaN(qty) || qty <= 0) {
        await this.db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND (product_id = ? OR product_id = ?)').run(Number(cartId), pidStr, rawStr);
      } else {
        const existing = await this.findItemAnyColor(cartId, canonicalPid, internalId, rawPid);

        if (existing) {
          await this.db.prepare("UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE id = ?").run(qty, existing.id);
        } else {
          await this.db.prepare("INSERT INTO cart_items (cart_id, product_id, quantity, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())").run(Number(cartId), pidStr, qty);
        }
      }
      await this.db.prepare("UPDATE carts SET updated_at = NOW() WHERE id = ?").run(Number(cartId));
    });

    await updateTx();
  }

  /**
   * Remove item from cart atomically
   * @param {number|string} cartId
   * @param {string} canonicalPid
   * @param {number} internalId
   * @param {string} rawPid
   */
  async removeItem(cartId, canonicalPid, internalId, rawPid) {
    const removeTx = this.db.transaction(async function() {
      const pidStr = String(canonicalPid || internalId || rawPid || '1');
      const rawStr = String(rawPid || internalId || canonicalPid || '1');
      await this.db.prepare('DELETE FROM cart_items WHERE cart_id = ? AND (product_id = ? OR product_id = ?)').run(Number(cartId), pidStr, rawStr);
      await this.db.prepare("UPDATE carts SET updated_at = NOW() WHERE id = ?").run(Number(cartId));
    });

    await removeTx();
  }

  /**
   * Set coupon code on cart
   * @param {number|string} cartId
   * @param {string} couponCode
   * @returns {boolean}
   */
  async setCoupon(cartId, couponCode) {
    const result = await this.db.prepare("UPDATE carts SET coupon_code = ?, updated_at = NOW() WHERE id = ?").run(couponCode, cartId);
    return result.changes > 0;
  }

  /**
   * Remove coupon code from cart
   * @param {number|string} cartId
   * @returns {boolean}
   */
  async removeCoupon(cartId) {
    const result = await this.db.prepare("UPDATE carts SET coupon_code = NULL, updated_at = NOW() WHERE id = ?").run(cartId);
    return result.changes > 0;
  }

  /**
   * Clear all items and coupon from a cart
   * @param {number|string} cartId
   */
  async clearCartById(cartId) {
    const clearTx = this.db.transaction(async function() {
      await this.db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cartId);
      await this.db.prepare("UPDATE carts SET coupon_code = NULL, updated_at = NOW() WHERE id = ?").run(cartId);
    });
    await clearTx();
  }

  /**
   * Merge guest cart into user cart atomically
   * @param {number|string} guestCartId
   * @param {number|string} userCartId
   * @param {string|null} guestCouponCode
   * @param {string|null} userCouponCode
   */
  async mergeGuestCart(guestCartId, userCartId, guestCouponCode = null, userCouponCode = null) {
    const mergeTx = this.db.transaction(async function() {
      const guestItems = await this.db.prepare('SELECT product_id, quantity, selected_color, image_url FROM cart_items WHERE cart_id = ?').all(guestCartId);

      for (const item of guestItems) {
        let existing = null;
        if (item.selected_color) {
          existing = await this.db.prepare(`
            SELECT id, quantity FROM cart_items 
            WHERE cart_id = ? AND (product_id = ? OR CAST(product_id AS TEXT) = ?) AND selected_color = ?
          `).get(userCartId, item.product_id, String(item.product_id), item.selected_color);
        } else {
          existing = await this.db.prepare(`
            SELECT id, quantity FROM cart_items 
            WHERE cart_id = ? AND (product_id = ? OR CAST(product_id AS TEXT) = ?) AND (selected_color IS NULL OR selected_color = '')
          `).get(userCartId, item.product_id, String(item.product_id));
        }

        if (existing) {
          await this.db.prepare("UPDATE cart_items SET quantity = quantity + ?, updated_at = NOW() WHERE id = ?").run(item.quantity, existing.id);
        } else {
          await this.db.prepare(`
            INSERT INTO cart_items (cart_id, product_id, quantity, selected_color, image_url, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
          `).run(userCartId, item.product_id, item.quantity, item.selected_color || null, item.image_url || null);
        }
      }

      if (guestCouponCode && !userCouponCode) {
        await this.db.prepare("UPDATE carts SET coupon_code = ? WHERE id = ?").run(guestCouponCode, userCartId);
      }

      // Remove old guest cart
      await this.db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(guestCartId);
      await this.db.prepare('DELETE FROM carts WHERE id = ?').run(guestCartId);
    });

    await mergeTx();
  }
}

module.exports = PostgresCartRepo;
