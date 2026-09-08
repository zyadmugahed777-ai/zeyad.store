/**
 * Customer product reviews.
 *
 * One rule runs through every method here: **only 'approved' rows are ever
 * public**. The product page, the aggregate that feeds structured data, and
 * the count beside the stars all read through functions that filter on status
 * in SQL rather than trusting a caller to remember. A pending review is
 * visible to exactly two parties -- the operator moderating it, and the
 * customer who wrote it.
 *
 * The verified-purchase flag is computed here from order_items, never accepted
 * from the request. It is the one claim on a review page a shopper is entitled
 * to trust, so nothing the client sends can set it.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

/* Extends the base repository for the same reason every sibling does: it is
   what turns a pg Pool into the `db.prepare(...)` interface these methods use,
   and it carries the ?-to-$n translation and the boolean-column handling. */
class PostgresReviewRepo extends PostgresBaseRepository {

  /**
   * Has this customer actually received this product?
   *
   * Joins orders to order_items. order_items.product_id is TEXT and holds the
   * operator-facing product code, while products.id is the numeric key, so the
   * match is made through the products row rather than by casting one to the
   * other.
   *
   * Only delivered/completed orders count. A pending order proves an intent to
   * buy, not an experience of the product.
   */
  async hasPurchased(customerId, productId) {
    const row = await this.db.prepare(`
      SELECT 1
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON (p.product_id = oi.product_id OR p.sku = oi.product_id)
      WHERE o.customer_id = ?
        AND p.id = ?
        AND lower(coalesce(o.status, '')) IN ('delivered', 'completed', 'مكتمل', 'تم التسليم')
      LIMIT 1
    `).get(customerId, productId);
    return !!row;
  }

  /** The review this customer already wrote for this product, in any status. */
  async findMine(customerId, productId) {
    return await this.db.prepare(
      'SELECT id, rating, body, status, created_at FROM product_reviews WHERE customer_id = ? AND product_id = ?'
    ).get(customerId, productId);
  }

  /**
   * Store a review. Always lands as 'pending'.
   * @returns {{id:number}}
   */
  async create({ productId, customerId, authorName, rating, body, isVerifiedPurchase }) {
    const res = await this.db.prepare(`
      INSERT INTO product_reviews
        (product_id, customer_id, author_name, rating, body, status, is_verified_purchase, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())
    `).run(productId, customerId, authorName, rating, body, isVerifiedPurchase ? 1 : 0);
    return { id: res.lastInsertRowid };
  }

  /** Approved reviews for one product, newest first. The only public read. */
  async findApproved(productId, limit = 20) {
    return (await this.db.prepare(`
      SELECT id, author_name, rating, body, is_verified_purchase, created_at
      FROM product_reviews
      WHERE product_id = ? AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(productId, limit)) || [];
  }

  /**
   * The average and count for one product, from approved reviews only.
   * Returns null when there are none -- the caller must publish nothing at all
   * rather than a zero, because "rated 0 out of 5" is a claim and "not yet
   * rated" is the truth.
   */
  async aggregate(productId) {
    const row = await this.db.prepare(`
      SELECT COUNT(*) AS count, AVG(rating) AS average
      FROM product_reviews
      WHERE product_id = ? AND status = 'approved'
    `).get(productId);
    const count = Number(row && row.count) || 0;
    if (count === 0) return null;
    return { count, average: Math.round(Number(row.average) * 10) / 10 };
  }

  /**
   * Aggregates for many products at once, for the storefront payload.
   * @returns {Map<number, {count:number, average:number}>}
   */
  async aggregatesForAll() {
    const rows = (await this.db.prepare(`
      SELECT product_id, COUNT(*) AS count, AVG(rating) AS average
      FROM product_reviews
      WHERE status = 'approved'
      GROUP BY product_id
    `).all()) || [];
    const map = new Map();
    for (const r of rows) {
      map.set(Number(r.product_id), {
        count: Number(r.count),
        average: Math.round(Number(r.average) * 10) / 10
      });
    }
    return map;
  }

  // ---- moderation ---------------------------------------------------------

  async findForAdmin(status, limit = 100, offset = 0) {
    const where = status ? 'WHERE r.status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];
    return (await this.db.prepare(`
      SELECT r.*, p.title AS product_title, p.product_id AS product_code
      FROM product_reviews r
      LEFT JOIN products p ON p.id = r.product_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params)) || [];
  }

  async countByStatus() {
    const rows = (await this.db.prepare(
      'SELECT status, COUNT(*) AS count FROM product_reviews GROUP BY status'
    ).all()) || [];
    const out = { pending: 0, approved: 0, rejected: 0 };
    for (const r of rows) out[r.status] = Number(r.count);
    return out;
  }

  async setStatus(id, status) {
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      throw new Error('Unknown review status: ' + status);
    }
    return await this.db.prepare(
      'UPDATE product_reviews SET status = ?, updated_at = NOW() WHERE id = ?'
    ).run(status, id);
  }

  /**
   * Remove a review outright.
   *
   * Rejecting is the usual answer and keeps the row, which stops the same
   * customer resubmitting the same text. Deleting is for content that should
   * not sit in the database at all -- abuse, a phone number, someone else's
   * personal data -- and it frees the customer to write a real review later.
   */
  async remove(id) {
    return await this.db.prepare('DELETE FROM product_reviews WHERE id = ?').run(id);
  }
}

module.exports = PostgresReviewRepo;
