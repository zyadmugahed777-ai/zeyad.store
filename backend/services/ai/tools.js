const fs = require('fs');
const path = require('path');
const { getRepositories } = require('../../repositories');
const { listCustomerRequests, getCustomerRequest, updateCustomerRequestStatus } = require('./customer-requests');
const { hasAiPermission, writesEnabled } = require('./permissions');
const { logAiActivity } = require('./activity');

async function getStoreOverview() {
  const repos = getRepositories();
  return await repos.ai.tools.getStoreOverview();
}

async function getSalesSummary({ period = '30d' } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.getSalesSummary({ period });
}

async function getTopProducts({ period = '30d', limit = 10 } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.getTopProducts({ period, limit });
}

async function getProduct({ productId }) {
  const repos = getRepositories();
  return await repos.ai.tools.getProductDetails(productId);
}

async function searchProducts({ query = '', limit = 20 } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.searchProducts({ query, limit });
}

async function getLowStockProducts({ limit = 50 } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.getLowStockProducts({ limit });
}

async function getProductsWithoutImages({ limit = 100 } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.getProductsWithoutImages({ limit });
}

async function getProductsWithoutPrices({ limit = 100 } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.getProductsWithoutPrices({ limit });
}

async function getOrders({ status = '', period = '30d', limit = 30 } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.getOrders({ status, period, limit });
}

async function getOrder({ orderId }) {
  const repos = getRepositories();
  return await repos.ai.tools.getOrderDetails(orderId);
}

async function getCustomer({ customerId }) {
  const repos = getRepositories();
  return await repos.ai.tools.getCustomerDetails(customerId);
}

async function getCategory({ categoryId }) {
  const repos = getRepositories();
  return await repos.ai.tools.getCategoryDetails(categoryId);
}

async function getInventorySummary() {
  const repos = getRepositories();
  return await repos.ai.tools.getInventorySummary();
}

async function getRevenueSummary(args = {}) {
  return await getSalesSummary(args);
}

async function getWebsiteStatistics() {
  const repos = getRepositories();
  return await repos.ai.tools.getWebsiteStatistics();
}

async function getSearchStatistics() {
  const repos = getRepositories();
  return await repos.ai.tools.getSearchStatistics();
}

function getErrorLogs() {
  return {
    available: false,
    message: 'لا يوجد جدول مخصص لأخطاء الموقع أو أخطاء JavaScript في قاعدة البيانات الحالية.',
    errors: []
  };
}

async function getSeoStatus() {
  const repos = getRepositories();
  return await repos.ai.tools.getSeoStatus();
}

function getPagePerformance() {
  return {
    available: false,
    message: 'لا توجد بيانات أداء حقيقية مجمعة من المتصفح أو الخادم حتى الآن.',
    recommendation: 'يمكن إضافة جدول performance_events لاحقًا لتخزين LCP وCLS وطلبات API الفاشلة.'
  };
}

async function getRecentActivity({ limit = 30 } = {}) {
  const repos = getRepositories();
  return await repos.ai.tools.getRecentActivity({ limit });
}

async function getSystemStatus() {
  const repos = getRepositories();
  const databaseOk = await repos.ai.tools.pingDatabase();
  const dbPath = process.env.DB_PATH
    ? path.resolve(__dirname, '..', '..', process.env.DB_PATH)
    : path.join(__dirname, '..', '..', 'db', 'zeyad.db');
  return {
    api: 'ok',
    database: databaseOk ? 'ok' : 'error',
    databaseSizeBytes: fs.existsSync(dbPath) ? fs.statSync(dbPath).size : null,
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  };
}

async function createOperationalTasks() {
  const repos = getRepositories();
  const overview = (await getStoreOverview()) || {};
  const tasks = [];
  if (overview.productsWithoutPrices > 0) {
    tasks.push({ priority: 'high', title: `${overview.productsWithoutPrices} products have missing prices.`, description: 'راجع المنتجات التي لا تحتوي على سعر قبل عرضها للعملاء.', source_tool: 'get_products_without_prices', related_type: 'products' });
  }
  if (overview.pendingOrders > 0) {
    tasks.push({ priority: 'high', title: `${overview.pendingOrders} pending orders need review.`, description: 'راجع الطلبات الجديدة وحدد الحالة المناسبة.', source_tool: 'get_orders', related_type: 'orders' });
  }
  if (overview.productsWithoutImages > 0) {
    tasks.push({ priority: 'medium', title: `${overview.productsWithoutImages} products have no product images.`, description: 'أضف صورًا واضحة للمنتجات لرفع الثقة والتحويل.', source_tool: 'get_products_without_images', related_type: 'products' });
  }

  await repos.ai.createOperationalTasks(tasks);
  return await getTasks();
}

