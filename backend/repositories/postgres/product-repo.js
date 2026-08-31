/**
 * SQLite Product Repository
 * 
 * Encapsulates all database queries for products and product relations:
 * - products
 * - product_images
 * - product_specs
 * - product_faq
 * - product_colors
 * 
 * Methods are synchronous (better-sqlite3).
 * No business logic — only data access and atomic transactions.
 */

const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresProductRepo extends PostgresBaseRepository {
  /**
   * Get all active products for Fuse.js search indexing.
   * @returns {Array}
   */
  async findSearchable() {
    const query = `
      SELECT 
        p.id, p.product_id, p.title, p.price, p.old_price, p.category_id, p.department_id, p.is_best_seller, p.is_new,
        p.reviews_count, p.rating, p.description, p.brand, p.sku, p.stock_status, p.stock_quantity,
        c.name_ar as category_name,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)
      ORDER BY p.sort_order ASC, p.id DESC
    `;
    return await this.db.prepare(query).all();
  }

  /**
   * Find a single product by numeric id, product_id string, or sku.
   * @param {number|string} idOrProductId
   * @returns {object|undefined}
   */
  async findById(idOrProductId) {
    const isNumeric = /^\d+$/.test(String(idOrProductId));
    const query = isNumeric
      ? 'SELECT p.*, c.name_ar as category_name, d.name_ar as department_name FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN departments d ON p.department_id = d.id WHERE (p.id = ? OR p.product_id = ?) AND (p.is_archived = 0 OR p.is_archived IS NULL)'
      : 'SELECT p.*, c.name_ar as category_name, d.name_ar as department_name FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN departments d ON p.department_id = d.id WHERE (p.product_id = ? OR p.sku = ?) AND (p.is_archived = 0 OR p.is_archived IS NULL)';

    return isNumeric
      ? await this.db.prepare(query).get(Number(idOrProductId), String(idOrProductId))
      : await this.db.prepare(query).get(String(idOrProductId), String(idOrProductId));
  }

  /**
   * Find product record and main image for authoritative financial calculation
   * @param {number|string} idOrProductId
   * @returns {Object|null}
   */
  async findForOrderFinancials(idOrProductId) {
    if (!idOrProductId) return null;
    const isNumeric = /^\d+$/.test(String(idOrProductId));
    return await this.db.prepare(`
      SELECT id, product_id, title, price, stock_quantity, stock_status, is_active,
             (SELECT image_path FROM product_images WHERE product_id = products.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products WHERE (id = ? OR product_id = ?) AND (is_archived = 0 OR is_archived IS NULL)
    `).get(isNumeric ? Number(idOrProductId) : 0, String(idOrProductId)) || null;
  }

  /**
   * Find recommended solar products for solar calculator
   * @param {number} limit
   * @returns {Array<Object>}
   */
  async findSolarRecommendations(limit = 3) {
    return await this.db.prepare(`
      SELECT p.id, p.product_id, p.title, p.price,
             (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      WHERE (p.title ILIKE '%طاقة%' OR p.title ILIKE '%انفرتر%' OR p.title ILIKE '%بطارية%' OR p.title ILIKE '%لوح%')
        AND p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)
      LIMIT ?
    `).all(limit);
  }

  /**
   * Find raw product record by primary key id (including archived).
   * @param {number|string} id
   * @returns {object|undefined}
   */
  async findRawById(id) {
    return await this.db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  }

  /**
   * Get product images.
   * @param {number|string} productId
   * @returns {Array}
   */
  async findImages(productId) {
    return await this.db.prepare(
      'SELECT id, image_path, is_primary, sort_order, color_name FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC'
    ).all(productId);
  }

  /**
   * Get product specifications.
   * @param {number|string} productId
   * @returns {Array}
   */
  async findSpecs(productId) {
    return await this.db.prepare(
      'SELECT label, value FROM product_specs WHERE product_id = ? ORDER BY sort_order ASC'
    ).all(productId);
  }

  /**
   * Get product FAQs.
   * @param {number|string} productId
   * @returns {Array}
   */
  async findFaqs(productId) {
    return await this.db.prepare(
      'SELECT question as q, answer as a FROM product_faq WHERE product_id = ? ORDER BY sort_order ASC'
    ).all(productId);
  }

  /**
   * Get product colors.
   * @param {number|string} productId
   * @returns {Array}
   */
  async findColors(productId) {
    return await this.db.prepare(
      'SELECT name, hex FROM product_colors WHERE product_id = ?'
    ).all(productId);
  }

  /**
   * Get a product's sizes. Each size carries its own full price, so the label
   * and the price travel together everywhere they are used.
   * Empty for every product nobody has added sizes to, which is the normal
   * case: the storefront then shows no size picker at all.
   */
  async findSizes(productId) {
    return await this.db.prepare(
      'SELECT id, label, price, sort_order FROM product_sizes WHERE product_id = ? AND is_active = TRUE ORDER BY sort_order ASC, id ASC'
    ).all(productId);
  }

  /**
   * List public active products with filtering and pagination.
   * @param {object} [filters={}]
   * @param {number} [limit=20]
   * @param {number} [offset=0]
   * @returns {Array}
   */
  async findAll(filters = {}, limit = 20, offset = 0) {
    const { whereClause, params, orderClause } = this._buildPublicWhereAndOrder(filters);

    const selectQuery = `
      SELECT 
        p.*, 
        c.name_ar as category_name, 
        d.name_ar as department_name,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN departments d ON p.department_id = d.id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    return await this.db.prepare(selectQuery).all(...params, limit, offset);
  }

  /**
   * Count public active products matching filters.
   * @param {object} [filters={}]
   * @returns {number}
   */
  async count(filters = {}) {
    const { whereClause, params } = this._buildPublicWhereAndOrder(filters);

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      LEFT JOIN departments d ON p.department_id = d.id
      ${whereClause}
    `;

    return (await this.db.prepare(countQuery).get(...params)).total;
  }

  _buildPublicWhereAndOrder(filters = {}) {
    const { category, department, min_price, max_price, is_new, is_best_seller, sort } = filters;

    let where = ['p.is_active = 1', '(p.is_archived = 0 OR p.is_archived IS NULL)'];
    let params = [];

    if (category) {
      where.push('(CAST(p.category_id AS TEXT) = ? OR c.name_ar = ? OR c.slug = ?)');
      params.push(category, category, category);
    }

    if (department) {
      where.push('(CAST(p.department_id AS TEXT) = ? OR d.name_ar = ? OR d.slug = ?)');
      params.push(department, department, department);
    }

    if (min_price) {
      where.push('p.price >= ?');
      params.push(parseFloat(min_price));
    }

    if (max_price) {
      where.push('p.price <= ?');
      params.push(parseFloat(max_price));
    }

    if (is_new) {
      where.push('p.is_new = 1');
    }

    if (is_best_seller) {
      where.push('p.is_best_seller = 1');
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    let orderClause = 'ORDER BY p.sort_order ASC, p.id DESC';
    if (sort === 'price_asc') orderClause = 'ORDER BY p.price ASC';
    else if (sort === 'price_desc') orderClause = 'ORDER BY p.price DESC';
    else if (sort === 'rating') orderClause = 'ORDER BY p.rating DESC, p.reviews_count DESC';
    else if (sort === 'newest') orderClause = 'ORDER BY p.id DESC';

    return { whereClause, params, orderClause };
  }

  /**
   * Find products for admin list view.
   * @param {object} [filters={}]
   * @param {number} [limit=20]
   * @param {number} [offset=0]
   * @returns {Array}
   */
  async findAdminList(filters = {}, limit = 20, offset = 0) {
    const { querySql, params } = this._buildAdminQuery(filters);
    const fullQuery = querySql + ' ORDER BY p.id DESC LIMIT ? OFFSET ?';
    return await this.db.prepare(fullQuery).all(...params, limit, offset);
  }

  /**
   * Count products for admin list view.
   * @param {object} [filters={}]
   * @returns {number}
   */
  async countAdminList(filters = {}) {
    const { querySql, params } = this._buildAdminQuery(filters);
    const countSql = 'SELECT COUNT(*) as c FROM (' + querySql + ')';
    return (await this.db.prepare(countSql).get(...params)).c;
  }

  _buildAdminQuery(filters = {}) {
    const { search, category, department } = filters;
    let querySql = `
      SELECT p.*, c.name_ar as category_name,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) as main_image
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      querySql += ' AND (p.title ILIKE ? OR p.product_id ILIKE ? OR p.sku ILIKE ?)';
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }
    if (category) {
      querySql += ' AND p.category_id = ?';
      params.push(category);
    }
    if (department) {
      querySql += ' AND p.department_id = ?';
      params.push(department);
    }

    return { querySql, params };
  }

  /**
   * Find frame products for admin selection page.
   * @returns {Array}
   */
  async findAdminFrameList() {
    return await this.db.prepare(`
      SELECT p.id, p.product_id, p.title, p.price, p.old_price, p.is_active,
             c.name_ar as category_name,
             (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.id DESC
    `).all();
  }

  /**
   * Find frame deals / marquee products.
   * @param {Array<number|string>} [selectedIds=[]]
   * @returns {Array}
   */
  async findFrameDeals(selectedIds = []) {
    let products = [];
    if (selectedIds && selectedIds.length > 0) {
      const placeholders = selectedIds.map(() => '?').join(',');
      products = await this.db.prepare(`
        SELECT p.id, p.product_id, p.title, p.price, p.old_price, p.discount_percentage,
               c.name_ar as category_name,
               (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE CAST(p.id AS TEXT) IN (${placeholders}) OR p.product_id IN (${placeholders})
        LIMIT 20
      `).all(...selectedIds, ...selectedIds);
    }

    if (!products || products.length < 5) {
      products = await this.db.prepare(`
        SELECT p.id, p.product_id, p.title, p.price, p.old_price, p.discount_percentage,
               c.name_ar as category_name,
               (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)
        ORDER BY RANDOM()
        LIMIT 20
      `).all();
    }

    return products;
  }

  /**
   * Atomic sync create product with images, specs, faqs, and colors.
   * @param {object} productData
   * @param {Array} [images=[]]
   * @param {Array} [specs=[]]
   * @param {Array} [faqs=[]]
   * @param {Array} [colors=[]]
   * @returns {number} Created product ID
   */
  async create(productData, images = [], specs = [], faqs = [], colors = []) {
    const tx = this.db.transaction(async function() {
      const prodCode = productData.product_id ? String(productData.product_id).trim() : ('P-' + Date.now());

      const insert = this.db.prepare(`
        INSERT INTO products (
          product_id, category_id, department_id, subcategory_id,
          title, description, short_description, price, old_price,
          sku, barcode, tags, keywords, seo_title, seo_description, seo_keywords,
          brand, origin, warranty, shipping, delivery_time, installation,
          weight, video, is_new, is_best_seller, is_active, stock_status,
          stock_quantity, sort_order, delivery_policy_type, delivery_fixed_fee_sar,
          requires_installation, installation_fee_sar, created_at, updated_at
        ) VALUES (
          @product_id, @category_id, @department_id, @subcategory_id,
          @title, @description, @short_description, @price, @old_price,
          @sku, @barcode, @tags, @keywords, @seo_title, @seo_description, @seo_keywords,
          @brand, @origin, @warranty, @shipping, @delivery_time, @installation,
          @weight, @video, @is_new, @is_best_seller, @is_active, @stock_status,
          @stock_quantity, @sort_order, @delivery_policy_type, @delivery_fixed_fee_sar,
          @requires_installation, @installation_fee_sar, NOW(), NOW()
        )
      `);

      const res = await insert.run({
        product_id: prodCode,
        category_id: productData.category_id || null,
        department_id: productData.department_id || null,
        subcategory_id: productData.subcategory_id || null,
        title: productData.title || productData.name_ar || 'منتج جديد',
        description: productData.description || productData.description_ar || '',
        short_description: productData.short_description || '',
        price: Number(productData.price) || 0,
        old_price: productData.old_price ? Number(productData.old_price) : null,
        sku: productData.sku || '',
        barcode: productData.barcode || '',
        tags: productData.tags || '',
        keywords: productData.keywords || '',
        seo_title: productData.seo_title || '',
        seo_description: productData.seo_description || '',
        seo_keywords: productData.seo_keywords || '',
        brand: productData.brand || '',
        origin: productData.origin || '',
        warranty: productData.warranty || '',
        shipping: productData.shipping || '',
        delivery_time: productData.delivery_time || '',
        installation: productData.installation ? 1 : 0,
        weight: productData.weight || '',
        video: productData.video || '',
        is_new: productData.is_new ? 1 : 0,
        is_best_seller: productData.is_best_seller ? 1 : 0,
        is_active: productData.is_active !== undefined ? (productData.is_active ? 1 : 0) : 1,
        stock_status: productData.stock_status || 'in_stock',
        stock_quantity: productData.stock_quantity !== undefined ? Number(productData.stock_quantity) : 10,
        sort_order: productData.sort_order ? Number(productData.sort_order) : 0,
        delivery_policy_type: productData.delivery_policy_type || 'default',
        delivery_fixed_fee_sar: Number(productData.delivery_fixed_fee_sar || 0),
        requires_installation: productData.requires_installation ? 1 : 0,
        installation_fee_sar: Number(productData.installation_fee_sar || 0)
      });

      const newId = res.lastInsertRowid;

      // Insert images
      if (images && images.length > 0) {
        const insertImg = this.db.prepare(`
          INSERT INTO product_images (product_id, image_path, is_primary, sort_order)
          VALUES (?, ?, ?, ?)
        `);
        for (let idx = 0; idx < (images || []).length; idx++) {
          const img = images[idx];
          const imgPath = typeof img === 'string' ? img : img.image_path;
          const isPrimary = typeof img === 'object' && img.is_primary !== undefined ? (img.is_primary ? 1 : 0) : (idx === 0 ? 1 : 0);
          await insertImg.run(newId, imgPath, isPrimary, idx);
        }
      }

      // Insert specs
      if (specs && specs.length > 0) {
        const insertSpec = this.db.prepare('INSERT INTO product_specs (product_id, label, value, sort_order) VALUES (?, ?, ?, ?)');
        for (let idx = 0; idx < (specs || []).length; idx++) {
          const s = specs[idx];
          if (s.label && s.value) await insertSpec.run(newId, s.label, s.value, idx);
        }
      }

      // Insert FAQs
      if (faqs && faqs.length > 0) {
        const insertFaq = this.db.prepare('INSERT INTO product_faq (product_id, question, answer, sort_order) VALUES (?, ?, ?, ?)');
        for (let idx = 0; idx < (faqs || []).length; idx++) {
          const f = faqs[idx];
          const q = f.q || f.question;
          const a = f.a || f.answer;
          if (q && a) await insertFaq.run(newId, q, a, idx);
        }
      }

      // Insert colors
      if (colors && colors.length > 0) {
        const insertColor = this.db.prepare('INSERT INTO product_colors (product_id, name, hex) VALUES (?, ?, ?)');
        for (const c of (colors || [])) {
          if (c.name || c.hex) await insertColor.run(newId, c.name || '', c.hex || '#000000');
        }
      }

      return newId;
    });

    return await tx();
  }

  /**
   * Atomic sync update product with images, specs, faqs, and colors.
   * @param {number|string} id
   * @param {object} productData
   * @param {Array|null} [newImages=null]
   * @param {Array|null} [specs=null]
   * @param {Array|null} [faqs=null]
   * @param {Array|null} [colors=null]
   * @returns {boolean}
   */
  async update(id, productData, newImages = null, specs = null, faqs = null, colors = null) {
    const tx = this.db.transaction(async function() {
      const existing = await this.db.prepare('SELECT id FROM products WHERE id = ?').get(id);
      if (!existing) throw new Error(`Product not found: ${id}`);

      const updateStmt = this.db.prepare(`
        UPDATE products SET
          category_id = COALESCE(@category_id, category_id),
          department_id = COALESCE(@department_id, department_id),
          subcategory_id = COALESCE(@subcategory_id, subcategory_id),
          title = COALESCE(@title, title),
          description = COALESCE(@description, description),
          short_description = COALESCE(@short_description, short_description),
          price = COALESCE(@price, price),
          old_price = @old_price,
          sku = COALESCE(@sku, sku),
          brand = COALESCE(@brand, brand),
          origin = COALESCE(@origin, origin),
          warranty = COALESCE(@warranty, warranty),
          shipping = COALESCE(@shipping, shipping),
          delivery_time = COALESCE(@delivery_time, delivery_time),
          installation = COALESCE(@installation, installation),
          weight = COALESCE(@weight, weight),
          video = COALESCE(@video, video),
          is_new = COALESCE(@is_new, is_new),
          is_best_seller = COALESCE(@is_best_seller, is_best_seller),
          is_active = COALESCE(@is_active, is_active),
          stock_status = COALESCE(@stock_status, stock_status),
          stock_quantity = COALESCE(@stock_quantity, stock_quantity),
          sort_order = COALESCE(@sort_order, sort_order),
          delivery_policy_type = COALESCE(@delivery_policy_type, delivery_policy_type),
          delivery_fixed_fee_sar = COALESCE(@delivery_fixed_fee_sar, delivery_fixed_fee_sar),
          requires_installation = COALESCE(@requires_installation, requires_installation),
          installation_fee_sar = COALESCE(@installation_fee_sar, installation_fee_sar),
          barcode = COALESCE(@barcode, barcode),
          tags = COALESCE(@tags, tags),
          keywords = COALESCE(@keywords, keywords),
          seo_title = COALESCE(@seo_title, seo_title),
          seo_description = COALESCE(@seo_description, seo_description),
          seo_keywords = COALESCE(@seo_keywords, seo_keywords),
          updated_at = NOW()
        WHERE id = @id
      `);

      await updateStmt.run({
        id,
        category_id: productData.category_id,
        department_id: productData.department_id,
        subcategory_id: productData.subcategory_id,
        title: productData.title || productData.name_ar,
        description: productData.description || productData.description_ar,
        short_description: productData.short_description,
        price: productData.price !== undefined ? Number(productData.price) : undefined,
        old_price: productData.old_price !== undefined ? (productData.old_price ? Number(productData.old_price) : null) : undefined,
        sku: productData.sku,
        brand: productData.brand,
        origin: productData.origin,
        warranty: productData.warranty,
        shipping: productData.shipping,
        delivery_time: productData.delivery_time,
        installation: productData.installation !== undefined ? (productData.installation ? 1 : 0) : undefined,
        weight: productData.weight,
        video: productData.video,
        is_new: productData.is_new !== undefined ? (productData.is_new ? 1 : 0) : undefined,
        is_best_seller: productData.is_best_seller !== undefined ? (productData.is_best_seller ? 1 : 0) : undefined,
        is_active: productData.is_active !== undefined ? (productData.is_active ? 1 : 0) : undefined,
        stock_status: productData.stock_status,
        stock_quantity: productData.stock_quantity !== undefined ? Number(productData.stock_quantity) : undefined,
        sort_order: productData.sort_order !== undefined ? Number(productData.sort_order) : undefined,
        delivery_policy_type: productData.delivery_policy_type,
        delivery_fixed_fee_sar: productData.delivery_fixed_fee_sar !== undefined ? Number(productData.delivery_fixed_fee_sar) : undefined,
        requires_installation: productData.requires_installation !== undefined ? (productData.requires_installation ? 1 : 0) : undefined,
        installation_fee_sar: productData.installation_fee_sar !== undefined ? Number(productData.installation_fee_sar) : undefined,
        barcode: productData.barcode,
        tags: productData.tags,
        keywords: productData.keywords,
        seo_title: productData.seo_title,
        seo_description: productData.seo_description,
        seo_keywords: productData.seo_keywords
      });

      if (newImages && Array.isArray(newImages)) {
        await this.db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id);
        const insertImg = this.db.prepare('INSERT INTO product_images (product_id, image_path, is_primary, sort_order) VALUES (?, ?, ?, ?)');
        for (let idx = 0; idx < (newImages || []).length; idx++) {
          const img = newImages[idx];
          const imgPath = typeof img === 'string' ? img : img.image_path;
          const isPrimary = typeof img === 'object' && img.is_primary !== undefined ? (img.is_primary ? 1 : 0) : (idx === 0 ? 1 : 0);
          await insertImg.run(id, imgPath, isPrimary, idx);
        }
      }

      if (specs && Array.isArray(specs)) {
        await this.db.prepare('DELETE FROM product_specs WHERE product_id = ?').run(id);
        const insertSpec = this.db.prepare('INSERT INTO product_specs (product_id, label, value, sort_order) VALUES (?, ?, ?, ?)');
        for (let idx = 0; idx < (specs || []).length; idx++) {
          const s = specs[idx];
          if (s.label && s.value) await insertSpec.run(id, s.label, s.value, idx);
        }
      }

      if (faqs && Array.isArray(faqs)) {
        await this.db.prepare('DELETE FROM product_faq WHERE product_id = ?').run(id);
        const insertFaq = this.db.prepare('INSERT INTO product_faq (product_id, question, answer, sort_order) VALUES (?, ?, ?, ?)');
        for (let idx = 0; idx < (faqs || []).length; idx++) {
          const f = faqs[idx];
          const q = f.q || f.question;
          const a = f.a || f.answer;
          if (q && a) await insertFaq.run(id, q, a, idx);
        }
      }

      if (colors && Array.isArray(colors)) {
        await this.db.prepare('DELETE FROM product_colors WHERE product_id = ?').run(id);
        const insertColor = this.db.prepare('INSERT INTO product_colors (product_id, name, hex) VALUES (?, ?, ?)');
        for (const c of (colors || [])) {
          if (c.name || c.hex) await insertColor.run(id, c.name || '', c.hex || '#000000');
        }
      }
    });

    await tx();
    return true;
  }

  /**
   * Add a single image to a product.
   * @param {number|string} productId
   * @param {string} imagePath
   * @param {number} [sortOrder=0]
   * @param {number} [isPrimary=0]
   * @returns {import('better-sqlite3').RunResult}
   */
  async addImage(productId, imagePath, sortOrder = 0, isPrimary = 0) {
    return await this.db.prepare('INSERT INTO product_images (product_id, image_path, sort_order, is_primary) VALUES (?, ?, ?, ?)').run(
      productId, imagePath, sortOrder, isPrimary ? 1 : 0
    );
  }

  /**
   * Atomically lock and decrement a product's stock_quantity, intended to be
   * called with a repo instance bound to an open order-creation transaction
   * (so the row lock is held for the duration of that transaction, not
   * released early). Clamps at 0 rather than rejecting the order outright --
   * stock_quantity is not reliably maintained for every product in this
   * catalog (many rely on stock_status instead), so a hard block here would
   * risk rejecting legitimate orders. This still fixes the real bug: without
   * FOR UPDATE, two concurrent orders for the last unit could both read the
   * same quantity and both succeed, silently overselling.
   * @param {number|string} productId
   * @param {number} qty
   * @returns {{ previousQuantity: number|null, newQuantity: number|null }}
   */
  async decrementStockLocked(productId, qty) {
    const row = await this.db.prepare('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE').get(productId);
    if (!row || row.stock_quantity === null || row.stock_quantity === undefined) {
      return { previousQuantity: null, newQuantity: null };
    }
    const previousQuantity = Number(row.stock_quantity);
    const updated = await this.db.prepare(
      'UPDATE products SET stock_quantity = GREATEST(stock_quantity - ?, 0), updated_at = NOW() WHERE id = ? RETURNING stock_quantity'
    ).get(qty, productId);
    return { previousQuantity, newQuantity: updated ? Number(updated.stock_quantity) : null };
  }

  /**
   * Set primary image for a product.
   * @param {number|string} productId
   * @param {number|string} imageId
   * @returns {boolean}
   */
  async setPrimaryImage(productId, imageId) {
    const tx = this.db.transaction(async function() {
      await this.db.prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?').run(productId);
      const res = await this.db.prepare('UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?').run(imageId, productId);
      if (res.changes === 0) {
        throw new Error(`Image ${imageId} not found for product ${productId}`);
      }
    });
    await tx();
    return true;
  }

  /**
   * Delete an image from product_images and promote next image to primary if needed.
   * @param {number|string} productId
   * @param {number|string} imageId
   * @returns {object|null} Deleted image row (for file system cleanup)
   */
  async deleteImage(productId, imageId) {
    let deletedImg = null;
    const tx = this.db.transaction(async function() {
      deletedImg = await this.db.prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(imageId, productId);
      if (!deletedImg) throw new Error(`Image ${imageId} not found for product ${productId}`);

      await this.db.prepare('DELETE FROM product_images WHERE id = ? AND product_id = ?').run(imageId, productId);

      if (deletedImg.is_primary === true || deletedImg.is_primary === 1) {
        const remaining = await this.db.prepare('SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1').get(productId);
        if (remaining) {
          await this.db.prepare('UPDATE product_images SET is_primary = 1 WHERE id = ?').run(remaining.id);
        }
      }
    });

    await tx();
    return deletedImg;
  }

  /**
   * Soft-delete/archive a product.
   * @param {number|string} id
   * @returns {boolean}
   */
  async archive(id) {
    const tx = this.db.transaction(async function() {
      await this.db.prepare("UPDATE products SET is_archived = 1, is_active = 0, updated_at = NOW() WHERE id = ?").run(id);
    });
    await tx();
    return true;
  }

  /**
   * Hard delete product and child records.
   * @param {number|string} id
   * @returns {Array<object>} List of image paths before deletion (for file cleanup)
   */
  async hardDelete(id) {
    let images = [];
    const tx = this.db.transaction(async function() {
      images = await this.db.prepare('SELECT image_path FROM product_images WHERE product_id = ?').all(id);
      await this.db.prepare('DELETE FROM product_specs WHERE product_id = ?').run(id);
      await this.db.prepare('DELETE FROM product_faq WHERE product_id = ?').run(id);
      await this.db.prepare('DELETE FROM product_colors WHERE product_id = ?').run(id);
      await this.db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id);
      await this.db.prepare('DELETE FROM products WHERE id = ?').run(id);
    });
    await tx();
    return images;
  }

  /**
   * Check stock for availability.
   * @param {number|string} productId
   * @returns {object|undefined}
   */
  async checkStock(productId) {
    return await this.db.prepare(
      'SELECT id, is_active, stock_status, stock_quantity FROM products WHERE CAST(id AS TEXT) = ? OR product_id = ?'
    ).get(productId, String(productId));
  }

  /**
   * Find active products for cache verification.
   * @returns {Array}
   */
  async findActiveForCache() {
    return await this.db.prepare(`
      SELECT id, product_id, title, price, is_active,
             (SELECT image_path FROM product_images WHERE product_id = products.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products
      WHERE is_active = 1 AND (is_archived = 0 OR is_archived IS NULL)
    `).all();
  }

  /**
   * Find all active products with full sub-records for frontend cache generation.
   * @returns {Array<object>}
   */
  async findAllActiveForSync() {
    // COALESCE(p.department_id, c.department_id): the product's own department
    // wins when set, otherwise it is derived from its category. 435 of 437
    // rows have a NULL department_id but a valid category, so without the
    // fallback almost every product would reach the storefront with no
    // department and could never be listed on a department page.
    const products = (await this.db.prepare(`
      SELECT p.*,
             c.slug        AS category_slug,
             c.name_ar     AS category_name,
             c.code        AS category_code,
             COALESCE(p.department_id, c.department_id) AS resolved_department_id,
             d.slug        AS department_slug,
             d.name_ar     AS department_name
      FROM products p
      LEFT JOIN categories c   ON p.category_id = c.id
      LEFT JOIN departments d  ON d.id = COALESCE(p.department_id, c.department_id)
      WHERE p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)
      ORDER BY p.sort_order ASC, p.id DESC
    `).all()) || [];
    if (products.length === 0) return [];

    const allImages = (await this.db.prepare('SELECT id, product_id, image_path, is_primary, sort_order, color_name FROM product_images ORDER BY is_primary DESC, sort_order ASC, id ASC').all()) || [];
    const allSizes = (await this.db.prepare('SELECT product_id, label, price FROM product_sizes WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC').all()) || [];
    const allSpecs = (await this.db.prepare('SELECT product_id, label, value FROM product_specs ORDER BY sort_order ASC').all()) || [];
    const allFaqs = (await this.db.prepare('SELECT product_id, question as q, answer as a FROM product_faq ORDER BY sort_order ASC').all()) || [];
    const allColors = (await this.db.prepare('SELECT product_id, name, hex FROM product_colors').all()) || [];

    const imageMap = new Map();
    for (const img of allImages) {
      if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, []);
      imageMap.get(img.product_id).push(img);
    }

    const specMap = new Map();
    for (const s of allSpecs) {
      if (!specMap.has(s.product_id)) specMap.set(s.product_id, []);
      specMap.get(s.product_id).push(s);
    }

    const faqMap = new Map();
    for (const f of allFaqs) {
      if (!faqMap.has(f.product_id)) faqMap.set(f.product_id, []);
      faqMap.get(f.product_id).push(f);
    }

    const colorMap = new Map();
    for (const c of allColors) {
      if (!colorMap.has(c.product_id)) colorMap.set(c.product_id, []);
      colorMap.get(c.product_id).push(c);
    }

    const sizeMap = new Map();
    for (const s of allSizes) {
      if (!sizeMap.has(s.product_id)) sizeMap.set(s.product_id, []);
      sizeMap.get(s.product_id).push({ label: s.label, price: Number(s.price) });
    }

    return products.map(p => ({
      ...p,
      images: imageMap.get(p.id) || [],
      specs: specMap.get(p.id) || [],
      faq: faqMap.get(p.id) || [],
      colors: colorMap.get(p.id) || [],
      // Empty for every product that has none, which is all of them until an
      // operator adds sizes. The storefront shows no size picker in that case.
      sizes: sizeMap.get(p.id) || []
    }));
  }

  /**
   * Find all active products for sitemap generation.
   * @returns {Array<{id: number, product_id: string, title: string, updated_at: string, created_at: string}>}
   */
  async findForSitemap() {
    return await this.db.prepare('SELECT id, product_id, title, updated_at, created_at FROM products WHERE is_active = 1 AND (is_archived = 0 OR is_archived IS NULL) ORDER BY id DESC').all();
  }

  /**
   * Find all product image records for audit & repair.
   * @returns {Array<object>}
   */
  async findAllImageRecords() {
    return await this.db.prepare('SELECT id, product_id, image_path, sort_order, is_primary FROM product_images').all();
  }

  /**
   * Update a specific image path in product_images.
   * @param {number|string} imageId
   * @param {string} newPath
   * @returns {boolean}
   */
  async updateImagePath(imageId, newPath) {
    const res = await this.db.prepare('UPDATE product_images SET image_path = ? WHERE id = ?').run(newPath, imageId);
    return res.changes > 0;
  }

  /**
   * Ensures every product with images has at least one primary image.
   * @returns {number} Number of products fixed
   */
  async ensurePrimaryImages() {
    let fixed = 0;
    const tx = this.db.transaction(async function() {
      const products = await this.db.prepare('SELECT id FROM products').all();
      for (const p of products) {
        const pImages = await this.db.prepare('SELECT id, is_primary FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC, id ASC').all(p.id);
        if (pImages.length > 0) {
          const hasPrimary = pImages.some(img => img.is_primary === true || img.is_primary === 1);
          if (!hasPrimary) {
            await this.db.prepare('UPDATE product_images SET is_primary = 1 WHERE id = ?').run(pImages[0].id);
            fixed++;
          }
        }
      }
    });
    await tx();
    return fixed;
  }

  /**
   * Atomically imports a list of products with their images, specs, faqs, colors.
   * Runs in a single ACID transaction with full rollback on error.
   * @param {Array<object>} productsList
   * @param {Record<string, any>} categoryMap
   * @returns {{ imported: number, skipped: number }}
   */
  async importProductsBatch(productsList = [], categoryMap = {}) {
    let imported = 0;
    let skipped = 0;

    const tx = this.db.transaction(async function() {
      const insertProduct = this.db.prepare(`
        INSERT INTO products (
          product_id, category_id, title, description, price, old_price,
          sku, brand, origin, warranty, shipping, delivery_time,
          installation, weight, video, rating, reviews_count,
          is_new, is_best_seller, stock_status
        ) VALUES (
          @product_id, @category_id, @title, @description, @price, @old_price,
          @sku, @brand, @origin, @warranty, @shipping, @delivery_time,
          @installation, @weight, @video, @rating, @reviews_count,
          @is_new, @is_best_seller, @stock_status
        )
      `);

      const insertImage = this.db.prepare(`
        INSERT INTO product_images (product_id, image_path, sort_order, is_primary)
        VALUES (?, ?, ?, ?)
      `);

      const insertSpec = this.db.prepare(`
        INSERT INTO product_specs (product_id, label, value, sort_order)
        VALUES (?, ?, ?, ?)
      `);

      const insertFaq = this.db.prepare(`
        INSERT INTO product_faq (product_id, question, answer, sort_order)
        VALUES (?, ?, ?, ?)
      `);

      const insertColor = this.db.prepare(`
        INSERT INTO product_colors (product_id, name, hex)
        VALUES (?, ?, ?)
      `);

      for (const p of productsList) {
        const prefix = (p.id || '').split('-')[0];
        const categoryId = categoryMap[prefix] || categoryMap['gen'] || null;

        const result = await insertProduct.run({
          product_id: p.id || `gen-${imported + 1}`,
          category_id: categoryId,
          title: p.title || 'منتج بدون عنوان',
          description: p.description || '',
          price: parseFloat(p.price) || 0,
          old_price: p.oldPrice ? parseFloat(p.oldPrice) : null,
          sku: p.sku || '',
          brand: p.brand || '',
          origin: p.origin || '',
          warranty: p.warranty || '',
          shipping: p.shipping || '',
          delivery_time: p.deliveryTime || '',
          installation: p.installation || '',
          weight: p.weight || '',
          video: p.video || '',
          rating: parseFloat(p.rating) || 0,
          reviews_count: parseInt(p.reviewsCount) || 0,
          is_new: p.isNew ? 1 : 0,
          is_best_seller: p.isBestSeller ? 1 : 0,
          stock_status: 'in-stock'
        });

        const dbProductId = result.lastInsertRowid;

        if (Array.isArray(p.gallery)) {
          for (let idx = 0; idx < (p.gallery || []).length; idx++) {
            const img = p.gallery[idx];
            await insertImage.run(dbProductId, img, idx, idx === 0 ? 1 : 0);
          }
        }

        if (Array.isArray(p.specs)) {
          for (let idx = 0; idx < (p.specs || []).length; idx++) {
            const spec = p.specs[idx];
            if (spec.label && spec.value) {
              await insertSpec.run(dbProductId, spec.label, spec.value, idx);
            }
          }
        }

        if (Array.isArray(p.faq)) {
          for (let idx = 0; idx < (p.faq || []).length; idx++) {
            const faq = p.faq[idx];
            if (faq.q && faq.a) {
              await insertFaq.run(dbProductId, faq.q, faq.a, idx);
            }
          }
        }

        if (Array.isArray(p.colors)) {
          for (const color of (p.colors || [])) {
            if (color.name && color.hex) {
              await insertColor.run(dbProductId, color.name, color.hex);
            }
          }
        }

        imported++;
      }
    });

    await tx();
    return { imported, skipped };
  }

  /**
   * Run raw parametric search query for AI hybrid search
   * @param {string} sql
   * @param {Array} params
   * @returns {Array}
   */
  async queryForAiSearch(sql, params = []) {
    return await this.db.prepare(sql).all(...params);
  }

  /**
   * Get featured products for AI recommendations
   * @param {number} limit
   * @returns {Array}
   */
  async getFeaturedRecommendations(limit = 8) {
    return await this.db.prepare(`
      SELECT
        p.id,
        p.product_id,
        p.title,
        p.description,
        p.price,
        p.old_price,
        p.stock_status,
        p.rating,
        p.reviews_count,
        p.is_best_seller,
        c.name_ar as category_name,
        c.slug as category_slug,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
      ORDER BY p.is_best_seller DESC, p.reviews_count DESC, p.rating DESC, p.id DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get complementary products for AI recommendations
   * @param {string|number} productId
   * @param {string} categorySlug
   * @param {number} limit
   * @returns {Array}
   */
  async getComplementaryRecommendations(productId, categorySlug, limit = 4) {
    let sql = `
      SELECT
        p.id, p.product_id, p.title, p.price, p.old_price, p.stock_status, p.rating, p.reviews_count,
        c.name_ar as category_name,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND (p.product_id != ? AND p.id != ?)
    `;
    const params = [String(productId || ''), String(productId || '')];

    if (categorySlug) {
      sql += ` AND c.slug = ?`;
      params.push(categorySlug);
    }

    sql += ` ORDER BY p.is_best_seller DESC, p.reviews_count DESC LIMIT ?`;
    params.push(limit);

    return await this.db.prepare(sql).all(...params);
  }

  /**
   * Find product details for customer tools
   * @param {string|number} pid
   * @returns {object|null}
   */
  async findForCustomerTool(pid) {
    const pStr = String(pid || '');
    const product = await this.db.prepare(`
      SELECT p.*, c.name_ar as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE (p.product_id = ? OR CAST(p.id AS TEXT) = ? OR p.sku = ?) AND p.is_active = 1
    `).get(pStr, pStr, pStr);

    if (!product) return null;

    const images = await this.db.prepare('SELECT image_path FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC').all(product.id);
    const specs = await this.db.prepare('SELECT label, value FROM product_specs WHERE product_id = ? ORDER BY sort_order ASC').all(product.id);
    const faqs = await this.db.prepare('SELECT question, answer FROM product_faq WHERE product_id = ? ORDER BY sort_order ASC').all(product.id);
    const colors = await this.db.prepare('SELECT name, hex FROM product_colors WHERE product_id = ?').all(product.id);

    return { ...product, images, specs, faqs, colors };
  }

  /**
   * Find multiple products for customer tool comparison
   * @param {Array<string|number>} ids
   * @returns {Array}
   */
  async findForComparison(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const products = await this.db.prepare(`
      SELECT p.*, c.name_ar as category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE (p.product_id IN (${placeholders}) OR CAST(p.id AS TEXT) IN (${placeholders})) AND p.is_active = 1
    `).all(...ids, ...ids);

    return Promise.all(products.map(async (p) => {
      const specs = await this.db.prepare('SELECT label, value FROM product_specs WHERE product_id = ?').all(p.id);
      const images = await this.db.prepare('SELECT image_path FROM product_images WHERE product_id = ? ORDER BY is_primary DESC LIMIT 1').all(p.id);
      return { ...p, specs, images };
    }));
  }

  /**
   * Find active products for legacy customer assistant
   * @param {number} [limit=120]
   * @returns {Array}
   */
  async findActiveForCustomerAssistant(limit = 120) {
    return await this.db.prepare(`
      SELECT
        p.id,
        p.product_id,
        p.title,
        p.description,
        p.price,
        p.old_price,
        p.brand,
        p.warranty,
        p.delivery_time,
        p.stock_status,
        p.rating,
        p.reviews_count,
        c.name_ar as category_name,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
      ORDER BY p.is_best_seller DESC, p.reviews_count DESC, p.updated_at DESC
      LIMIT ?
    `).all(Number(limit) || 120);
  }
}

module.exports = PostgresProductRepo;
