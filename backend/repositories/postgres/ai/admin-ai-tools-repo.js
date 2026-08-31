/**
 * PostgreSQL Admin AI Tools & Operational Tasks Repository
 * Handles ai_tool_runs and ai_tasks tables and encapsulates all database queries for AI tool handlers.
 */

const PERIOD_SQL = {
  today: "date(created_at) = CURRENT_DATE",
  yesterday: "date(created_at) = CURRENT_DATE - INTERVAL '1 day'",
  '7d': "created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'",
  '30d': "created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'",
  '90d': "created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'"
};

function safePeriod(period) {
  return PERIOD_SQL[period] ? period : '30d';
}

function periodWhere(period, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return PERIOD_SQL[safePeriod(period)].replaceAll('created_at', `${prefix}created_at`);
}

async function tableExists(db, table) {
  try {
    const row = await db.prepare("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?").get(table);
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

async function countRows(db, table, where = '1=1') {
  try {
    const row = await db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${where}`).get();
    return Number(row?.count) || 0;
  } catch (_) {
    return 0;
  }
}

class AdminAiToolsRepo {
  constructor(db) {
    this.db = db;
  }

  async logToolRun({ conversationId = null, userId = null, toolName, operationType, arguments: args, resultSummary, status = 'success' }) {
    let safeArgs = '';
    try {
      const parsed = typeof args === 'string' ? JSON.parse(args) : (args || {});
      if (parsed.apiToken) parsed.apiToken = '[REDACTED_SECRET]';
      if (parsed.password) parsed.password = '[REDACTED_SECRET]';
      if (parsed.secret) parsed.secret = '[REDACTED_SECRET]';
      safeArgs = JSON.stringify(parsed);
    } catch (_) {
      safeArgs = String(args || '{}');
    }

    return await this.db.prepare(`
      INSERT INTO ai_tool_runs (conversation_id, user_id, tool_name, operation_type, arguments, result_summary, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId || null,
      userId || null,
      toolName,
      operationType,
      safeArgs,
      typeof resultSummary === 'string' ? resultSummary.slice(0, 1500) : JSON.stringify(resultSummary || {}).slice(0, 1500),
      status
    );
  }

  async getToolRuns(limit = 100) {
    return await this.db.prepare(`
      SELECT * FROM ai_tool_runs
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  }

  async createTasks(tasks) {
    const insert = this.db.prepare(`
      INSERT INTO ai_tasks (priority, title, description, source_tool, related_type, status)
      SELECT ?, ?, ?, ?, ?, 'open'
      WHERE NOT EXISTS (SELECT 1 FROM ai_tasks WHERE title = ? AND status = 'open')
    `);
    for (const task of tasks) {
      await insert.run(task.priority, task.title, task.description, task.source_tool, task.related_type, task.title);
    }
  }

  async getTasks() {
    return await this.db.prepare(`
      SELECT * FROM ai_tasks
      ORDER BY
        CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC
    `).all();
  }

  async updateTaskStatus(taskId, status) {
    const nextStatus = ['open', 'complete', 'ignored'].includes(status) ? status : 'open';
    return await this.db.prepare("UPDATE ai_tasks SET status = ?, updated_at = NOW() WHERE id = ?").run(nextStatus, taskId);
  }

  async getStoreOverview() {
    const productsWithoutImagesRow = await this.db.prepare(`
      SELECT COUNT(*) as count
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id
      WHERE pi.id IS NULL
    `).get();
    const productsWithoutImages = Number(productsWithoutImagesRow?.count) || 0;

    const totalRevRow = await this.db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled'").get();
    const todayRevRow = await this.db.prepare("SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE status != 'cancelled' AND date(created_at) = CURRENT_DATE").get();

    return {
      products: await countRows(this.db, 'products'),
      activeProducts: await countRows(this.db, 'products', 'is_active = TRUE'),
      categories: await countRows(this.db, 'categories'),
      orders: await countRows(this.db, 'orders'),
      pendingOrders: await countRows(this.db, 'orders', "status = 'pending'"),
      customers: await countRows(this.db, 'customers'),
      totalRevenue: Number(totalRevRow?.total) || 0,
      todayRevenue: Number(todayRevRow?.total) || 0,
      todayOrders: await countRows(this.db, 'orders', "date(created_at) = CURRENT_DATE"),
      lowStockProducts: await countRows(this.db, 'products', "stock_status IN ('limited', 'low_stock', 'limited_stock')"),
      productsWithoutImages,
      productsWithoutPrices: await countRows(this.db, 'products', 'price IS NULL OR price <= 0'),
      unreadMessages: await countRows(this.db, 'contact_messages', 'is_read = FALSE')
    };
  }

  async getSalesSummary({ period = '30d' } = {}) {
    const where = periodWhere(period, 'o');
    const summary = await this.db.prepare(`
      SELECT COUNT(*) as orders_count, COALESCE(SUM(o.total), 0) as revenue, COALESCE(AVG(o.total), 0) as average_order
      FROM orders o
      WHERE o.status != 'cancelled' AND ${where}
    `).get();
    const daily = await this.db.prepare(`
      SELECT date(o.created_at) as label, COALESCE(SUM(o.total), 0) as value, COUNT(*) as orders
      FROM orders o
      WHERE o.status != 'cancelled' AND ${where}
      GROUP BY date(o.created_at)
      ORDER BY label ASC
    `).all();
    return { period: safePeriod(period), ...summary, daily };
  }

  async getTopProducts({ period = '30d', limit = 10 } = {}) {
    const where = periodWhere(period, 'o');
    return await this.db.prepare(`
      SELECT
        oi.product_id,
        oi.product_title,
        SUM(oi.quantity) as quantity_sold,
        COALESCE(SUM(oi.total), 0) as revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status != 'cancelled' AND ${where}
      GROUP BY oi.product_id, oi.product_title
      ORDER BY quantity_sold DESC, revenue DESC
      LIMIT ?
    `).all(Math.min(Number(limit) || 10, 50));
  }

  async getProductDetails(productId) {
    const product = await this.db.prepare(`
      SELECT p.*, c.name_ar as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE CAST(p.id AS TEXT) = ? OR p.product_id = ?
    `).get(productId, String(productId || ''));
    if (!product) return null;
    return {
      ...product,
      images: await this.db.prepare('SELECT image_path, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order').all(product.id),
      specs: await this.db.prepare('SELECT label, value FROM product_specs WHERE product_id = ? ORDER BY sort_order').all(product.id)
    };
  }

  async searchProducts({ query = '', limit = 20 } = {}) {
    const like = `%${String(query).trim()}%`;
    return await this.db.prepare(`
      SELECT p.id, p.product_id, p.title, p.price, p.old_price, p.stock_status, p.is_active, c.name_ar as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.title ILIKE ? OR p.product_id ILIKE ? OR p.sku ILIKE ? OR p.brand ILIKE ?
      ORDER BY p.is_active DESC, p.updated_at DESC
      LIMIT ?
    `).all(like, like, like, like, Math.min(Number(limit) || 20, 50));
  }

  async getLowStockProducts({ limit = 50 } = {}) {
    return await this.db.prepare(`
      SELECT id, product_id, title, price, stock_status, updated_at
      FROM products
      WHERE stock_status IN ('limited', 'low_stock', 'limited_stock')
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(Math.min(Number(limit) || 50, 100));
  }

  async getProductsWithoutImages({ limit = 100 } = {}) {
    return await this.db.prepare(`
      SELECT p.id, p.product_id, p.title, p.price, p.is_active
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id
      WHERE pi.id IS NULL
      ORDER BY p.updated_at DESC
      LIMIT ?
    `).all(Math.min(Number(limit) || 100, 200));
  }

  async getProductsWithoutPrices({ limit = 100 } = {}) {
    return await this.db.prepare(`
      SELECT id, product_id, title, stock_status, is_active
      FROM products
      WHERE price IS NULL OR price <= 0
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(Math.min(Number(limit) || 100, 200));
  }

  async getOrders({ status = '', period = '30d', limit = 30 } = {}) {
    const params = [];
    let where = `WHERE ${periodWhere(period, 'o')}`;
    if (status) {
      where += ' AND o.status = ?';
      params.push(status);
    }
    params.push(Math.min(Number(limit) || 30, 100));
    return await this.db.prepare(`
      SELECT o.id, o.order_id, o.status, o.total, o.currency, o.payment_method_label, o.city, o.created_at,
             c.first_name, c.last_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(...params);
  }

  async getOrderDetails(orderId) {
    const order = await this.db.prepare(`
      SELECT o.*, c.first_name, c.last_name, c.city as customer_city, c.total_orders
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE CAST(o.id AS TEXT) = ? OR o.order_id = ?
    `).get(orderId, String(orderId || ''));
    if (!order) return null;
    return {
      ...order,
      items: await this.db.prepare('SELECT product_id, product_title, quantity, price, total FROM order_items WHERE order_id = ?').all(order.id)
    };
  }

  async getCustomerDetails(customerId) {
    const row = await this.db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!row) return null;
    return {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      city: row.city,
      district: row.district,
      total_orders: row.total_orders,
      total_spent: row.total_spent,
      created_at: row.created_at,
      orders: await this.db.prepare(`
        SELECT id, order_id, status, total, created_at
        FROM orders
        WHERE customer_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(customerId)
    };
  }

  async getCategoryDetails(categoryId) {
    const category = await this.db.prepare('SELECT * FROM categories WHERE CAST(id AS TEXT) = ? OR slug = ?').get(categoryId, String(categoryId || ''));
    if (!category) return null;
    const countRow = await this.db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?').get(category.id);
    const productCount = Number(countRow?.count) || 0;
    return { ...category, productCount };
  }

  async getInventorySummary() {
    const byStatus = await this.db.prepare(`
      SELECT stock_status, COUNT(*) as count
      FROM products
      GROUP BY stock_status
      ORDER BY count DESC
    `).all();
    return {
      totalProducts: await countRows(this.db, 'products'),
      activeProducts: await countRows(this.db, 'products', 'is_active = TRUE'),
      inactiveProducts: await countRows(this.db, 'products', 'is_active = FALSE'),
      withoutImages: await this.getProductsWithoutImages({ limit: 5 }),
      withoutPrices: await this.getProductsWithoutPrices({ limit: 5 }),
      byStatus
    };
  }

  async getWebsiteStatistics() {
    return {
      pages: (await tableExists(this.db, 'cms_pages')) ? (await countRows(this.db, 'cms_pages')) : 0,
      mediaItems: await countRows(this.db, 'media'),
      banners: await countRows(this.db, 'banners'),
      offers: await countRows(this.db, 'offers'),
      activeOffers: await countRows(this.db, 'offers', 'is_active = TRUE'),
      unreadContactMessages: await countRows(this.db, 'contact_messages', 'is_read = FALSE'),
      availableMetrics: ['database_counts', 'content_counts'],
      unavailableMetrics: ['browser_javascript_errors', 'real_user_performance', 'failed_frontend_api_requests']
    };
  }

  async getSearchStatistics() {
    const exists = await tableExists(this.db, 'search_logs');
    return {
      available: exists,
      message: exists ? 'Search logs are available.' : 'لا توجد سجلات بحث مخزنة في قاعدة البيانات حتى الآن.',
      popularSearches: exists ? await this.db.prepare('SELECT query, COUNT(*) as count FROM search_logs GROUP BY query ORDER BY count DESC LIMIT 20').all() : []
    };
  }

  async getSeoStatus() {
    const descCountRow = await this.db.prepare(`SELECT COUNT(*) as count FROM products WHERE description IS NULL OR TRIM(description) = ''`).get();
    return {
      productsWithoutDescriptions: Number(descCountRow?.count) || 0,
      productsWithoutImages: await this.getProductsWithoutImages({ limit: 10 }),
      settings: await this.db.prepare("SELECT key, value FROM settings WHERE group_name = 'seo'").all(),
      note: 'تحليل SEO يعتمد على الحقول الموجودة حاليًا فقط.'
    };
  }

  async getRecentActivity({ limit = 30 } = {}) {
    const activity = [];
    if (await tableExists(this.db, 'audit_logs')) {
      const logs = await this.db.prepare(`
        SELECT created_at, 'admin' as source, action, entity, entity_id
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT ?
      `).all(Math.min(Number(limit) || 30, 100));
      activity.push(...logs);
    }
    const orderLogs = await this.db.prepare(`
      SELECT created_at, 'order' as source, status as action, 'orders' as entity, order_id as entity_id
      FROM orders
      ORDER BY created_at DESC
      LIMIT ?
    `).all(Math.min(Number(limit) || 30, 100));
    activity.push(...orderLogs);
    return activity.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, Math.min(Number(limit) || 30, 100));
  }

  async pingDatabase() {
    try {
      await this.db.prepare('SELECT 1').get();
      return true;
    } catch (_) {
      return false;
    }
  }

  async updateProductPriceDirect(productId, price) {
    return await this.db.prepare("UPDATE products SET price = ?, updated_at = NOW() WHERE id = ?").run(price, productId);
  }

  async updateProductStockDirect(productId, stockStatus) {
    return await this.db.prepare("UPDATE products SET stock_status = ?, updated_at = NOW() WHERE id = ?").run(stockStatus, productId);
  }

  async updateProductDescriptionDirect(productId, description) {
    return await this.db.prepare("UPDATE products SET description = ?, updated_at = NOW() WHERE id = ?").run(description, productId);
  }

  async updateCategoryDirect(categoryId, nameAr, descriptionAr, isActive) {
    return await this.db.prepare(`
      UPDATE categories SET name_ar = ?, description_ar = ?, is_active = ?, updated_at = NOW()
      WHERE id = ?
    `).run(nameAr, descriptionAr, isActive, categoryId);
  }

  async createDiscountDirect(offer) {
    return await this.db.prepare(`
      INSERT INTO offers (
        title_ar, title_en, description, discount_type, discount_value, min_order,
        start_date, end_date, applicable_categories, applicable_products, is_active
      ) VALUES (
        @title_ar, @title_en, @description, @discount_type, @discount_value, @min_order,
        @start_date, @end_date, @applicable_categories, @applicable_products, @is_active
      )
    `).run(offer);
  }

  async updateDiscountDirect(offerId, titleAr, description, discountValue, isActive) {
    return await this.db.prepare(`
      UPDATE offers SET title_ar = ?, description = ?, discount_value = ?, is_active = ?, updated_at = NOW()
      WHERE id = ?
    `).run(titleAr, description, discountValue, isActive, offerId);
  }

  async createProductDirect(product) {
    return await this.db.prepare(`
      INSERT INTO products (
        product_id, category_id, title, description, price, old_price, sku, brand,
        origin, warranty, shipping, delivery_time, stock_status, is_active
      ) VALUES (
        @product_id, @category_id, @title, @description, @price, @old_price, @sku, @brand,
        @origin, @warranty, @shipping, @delivery_time, @stock_status, @is_active
      )
    `).run(product);
  }

  async deleteProductDirect(productId) {
    return await this.db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  }

  async publishContentDirect(pageId) {
    return await this.db.prepare("UPDATE cms_pages SET is_active = 1, updated_at = NOW() WHERE id = ?").run(pageId);
  }

  async updateOrderStatusDirect(orderId, status) {
    return await this.db.prepare("UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?").run(status, orderId);
  }
}

module.exports = AdminAiToolsRepo;