async function getTasks() {
  return await getRepositories().ai.getTasks();
}

async function updateTaskStatus({ taskId, status }) {
  await getRepositories().ai.updateTaskStatus(taskId, status);
  return await getTasks();
}

async function requireReadPermission(permissionKey) {
  if (!(await hasAiPermission(permissionKey))) {
    const error = new Error('هذه الأداة غير مفعلة في صلاحيات الذكاء الاصطناعي.');
    error.status = 403;
    throw error;
  }
}

async function proposal(toolName, args, userId, conversationId, preview) {
  if (!(await writesEnabled())) {
    const error = new Error('إجراءات الكتابة معطلة. الذكاء الاصطناعي يعمل بوضع القراءة فقط.');
    error.status = 403;
    throw error;
  }
  const confirmationId = await getRepositories().ai.createConfirmation(
    conversationId || null,
    userId || null,
    toolName,
    JSON.stringify(args || {})
  );
  await logAiActivity({
    userId,
    action: 'Proposed write action',
    toolName,
    affectedType: preview.affectedType,
    affectedId: preview.affectedId,
    oldValue: preview.oldValue,
    newValue: preview.newValue,
    result: 'pending_confirmation',
    confirmationStatus: 'pending'
  });
  return { confirmationId, ...preview };
}

async function updateProductPrice(args, context = {}) {
  await requireReadPermission('edit_products');
  const product = await getProduct({ productId: args.productId });
  if (!product) throw new Error('المنتج غير موجود.');
  return await proposal('update_product_price', args, context.userId, context.conversationId, {
    action: 'update_product_price',
    affectedType: 'product',
    affectedId: product.id,
    oldValue: { price: product.price },
    newValue: { price: Number(args.price) },
    consequences: 'سيظهر السعر الجديد للعملاء بعد التنفيذ.'
  });
}

async function updateProductStock(args, context = {}) {
  await requireReadPermission('edit_products');
  const product = await getProduct({ productId: args.productId });
  if (!product) throw new Error('المنتج غير موجود.');
  const allowed = ['in_stock', 'in-stock', 'limited', 'limited_stock', 'low_stock', 'out_of_stock', 'out-of-stock'];
  if (!allowed.includes(String(args.stockStatus || ''))) throw new Error('حالة المخزون غير مدعومة.');
  return await proposal('update_product_stock', args, context.userId, context.conversationId, {
    action: 'update_product_stock',
    affectedType: 'product',
    affectedId: product.id,
    oldValue: { stock_status: product.stock_status },
    newValue: { stock_status: args.stockStatus },
    consequences: 'سيتم تغيير حالة توفر المنتج المعروضة للعميل.'
  });
}

async function updateProductDescription(args, context = {}) {
  await requireReadPermission('edit_products');
  const product = await getProduct({ productId: args.productId });
  if (!product) throw new Error('المنتج غير موجود.');
  return await proposal('update_product_description', args, context.userId, context.conversationId, {
    action: 'update_product_description',
    affectedType: 'product',
    affectedId: product.id,
    oldValue: { description: product.description },
    newValue: { description: String(args.description || '').slice(0, 500) },
    consequences: 'سيتم تحديث وصف المنتج في صفحة المنتج.'
  });
}

async function updateCategory(args, context = {}) {
  await requireReadPermission('edit_products');
  const category = await getCategory({ categoryId: args.categoryId });
  if (!category) throw new Error('التصنيف غير موجود.');
  return await proposal('update_category', args, context.userId, context.conversationId, {
    action: 'update_category',
    affectedType: 'category',
    affectedId: category.id,
    oldValue: { name_ar: category.name_ar, description_ar: category.description_ar, is_active: category.is_active },
    newValue: {
      name_ar: args.name_ar || category.name_ar,
      description_ar: args.description_ar ?? category.description_ar,
      is_active: args.is_active ?? category.is_active
    },
    consequences: 'سيتم تعديل بيانات التصنيف التي تظهر في المتجر.'
  });
}

