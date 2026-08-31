/**
 * SQLite Order Repository
 * Encapsulates all database queries for orders, order_items, and payments tables.
 * Methods are synchronous (better-sqlite3). No business logic.
 * Extracted in Batch 6A (CRITICAL Financial Boundary).
 */
const PostgresBaseRepository = require('./postgres-base-repository');
const PostgresProductRepo = require('./product-repo');

class PostgresOrderRepo extends PostgresBaseRepository {
  /**
   * Insert new Order with complete financial & address snapshot
   * @param {Object} data
   * @returns {number} Inserted order database ID
   */
  async create(data) {
    const stmt = this.db.prepare(`
      INSERT INTO orders (
        order_id, customer_id, status, subtotal, discount, shipping_fee, total,
        currency, exchange_rate, subtotal_sar, discount_sar, shipping_fee_sar, total_sar,
        payment_method, payment_method_label, delivery_method, city, district, address_detail, notes,
        coupon_code, coupon_id, free_shipping,
        delivery_pricing_type, delivery_estimate_text, delivery_zone,
        installation_fee_sar, installation_fee, installation_status,
        address_id, formatted_address, province, latitude, longitude,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        NOW(), NOW()
      )
    `);

    const res = await stmt.run(
      data.order_id,
      data.customer_id !== undefined ? data.customer_id : null,
      data.status || 'pending',
      data.subtotal !== undefined ? Number(data.subtotal) : 0,
      data.discount !== undefined ? Number(data.discount) : 0,
      data.shipping_fee !== undefined ? Number(data.shipping_fee) : 0,
      data.total !== undefined ? Number(data.total) : 0,
      data.currency || 'SAR',
      data.exchange_rate !== undefined ? Number(data.exchange_rate) : 1.0,
      data.subtotal_sar !== undefined ? Number(data.subtotal_sar) : 0,
      data.discount_sar !== undefined ? Number(data.discount_sar) : 0,
      data.shipping_fee_sar !== undefined ? Number(data.shipping_fee_sar) : 0,
      data.total_sar !== undefined ? Number(data.total_sar) : 0,
      data.payment_method || 'cash-on-delivery',
      data.payment_method_label || null,
      data.delivery_method || 'standard',
      data.city || null,
      data.district || null,
      data.address_detail || null,
      data.notes || null,
      data.coupon_code || null,
      data.coupon_id !== undefined ? data.coupon_id : null,
      data.free_shipping ? 1 : 0,
      data.delivery_pricing_type || null,
      data.delivery_estimate_text || null,
      data.delivery_zone || null,
      data.installation_fee_sar !== undefined ? Number(data.installation_fee_sar) : 0,
      data.installation_fee !== undefined ? Number(data.installation_fee) : 0,
      data.installation_status || 'none',
      data.address_id !== undefined ? data.address_id : null,
      data.formatted_address || null,
      data.province || null,
      data.latitude !== undefined && data.latitude !== null ? Number(data.latitude) : null,
      data.longitude !== undefined && data.longitude !== null ? Number(data.longitude) : null
    );

    return res.lastInsertRowid;
  }

  /**
   * Insert a single item into order_items
   * @param {Object} itemData
   * @returns {number} Inserted order_item ID
   */
  async createOrderItem(itemData) {
    const stmt = this.db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, product_title, quantity, price, total, selected_color, image_url,
        selected_size, selected_size_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = await stmt.run(
      itemData.order_id,
      itemData.product_id ? String(itemData.product_id) : null,
      itemData.product_title || itemData.title || '',
      itemData.quantity ? Math.max(1, parseInt(itemData.quantity, 10)) : 1,
      itemData.price !== undefined ? Number(itemData.price) : 0,
      itemData.total !== undefined ? Number(itemData.total) : 0,
      itemData.selected_color || null,
      itemData.image_url || null,
      // The size the customer picked, and the price it carried at that moment.
      // Prices change; an order has to keep what was actually agreed.
      itemData.selected_size || null,
      itemData.selected_size_price !== undefined && itemData.selected_size_price !== null
        ? Number(itemData.selected_size_price) : null
    );

    return res.lastInsertRowid;
  }