async function createDiscount(args, context = {}) {
  await requireReadPermission('modify_store_settings');
  if (!args.title_ar) throw new Error('عنوان العرض مطلوب.');
  return await proposal('create_discount', args, context.userId, context.conversationId, {
    action: 'create_discount',
    affectedType: 'offer',
    affectedId: 'new',
    oldValue: null,
    newValue: {
      title_ar: args.title_ar,
      discount_type: args.discount_type || 'percentage',
      discount_value: Number(args.discount_value || 0),
      status: args.status || 'draft'
    },
    consequences: 'سيتم إنشاء عرض جديد، ويمكن إبقاؤه كمسودة أو تفعيله حسب الحالة.'
  });
}

async function updateDiscount(args, context = {}) {
  await requireReadPermission('modify_store_settings');
  const repos = getRepositories();
  const offer = await repos.offers.findById(args.offerId);
  if (!offer) throw new Error('العرض غير موجود.');
  return await proposal('update_discount', args, context.userId, context.conversationId, {
    action: 'update_discount',
    affectedType: 'offer',
    affectedId: offer.id,
    oldValue: { title_ar: offer.title_ar, discount_value: offer.discount_value, status: offer.status, is_active: offer.is_active },
    newValue: args,
    consequences: 'سيتم تعديل إعدادات العرض وقد يؤثر ذلك على الأسعار أو الحملات.'
  });
}

async function updateStoreSetting(args, context = {}) {
  await requireReadPermission('modify_store_settings');
  const repos = getRepositories();
  const setting = await repos.settings.findByKey(args.key);
  if (!setting) throw new Error('إعداد المتجر غير موجود.');
  const protectedKeys = new Set(['ai_api_key', 'ai_provider']);
  if (protectedKeys.has(String(args.key))) throw new Error('هذا الإعداد حساس ولا يتم تعديله من أدوات المتجر العامة.');
  return await proposal('update_store_setting', args, context.userId, context.conversationId, {
    action: 'update_store_setting',
    affectedType: 'setting',
    affectedId: args.key,
    oldValue: { value: setting.value },
    newValue: { value: args.value },
    consequences: 'سيتم تغيير إعداد عام في المتجر.'
  });
}

async function createProduct(args, context = {}) {
  await requireReadPermission('create_products');
  if (!args.title) throw new Error('اسم المنتج مطلوب.');
  return await proposal('create_product', args, context.userId, context.conversationId, {
    action: 'create_product',
    affectedType: 'product',
    affectedId: 'new',
    oldValue: null,
    newValue: {
      title: args.title,
      price: Number(args.price || 0),
      category_id: args.category_id || null,
      is_active: args.is_active ? 1 : 0
    },
    consequences: 'سيتم إنشاء منتج جديد بدون صور، لذلك يفضل مراجعته قبل النشر.'
  });
}

async function deleteProduct(args, context = {}) {
  await requireReadPermission('delete_products');
  const product = await getProduct({ productId: args.productId });
  if (!product) throw new Error('المنتج غير موجود.');
  return await proposal('delete_product', args, context.userId, context.conversationId, {
    action: 'delete_product',
    affectedType: 'product',
    affectedId: product.id,
    oldValue: { product_id: product.product_id, title: product.title, price: product.price },
    newValue: null,
    consequences: 'إجراء خطير: سيتم حذف المنتج وصوره ومواصفاته المرتبطة من قاعدة البيانات.'
  });
}

async function publishContent(args, context = {}) {
  await requireReadPermission('modify_store_settings');
  const repos = getRepositories();
  const page = (await repos.cms.getPageBySlug(args.pageId)) || (await repos.cms.getPageById(args.pageId));
  if (!page) throw new Error('الصفحة غير موجودة.');
  return await proposal('publish_content', args, context.userId, context.conversationId, {
    action: 'publish_content',
    affectedType: 'cms_page',
    affectedId: page.id,
    oldValue: { is_active: page.is_active },
    newValue: { is_active: 1 },
    consequences: 'سيتم جعل الصفحة نشطة في نظام إدارة المحتوى.'
  });
}

async function updateOrderStatus(args, context = {}) {
  await requireReadPermission('edit_orders');
  const order = await getOrder({ orderId: args.orderId });
  if (!order) throw new Error('الطلب غير موجود.');
  return await proposal('update_order_status', args, context.userId, context.conversationId, {
    action: 'update_order_status',
    affectedType: 'order',
    affectedId: order.id,
    oldValue: { status: order.status },
    newValue: { status: args.status },
    consequences: 'سيتم تغيير حالة الطلب في لوحة الإدارة.'
  });
}

async function executeConfirmedAction(confirmationId, userId) {
  if (!(await writesEnabled())) {
    const error = new Error('إجراءات الكتابة معطلة. الذكاء الاصطناعي يعمل بوضع القراءة فقط.');
    error.status = 403;
    throw error;
  }
  const repos = getRepositories();
  const confirmation = await repos.ai.getPendingConfirmation(confirmationId);
  if (!confirmation) {
    const error = new Error('طلب التأكيد غير موجود أو تم التعامل معه مسبقًا.');
    error.status = 404;
    throw error;
  }
  // payload is jsonb on PostgreSQL, so the driver hands it back already
  // parsed; it is TEXT on the legacy SQLite path. JSON.parse() on the object
  // stringifies it to "[object Object]" and throws, which meant no confirmed
  // write action could ever be applied. Accept either shape.
  const rawPayload = confirmation.payload;
  const payload = (rawPayload && typeof rawPayload === 'object')
    ? rawPayload
    : JSON.parse(rawPayload || '{}');
  let oldValue = null;
  let newValue = null;
  let affectedType = null;
  let affectedId = null;

  if (confirmation.tool_name === 'update_product_price') {
    if (!(await hasAiPermission('edit_products'))) {
      const error = new Error('صلاحية تعديل المنتجات معطلة.');
      error.status = 403;
      throw error;
    }
    const product = await getProduct({ productId: payload.productId });
    oldValue = { price: product.price };
    newValue = { price: Number(payload.price) };
    affectedType = 'product';
    affectedId = product.id;
    await repos.ai.tools.updateProductPriceDirect(product.id, Number(payload.price));
  } else if (confirmation.tool_name === 'update_product_stock') {
    if (!(await hasAiPermission('edit_products'))) {
      const error = new Error('صلاحية تعديل المنتجات معطلة.');
      error.status = 403;
      throw error;
    }
    const product = await getProduct({ productId: payload.productId });
    oldValue = { stock_status: product.stock_status };
    newValue = { stock_status: payload.stockStatus };
    affectedType = 'product';
    affectedId = product.id;
    await repos.ai.tools.updateProductStockDirect(product.id, payload.stockStatus);
  } else if (confirmation.tool_name === 'update_product_description') {
    if (!(await hasAiPermission('edit_products'))) {
      const error = new Error('صلاحية تعديل المنتجات معطلة.');
      error.status = 403;
      throw error;
    }
    const product = await getProduct({ productId: payload.productId });
    oldValue = { description: product.description };
    newValue = { description: String(payload.description || '') };
    affectedType = 'product';
    affectedId = product.id;
    await repos.ai.tools.updateProductDescriptionDirect(product.id, String(payload.description || ''));
  } else if (confirmation.tool_name === 'update_category') {
    if (!(await hasAiPermission('edit_products'))) {
      const error = new Error('صلاحية تعديل المنتجات معطلة.');
      error.status = 403;
      throw error;
    }
    const category = await getCategory({ categoryId: payload.categoryId });
    oldValue = { name_ar: category.name_ar, description_ar: category.description_ar, is_active: category.is_active };
    newValue = {
      name_ar: payload.name_ar || category.name_ar,
      description_ar: payload.description_ar ?? category.description_ar,
      is_active: payload.is_active === undefined ? category.is_active : Number(Boolean(payload.is_active))
    };
    affectedType = 'category';
    affectedId = category.id;
    await repos.ai.tools.updateCategoryDirect(category.id, newValue.name_ar, newValue.description_ar, newValue.is_active);
  } else if (confirmation.tool_name === 'create_discount') {
    if (!(await hasAiPermission('modify_store_settings'))) {
      const error = new Error('صلاحية تعديل إعدادات المتجر معطلة.');
      error.status = 403;
      throw error;
    }
    const offer = {
      title_ar: String(payload.title_ar || '').trim(),
      title_en: String(payload.title_en || '').trim(),
      description: String(payload.description || '').trim(),
      discount_type: payload.discount_type || 'percentage',
      discount_value: Number(payload.discount_value || 0),
      min_order: payload.min_order ? Number(payload.min_order) : null,
      start_date: payload.start_date || null,
      end_date: payload.end_date || null,
      applicable_categories: payload.applicable_categories || '',
      applicable_products: payload.applicable_products || '',
      is_active: payload.status === 'active' || payload.is_active ? 1 : 0
    };
    const result = await repos.ai.tools.createDiscountDirect(offer);
    oldValue = null;
    newValue = offer;
    affectedType = 'offer';
    affectedId = result.lastInsertRowid;
  } else if (confirmation.tool_name === 'update_discount') {
    if (!(await hasAiPermission('modify_store_settings'))) {
      const error = new Error('صلاحية تعديل إعدادات المتجر معطلة.');
      error.status = 403;
      throw error;
    }
    const offer = await repos.offers.findById(payload.offerId);
    oldValue = { title_ar: offer.title_ar, discount_value: offer.discount_value, status: offer.status, is_active: offer.is_active };
    newValue = {
      title_ar: payload.title_ar || offer.title_ar,
      description: payload.description ?? offer.description,
      discount_value: payload.discount_value === undefined ? offer.discount_value : Number(payload.discount_value),
      is_active: payload.is_active === undefined ? offer.is_active : Number(Boolean(payload.is_active))
    };
    affectedType = 'offer';
    affectedId = offer.id;
    await repos.ai.tools.updateDiscountDirect(offer.id, newValue.title_ar, newValue.description, newValue.discount_value, newValue.is_active);
  } else if (confirmation.tool_name === 'update_customer_request') {
    if (!(await hasAiPermission('edit_customers'))) {
      const error = new Error('صلاحية تعديل بيانات العملاء معطلة.');
      error.status = 403;
      throw error;
    }
    const current = await getCustomerRequest(payload.requestId);
    if (!current) {
      const error = new Error('لا يوجد طلب بهذا الرقم.');
      error.status = 404;
      throw error;
    }
    oldValue = { status: current.status, admin_notes: current.admin_notes || null };
    newValue = { status: payload.status, admin_notes: payload.adminNotes ?? current.admin_notes ?? null };
    affectedType = 'customer_request';
    affectedId = current.id;
    await updateCustomerRequestStatus(payload.requestId, payload.status, payload.adminNotes || '', userId);
  } else if (confirmation.tool_name === 'update_store_setting') {
    if (!(await hasAiPermission('modify_store_settings'))) {
      const error = new Error('صلاحية تعديل إعدادات المتجر معطلة.');
      error.status = 403;
      throw error;
    }
    const setting = await repos.settings.findByKey(payload.key);
    oldValue = { value: setting.value };
    newValue = { value: String(payload.value || '') };
    affectedType = 'setting';
    affectedId = payload.key;
    await repos.settings.upsert(payload.key, newValue.value);
  } else if (confirmation.tool_name === 'create_product') {
    if (!(await hasAiPermission('create_products'))) {
      const error = new Error('صلاحية إنشاء المنتجات معطلة.');
      error.status = 403;
      throw error;
    }
    const product = {
      product_id: payload.product_id || `AI-${Date.now()}`,
      category_id: payload.category_id || null,
      title: String(payload.title || '').trim(),
      description: String(payload.description || '').trim(),
      price: Number(payload.price || 0),
      old_price: payload.old_price ? Number(payload.old_price) : null,
      sku: payload.sku || '',
      brand: payload.brand || '',
      origin: payload.origin || '',
      warranty: payload.warranty || '',
      shipping: payload.shipping || '',
      delivery_time: payload.delivery_time || '',
      stock_status: payload.stock_status || 'in_stock',
      is_active: payload.is_active ? 1 : 0
    };
    const result = await repos.ai.tools.createProductDirect(product);
    oldValue = null;
    newValue = product;
    affectedType = 'product';
    affectedId = result.lastInsertRowid;
  } else if (confirmation.tool_name === 'delete_product') {
    if (!(await hasAiPermission('delete_products'))) {
      const error = new Error('صلاحية حذف المنتجات معطلة.');
      error.status = 403;
      throw error;
    }
    const product = await getProduct({ productId: payload.productId });
    oldValue = { product_id: product.product_id, title: product.title, price: product.price };
    newValue = null;
    affectedType = 'product';
    affectedId = product.id;
    await repos.ai.tools.deleteProductDirect(product.id);
  } else if (confirmation.tool_name === 'publish_content') {
    if (!(await hasAiPermission('modify_store_settings'))) {
      const error = new Error('صلاحية تعديل إعدادات المتجر معطلة.');
      error.status = 403;
      throw error;
    }
    const page = (await repos.cms.getPageBySlug(payload.pageId)) || (await repos.cms.getPageById(payload.pageId));
    oldValue = { is_active: page.is_active };
    newValue = { is_active: 1 };
    affectedType = 'cms_page';
    affectedId = page.id;
    await repos.ai.tools.publishContentDirect(page.id);
  } else if (confirmation.tool_name === 'update_order_status') {
    if (!(await hasAiPermission('edit_orders'))) {
      const error = new Error('صلاحية تعديل الطلبات معطلة.');
      error.status = 403;
      throw error;
    }
    const order = await getOrder({ orderId: payload.orderId });
    oldValue = { status: order.status };
    newValue = { status: payload.status };
    affectedType = 'order';
    affectedId = order.id;
    await repos.ai.tools.updateOrderStatusDirect(order.id, payload.status);
  } else {
    throw new Error('الأداة غير مدعومة للتنفيذ.');
  }

  await repos.ai.confirmAction(confirmationId);

  await logAiActivity({
    userId,
    action: 'Confirmed write action',
    toolName: confirmation.tool_name,
    affectedType,
    affectedId,
    oldValue,
    newValue,
    result: 'success',
    confirmationStatus: 'confirmed'
  });

  return { success: true, toolName: confirmation.tool_name, affectedType, affectedId, oldValue, newValue };
}