  /**
   * Batch insert order items
   * @param {number} orderDbId
   * @param {Array<Object>} items
   */
  async createOrderItems(orderDbId, items) {
    const stmt = this.db.prepare(`
      INSERT INTO order_items (
        order_id, product_id, product_title, quantity, price, total, selected_color, image_url,
        selected_size, selected_size_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const oi of items) {
      await stmt.run(
        orderDbId,
        oi.product_id ? String(oi.product_id) : null,
        oi.title || oi.product_title || '',
        oi.quantity ? Math.max(1, parseInt(oi.quantity, 10)) : 1,
        oi.unit_price !== undefined ? Number(oi.unit_price) : (oi.price !== undefined ? Number(oi.price) : 0),
        oi.subtotal !== undefined ? Number(oi.subtotal) : (oi.total !== undefined ? Number(oi.total) : 0),
        oi.selected_color || null,
        oi.image_url || null,
        oi.selected_size || oi.selectedSize || null,
        oi.selected_size_price !== undefined && oi.selected_size_price !== null
          ? Number(oi.selected_size_price) : null
      );
    }
  }

  /**
   * Insert payment record
   * @param {Object} paymentData
   * @returns {number} Inserted payment ID
   */
  async createPayment(paymentData) {
    const stmt = this.db.prepare(`
      INSERT INTO payments (order_id, method, method_label, amount, status, reference, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `);

    const res = await stmt.run(
      paymentData.order_id,
      paymentData.method || 'cash-on-delivery',
      paymentData.method_label || null,
      paymentData.amount !== undefined ? Number(paymentData.amount) : 0,
      paymentData.status || 'pending',
      paymentData.reference || null
    );

    return res.lastInsertRowid;
  }

  /**
   * Find order by primary key ID with customer details
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    if (!id) return null;
    return await this.db.prepare(`
      SELECT o.*, 
             c.first_name, c.last_name, c.phone, c.email, c.city as customer_city,
             c.district as customer_district, c.address_detail as customer_address
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = ?
    `).get(Number(id)) || null;
  }

  /**
   * Find order by public order_id string or ID with customer details
   * @param {string|number} orderIdStr
   * @returns {Object|null}
   */
  async findByOrderId(orderIdStr) {
    if (!orderIdStr) return null;
    return await this.db.prepare(`
      SELECT o.*, 
             c.first_name, c.last_name, c.phone, c.email, c.city as customer_city,
             c.district as customer_district, c.address_detail as customer_address
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.order_id = ? OR CAST(o.id AS TEXT) = ? OR UPPER(o.order_id) = ?
    `).get(
      String(orderIdStr),
      isNaN(Number(orderIdStr)) ? 0 : Number(orderIdStr),
      String(orderIdStr).toUpperCase()
    ) || null;
  }

  /**
   * Find order items for an order with rich image and color resolution
   * @param {number} orderDbId
   * @returns {Array<Object>}
   */
  async findItemsByOrderId(orderDbId) {
    if (!orderDbId) return [];
    const rawItems = await this.db.prepare(`
      SELECT oi.*, 
             COALESCE(
               NULLIF(oi.image_url, ''),
               (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1),
               '/assets/placeholder.svg'
             ) as image_url,
             COALESCE(
               NULLIF(oi.selected_color, ''),
               (SELECT name FROM product_colors WHERE product_id = p.id ORDER BY id ASC LIMIT 1)
             ) as fallback_color,
             p.colors as product_raw_colors,
             p.sku as product_sku,
             p.title as current_product_title,
             p.price as current_price
      FROM order_items oi
      LEFT JOIN products p ON (oi.product_id = p.product_id OR CAST(p.id AS TEXT) = oi.product_id)
      WHERE oi.order_id = ?
    `).all(Number(orderDbId));

    return rawItems.map(item => {
      let finalColor = (item.selected_color || item.fallback_color || '').trim();
      if (!finalColor && item.product_raw_colors) {
        try {
          const parsed = JSON.parse(item.product_raw_colors);
          if (Array.isArray(parsed) && parsed.length > 0) {
            finalColor = (typeof parsed[0] === 'object' && parsed[0] !== null) ? parsed[0].name : String(parsed[0]);
          }
        } catch (_) {
          finalColor = item.product_raw_colors.split(/[,،]+/)[0]?.trim() || '';
        }
      }
      return {
        ...item,
        selected_color: finalColor || null
      };
    });
  }

  /**
   * Find raw order items records
   * @param {number} orderDbId
   * @returns {Array<Object>}
   */
  async findRawItemsByOrderId(orderDbId) {
    if (!orderDbId) return [];
    return await this.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(Number(orderDbId));
  }

  /**
   * Find orders for customer
   * @param {number} customerId
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @returns {Array<Object>}
   */
  async findByCustomer(customerId, limit = 50, offset = 0) {
    if (!customerId) return [];
    return await this.db.prepare(`
      SELECT o.*, c.first_name, c.last_name, c.phone, c.email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.customer_id = ?
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?
    `).all(Number(customerId), limit, offset);
  }

  /**
   * Find latest single order for customer
   * @param {number} customerId
   * @returns {Object|null}
   */
  async findLatestByCustomerId(customerId) {
    if (!customerId) return null;
    return await this.db.prepare(`
      SELECT o.*, c.first_name, c.last_name, c.phone as customer_phone
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.customer_id = ?
      ORDER BY o.id DESC LIMIT 1
    `).get(Number(customerId)) || null;
  }

  /**
   * Find orders by customer phone
   * @param {string} cleanPhone
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @returns {Array<Object>}
   */
  async findByPhone(cleanPhone, limit = 50, offset = 0) {
    if (!cleanPhone) return [];
    return await this.db.prepare(`
      SELECT o.*, c.first_name, c.last_name, c.phone, c.email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE c.phone = ? OR c.phone ILIKE ?
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?
    `).all(cleanPhone, `%${cleanPhone}%`, limit, offset);
  }

  /**
   * Find orders for tracking by order number and/or phone
   * @param {string} orderNumberParam
   * @param {string} cleanPhone
   * @returns {Array<Object>}
   */
  async findForTracking(orderNumberParam, cleanPhone) {
    // Both identifiers are required, and there is no fallback if the pair does
    // not match.
    //
    // This method used to try three queries in turn: the pair, then the order
    // number alone, then the phone alone. Because it fell through on an empty
    // result, presenting an order number with a *wrong* phone did not fail --
    // it silently retried without the phone and returned the order anyway. So
    // the pair check it appeared to perform was decorative, and since order
    // numbers run in sequence (ZFB-2026-000036), counting upwards exposed
    // every customer's name, phone, email, address and total. The phone-alone
    // branch was the mirror image: one phone number returned that person's
    // entire purchase history.
    //
    // The permissive branches are gone rather than merely unused by the route,
    // so no future caller can reintroduce the hole by reaching for this
    // helper.
    if (!orderNumberParam || !cleanPhone || cleanPhone.length < 8) return [];

    const orders = await this.db.prepare(`
      SELECT o.*, c.first_name, c.last_name, c.phone, c.email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE (o.order_id = ? OR UPPER(o.order_id) = ? OR CAST(o.id AS TEXT) = ?)
        AND c.phone = ?
      ORDER BY o.id DESC
    `).all(orderNumberParam, String(orderNumberParam).toUpperCase(), orderNumberParam, cleanPhone);

    return orders || [];
  }

  /**
   * Find paginated admin orders with search & status filters
   * @param {Object} [filters={}]
   * @param {number} [limit=50]
   * @param {number} [offset=0]
   * @returns {Array<Object>}
   */
  async findAll(filters = {}, limit = 50, offset = 0) {
    let query = `
      SELECT o.*, c.first_name, c.phone 
      FROM orders o 
      LEFT JOIN customers c ON o.customer_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    if (filters.search) {
      query += ' AND (o.order_id ILIKE ? OR c.phone ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.status) {
      query += ' AND o.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await this.db.prepare(query).all(...params);
  }

  /**
   * Fetch a compact item preview (thumbnail, colour, title, quantity) for a
   * batch of orders in a single query.
   *
   * The order list showed nothing but text, so an operator could not tell one
   * order from another at a glance. Resolving the image per row would mean one
   * query per order; this takes the whole page in one round trip and returns a
   * Map keyed by order id.
   *
   * The image is resolved by joining products/product_images rather than by
   * reading order_items.image_url, because that snapshot column is NULL on
   * every existing row -- checkout never populated it.
   *
   * @param {Array<number>} orderIds
   * @param {number} [perOrder=4] how many item previews to keep per order
   * @returns {Map<number, Array<Object>>}
   */
  async findItemPreviewsForOrders(orderIds, perOrder = 4) {
    const ids = (orderIds || []).map(Number).filter(Boolean);
    if (ids.length === 0) return new Map();

    const placeholders = ids.map(() => '?').join(', ');
    const rows = await this.db.prepare(`
      SELECT oi.order_id,
             oi.product_id,
             oi.product_title,
             oi.quantity,
             COALESCE(
               NULLIF(oi.image_url, ''),
               (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1)
             ) AS image_url,
             NULLIF(oi.selected_color, '') AS selected_color
      FROM order_items oi
      LEFT JOIN products p ON (oi.product_id = p.product_id OR CAST(p.id AS TEXT) = oi.product_id)
      WHERE oi.order_id IN (${placeholders})
      ORDER BY oi.order_id DESC, oi.id ASC
    `).all(...ids);

    const byOrder = new Map();
    for (const row of rows) {
      const key = Number(row.order_id);
      if (!byOrder.has(key)) byOrder.set(key, { items: [], total: 0 });
      const bucket = byOrder.get(key);
      bucket.total += 1;
      if (bucket.items.length < perOrder) bucket.items.push(row);
    }
    return byOrder;
  }

  /**
   * Count total admin orders matching filters
   * @param {Object} [filters={}]
   * @returns {number}
   */
  async count(filters = {}) {
    let query = `
      SELECT COUNT(*) as c 
      FROM orders o 
      LEFT JOIN customers c ON o.customer_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    if (filters.search) {
      query += ' AND (o.order_id ILIKE ? OR c.phone ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.status) {
      query += ' AND o.status = ?';
      params.push(filters.status);
    }

    return (await this.db.prepare(query).get(...params))?.c || 0;
  }

  /**
   * Update order status
   * @param {number|string} id
   * @param {string} status
   * @returns {boolean}
   */
  async updateStatus(id, status) {
    const res = await this.db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = NOW() 
      WHERE id = ?
    `).run(status, Number(id));

    return res.changes > 0;
  }

  /**
   * Find latest payment record for order
   * @param {number|string} orderDbId
   * @returns {Object|null}
   */
  async findPaymentByOrderId(orderDbId) {
    if (!orderDbId) return null;
    return await this.db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(Number(orderDbId)) || null;
  }

  /**
   * Get aggregate order statistics
   * @returns {Object}
   */
  async getStats() {
    const totalOrders = (await this.db.prepare('SELECT COUNT(*) as c FROM orders').get())?.c || 0;
    const totalSalesSar = (await this.db.prepare("SELECT COALESCE(SUM(total_sar), 0) as s FROM orders WHERE status != 'cancelled'").get())?.s || 0;
    const totalSalesNative = (await this.db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE status != 'cancelled'").get())?.s || 0;
    const statusCounts = await this.db.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all();

    return {
      totalOrders,
      totalSalesSar,
      totalSalesNative,
      statusCounts
    };
  }

  /**
   * Get order status distribution for charts and breakdowns
   * @returns {Array<{ status: string, count: number }>}
   */
  async getStatusDistribution() {
    return await this.db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM orders 
      GROUP BY status
    `).all();
  }

  /**
   * Get daily sales aggregates for the last N days
   * @param {number} [days=30]
   * @returns {Array<{ sale_date: string, daily_total: number }>}
   */
  async getSalesLastNDays(days = 30) {
    return await this.db.prepare(`
      SELECT CAST(created_at AS DATE) as sale_date, SUM(total) as daily_total 
      FROM orders 
      WHERE created_at >= NOW() - (? || ' days')::INTERVAL AND status != 'cancelled'
      GROUP BY CAST(created_at AS DATE)
      ORDER BY sale_date ASC
    `).all(days);
  }

  /**
   * Get top selling products by quantity with product images
   * @param {number} [limit=5]
   * @returns {Array<Object>}
   */
  async getTopSellingProducts(limit = 5) {
    return await this.db.prepare(`
      SELECT order_items.product_id, order_items.product_title, SUM(order_items.quantity) as qty, SUM(order_items.total) as revenue,
        (SELECT pi.image_path FROM product_images pi JOIN products p ON (pi.product_id = p.id) WHERE (CAST(p.id AS TEXT) = order_items.product_id OR p.product_id = order_items.product_id) ORDER BY pi.is_primary DESC, pi.id ASC LIMIT 1) as product_image
      FROM order_items
      JOIN orders ON order_items.order_id = orders.id
      WHERE orders.status != 'cancelled'
      GROUP BY order_items.product_id, order_items.product_title
      ORDER BY qty DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get top products by sales for admin reports
   * @param {number} [limit=10]
   * @returns {Array<{ product_title: string, qty: number, revenue: number }>}
   */
  async getTopProductsBySales(limit = 10) {
    return await this.db.prepare(`
      SELECT product_title, SUM(quantity) as qty, SUM(total) as revenue 
      FROM order_items 
      GROUP BY product_title, product_id 
      ORDER BY qty DESC LIMIT ?
    `).all(limit);
  }

  /**
   * Get recent orders with customer name for dashboard
   * @param {number} [limit=6]
   * @returns {Array<Object>}
   */
  async getRecentOrdersWithCustomer(limit = 6) {
    return await this.db.prepare(`
      SELECT o.*, c.first_name, c.last_name
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get revenue summary for valid non-cancelled/non-refunded orders
   * @returns {{ total_sar: number, total_native: number }}
   */
  async getRevenueSummary() {
    const row = await this.db.prepare("SELECT SUM(total_sar) as total_sar, SUM(total) as total_native FROM orders WHERE status NOT IN ('cancelled', 'refunded')").get();
    return {
      total_sar: row?.total_sar || 0,
      total_native: row?.total_native || 0
    };
  }

  /**
   * Find single order with items and customer details for AI customer tracking tool
   * @param {string|number} rawId
   * @returns {object|null}
   */
  async findSingleOrderForAiTracking(rawId) {
    const rId = String(rawId || '').trim();
    const order = await this.db.prepare(`
      SELECT o.*, c.first_name, c.phone as customer_phone
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE (o.order_id = ? OR CAST(o.id AS TEXT) = ?)
    `).get(rId, rId);

    if (!order) return null;

    const items = await this.db.prepare('SELECT product_title, quantity, price FROM order_items WHERE order_id = ?').all(order.id);
    return { ...order, items };
  }

  /**
   * Create order from customer AI tool
   * @param {object} orderData
   * @param {Array} items
   * @param {object} customerData
   * @returns {number}
   */
  async createCustomerOrder(orderData, items = [], customerData = {}) {
    let orderDbId = null;
    const tx = this.db.transaction(async function() {
      let cust = null;
      if (customerData.phone) {
        cust = await this.db.prepare('SELECT id FROM customers WHERE phone = ?').get(customerData.phone);
      }
      let custId = cust?.id;
      if (!custId) {
        const resCust = await this.db.prepare(`
          INSERT INTO customers (first_name, last_name, phone, city, address_detail, created_at, updated_at)
          VALUES (?, '', ?, ?, ?, NOW(), NOW())
        `).run(customerData.customerName || 'عميل', customerData.phone || '', customerData.city || '', customerData.address || '');
        custId = resCust.lastInsertRowid;
      }

      const resOrder = await this.db.prepare(`
        INSERT INTO orders (
          order_id, customer_id, status, subtotal, discount, shipping_fee, total,
          payment_method, payment_method_label, delivery_method, city, address_detail,
          notes, currency, created_at, updated_at
        ) VALUES (?, ?, 'pending', ?, 0, ?, ?, 'cod', ?, ?, ?, ?, 'طلب عبر مساعد نجم الذكي', 'YER', NOW(), NOW())
      `).run(
        orderData.order_id,
        custId,
        orderData.subtotal,
        orderData.shipping_fee,
        orderData.total,
        customerData.paymentMethod || 'الدفع عند الاستلام',
        customerData.deliveryMethod || 'توصيل',
        customerData.city || 'صنعاء',
        customerData.address || ''
      );

      orderDbId = resOrder.lastInsertRowid;

      const insertItem = this.db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_title, quantity, price, total)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      // this.pool here is the transaction client (this is a txRepo instance
      // created by db.transaction()), so binding a product repo to it keeps
      // the stock decrement inside the same transaction as the order insert.
      const txProductRepo = new PostgresProductRepo(this.pool);
      for (const it of items) {
        await insertItem.run(orderDbId, it.product_id, it.title, it.quantity, it.price, it.price * it.quantity);
        if (it.id) {
          await txProductRepo.decrementStockLocked(it.id, it.quantity);
        }
      }
    });

    await tx();
    return orderDbId;
  }
}

module.exports = PostgresOrderRepo;