/**
 * Customer-request (human handoff) queue -- the tickets Najm opens when a
 * customer needs a person. The assistant previously had no access to this
 * queue at all, so working it was impossible by construction.
 */
async function getCustomerRequests(args = {}) {
  await requireReadPermission('view_customers');
  const requests = await listCustomerRequests({
    status: args.status || null,
    category: args.category || null,
    search: args.search || '',
    limit: Math.min(Number(args.limit) || 30, 100)
  });
  return (requests || []).map((r) => ({
    id: r.id,
    request_id: r.request_id,
    customer_name: r.customer_name,
    phone: r.phone,
    category: r.category,
    status: r.status,
    statusLabel: r.statusLabel,
    request_text: r.request_text,
    admin_notes: r.admin_notes || null,
    created_at: r.created_at
  }));
}

async function getCustomerRequestDetail(args = {}) {
  await requireReadPermission('view_customers');
  if (!args.requestId) throw new Error('معرّف الطلب مطلوب.');
  const found = await getCustomerRequest(args.requestId);
  if (!found) return { success: false, error: 'لا يوجد طلب بهذا الرقم.' };
  return found;
}

async function updateCustomerRequest(args, context = {}) {
  await requireReadPermission('edit_customers');
  if (!args.requestId) throw new Error('معرّف الطلب مطلوب.');
  if (!args.status) throw new Error('الحالة الجديدة مطلوبة.');
  const current = await getCustomerRequest(args.requestId);
  if (!current) throw new Error('لا يوجد طلب بهذا الرقم.');

  return await proposal('update_customer_request', args, context.userId, context.conversationId, {
    action: 'update_customer_request',
    affectedType: 'customer_request',
    affectedId: current.id,
    oldValue: { status: current.status, admin_notes: current.admin_notes || null },
    newValue: { status: args.status, admin_notes: args.adminNotes ?? current.admin_notes ?? null },
    consequences: 'سيتم تحديث حالة تذكرة العميل وملاحظات الإدارة عليها.'
  });
}

const registry = {
  get_store_overview: { permission: 'view_analytics', operation: 'read', handler: getStoreOverview },
  get_customer_requests: { permission: 'view_customers', operation: 'read', handler: getCustomerRequests },
  get_customer_request_detail: { permission: 'view_customers', operation: 'read', handler: getCustomerRequestDetail },
  update_customer_request: { permission: 'edit_customers', operation: 'write', handler: updateCustomerRequest },
  get_sales_summary: { permission: 'view_analytics', operation: 'read', handler: getSalesSummary },
  get_top_products: { permission: 'view_analytics', operation: 'read', handler: getTopProducts },
  get_product: { permission: 'view_products', operation: 'read', handler: getProduct },
  search_products: { permission: 'view_products', operation: 'read', handler: searchProducts },
  get_low_stock_products: { permission: 'view_products', operation: 'read', handler: getLowStockProducts },
  get_products_without_images: { permission: 'view_products', operation: 'read', handler: getProductsWithoutImages },
  get_products_without_prices: { permission: 'view_products', operation: 'read', handler: getProductsWithoutPrices },
  get_orders: { permission: 'view_orders', operation: 'read', handler: getOrders },
  get_order: { permission: 'view_orders', operation: 'read', handler: getOrder },
  get_customer: { permission: 'view_customers', operation: 'read', handler: getCustomer },
  get_category: { permission: 'view_products', operation: 'read', handler: getCategory },
  get_inventory_summary: { permission: 'view_products', operation: 'read', handler: getInventorySummary },
  get_revenue_summary: { permission: 'view_analytics', operation: 'read', handler: getRevenueSummary },
  get_website_statistics: { permission: 'view_analytics', operation: 'read', handler: getWebsiteStatistics },
  get_search_statistics: { permission: 'view_analytics', operation: 'read', handler: getSearchStatistics },
  get_error_logs: { permission: 'view_system_health', operation: 'read', handler: getErrorLogs },
  get_seo_status: { permission: 'view_analytics', operation: 'read', handler: getSeoStatus },
  get_page_performance: { permission: 'view_system_health', operation: 'read', handler: getPagePerformance },
  get_recent_activity: { permission: 'view_analytics', operation: 'read', handler: getRecentActivity },
  get_system_status: { permission: 'view_system_health', operation: 'read', handler: getSystemStatus },
  update_product_price: { permission: 'edit_products', operation: 'write', handler: updateProductPrice },
  update_product_stock: { permission: 'edit_products', operation: 'write', handler: updateProductStock },
  update_product_description: { permission: 'edit_products', operation: 'write', handler: updateProductDescription },
  update_category: { permission: 'edit_products', operation: 'write', handler: updateCategory },
  create_discount: { permission: 'modify_store_settings', operation: 'write', handler: createDiscount },
  update_discount: { permission: 'modify_store_settings', operation: 'write', handler: updateDiscount },
  update_store_setting: { permission: 'modify_store_settings', operation: 'write', handler: updateStoreSetting },
  create_product: { permission: 'create_products', operation: 'write', handler: createProduct },
  delete_product: { permission: 'delete_products', operation: 'write', handler: deleteProduct },
  publish_content: { permission: 'modify_store_settings', operation: 'write', handler: publishContent },
  update_order_status: { permission: 'edit_orders', operation: 'write', handler: updateOrderStatus }
};

async function runTool(toolName, args = {}, context = {}) {
  const tool = registry[toolName];
  if (!tool) {
    const error = new Error('الأداة المطلوبة غير معتمدة.');
    error.status = 400;
    throw error;
  }
  if (!(await hasAiPermission(tool.permission))) {
    const error = new Error('ليست لديك صلاحية تشغيل هذه الأداة.');
    error.status = 403;
    throw error;
  }
  const result = await tool.handler(args, context);
  try {
    await getRepositories().ai.logToolRun({
      conversationId: context.conversationId || null,
      userId: context.userId || null,
      toolName,
      operationType: tool.operation,
      arguments: args,
      resultSummary: result,
      status: 'success'
    });
  } catch (_) {}
  return result;
}

module.exports = {
  registry,
  runTool,
  getStoreOverview,
  getSalesSummary,
  getTopProducts,
  getInventorySummary,
  getWebsiteStatistics,
  getSearchStatistics,
  getErrorLogs,
  getSeoStatus,
  getPagePerformance,
  getRecentActivity,
  getSystemStatus,
  createOperationalTasks,
  getTasks,
  updateTaskStatus,
  executeConfirmedAction,
  getCustomerRequests,
  getCustomerRequestDetail,
  updateCustomerRequest
};
