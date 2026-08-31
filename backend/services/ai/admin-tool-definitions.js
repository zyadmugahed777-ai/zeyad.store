/**
 * Tool definitions for the Admin AI, in the shape provider.complete({ tools })
 * expects: { name, description, parameters }.
 *
 * Why this file exists: services/ai/tools.js already registers 32 working
 * tools, each with its own permission and audit trail, and 11 of them are
 * write actions that route through proposal() -> confirmation ->
 * executeConfirmedAction(). But the admin chat never exposed any of them to
 * the model. It picked tools with a regex over the user's message
 * (selectTools()), ran them up front, and handed the model their output as
 * flat context. That meant:
 *   - only 11 of the 32 tools were reachable at all,
 *   - every one of those 11 was a read tool, so the assistant could describe
 *     the store but never act on it,
 *   - the model could not choose a tool, pass real arguments, or chain one
 *     call into the next.
 *
 * These schemas let the model call the same registry through runTool(), which
 * still enforces hasAiPermission() per tool and still logs every call. Write
 * tools return a confirmation proposal rather than applying anything, so the
 * "high-risk actions need confirmation" rule is unchanged -- it is enforced in
 * tools.js, not here, and a model cannot talk its way past it.
 *
 * Descriptions are written for the model, in the language it will be reasoning
 * in, and every parameter matches the handler's actual destructuring in
 * tools.js -- verified against each signature rather than assumed.
 */

const READ_TOOLS = [
  {
    name: 'get_store_overview',
    description: 'نظرة عامة على المتجر: مبيعات اليوم، طلبات اليوم، الطلبات المعلقة، إجمالي المنتجات والعملاء. ابدأ بها عند أي سؤال عام عن حالة المتجر.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_sales_summary',
    description: 'ملخص المبيعات والإيرادات خلال فترة محددة.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: "الفترة: 'today' أو '7d' أو '30d' أو '90d'. الافتراضي 30d" }
      }
    }
  },
  {
    name: 'get_top_products',
    description: 'المنتجات الأكثر مبيعاً خلال فترة، مرتبة تنازلياً.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: "'today' أو '7d' أو '30d' أو '90d'" },
        limit: { type: 'number', description: 'عدد المنتجات المطلوبة (الافتراضي 10)' }
      }
    }
  },
  {
    name: 'get_product',
    description: 'تفاصيل منتج واحد بالمعرّف (رقم داخلي أو product_id النصي مثل appl-0001).',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string', description: 'معرّف المنتج' } },
      required: ['productId']
    }
  },
  {
    name: 'search_products',
    description: 'البحث في كتالوج المنتجات بالاسم أو الوصف. استخدمها للعثور على منتج قبل تعديله.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'نص البحث' },
        limit: { type: 'number', description: 'عدد النتائج (الافتراضي 20)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_low_stock_products',
    description: 'المنتجات التي أوشك مخزونها على النفاد ويحتاج انتباه الإدارة.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } }
  },
  {
    name: 'get_products_without_images',
    description: 'المنتجات التي لا تحتوي على أي صورة — تحتاج تحديثاً قبل عرضها للعملاء.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } }
  },
  {
    name: 'get_products_without_prices',
    description: 'المنتجات التي سعرها غير محدد أو صفر — تحتاج مراجعة تسعير.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } }
  },
  {
    name: 'get_orders',
    description: 'قائمة الطلبات مع إمكانية التصفية بالحالة والفترة.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: "حالة الطلب مثل 'pending' أو 'completed'. اتركها فارغة لكل الحالات" },
        period: { type: 'string', description: "'today' أو '7d' أو '30d'" },
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'get_order',
    description: 'تفاصيل طلب واحد بالمعرّف أو رقم الطلب.',
    parameters: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId']
    }
  },
  {
    name: 'get_customer',
    description: 'بيانات عميل واحد بالمعرّف.',
    parameters: {
      type: 'object',
      properties: { customerId: { type: 'string' } },
      required: ['customerId']
    }
  },
  {
    name: 'get_category',
    description: 'تفاصيل قسم واحد بالمعرّف أو الـ slug.',
    parameters: {
      type: 'object',
      properties: { categoryId: { type: 'string' } },
      required: ['categoryId']
    }
  },
  {
    name: 'get_inventory_summary',
    description: 'ملخص حالة المخزون عبر المتجر.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_revenue_summary',
    description: 'ملخص الإيرادات.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_website_statistics',
    description: 'إحصائيات الموقع: عدد المنتجات، الأقسام، الصفحات، الوسائط، العروض.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_search_statistics',
    description: 'إحصائيات عمليات البحث داخل الموقع.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_error_logs',
    description: 'سجل الأخطاء الأخيرة في النظام.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_seo_status',
    description: 'حالة تحسين محركات البحث: الخريطة، الوصف، العناوين.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_page_performance',
    description: 'مؤشرات أداء الصفحات.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_recent_activity',
    description: 'آخر الأنشطة الإدارية المسجلة في النظام.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_customer_requests',
    description: 'قائمة تذاكر العملاء (طلبات التحويل البشري) التي أنشأها نجم. استخدمها عند أي سؤال عن طلبات العملاء أو التذاكر المعلقة أو ما يحتاج رداً.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: "تصفية بالحالة: 'pending' أو 'in_progress' أو 'resolved' أو 'cancelled'. اتركها فارغة للكل" },
        category: { type: 'string', description: 'تصفية بالفئة' },
        search: { type: 'string', description: 'بحث نصي في محتوى الطلبات' },
        limit: { type: 'number', description: 'عدد النتائج (الافتراضي 30)' }
      }
    }
  },
  {
    name: 'get_customer_request_detail',
    description: 'تفاصيل تذكرة عميل واحدة كاملة بالرقم (مثل REQ-2026-7492) أو بالمعرّف الرقمي.',
    parameters: {
      type: 'object',
      properties: { requestId: { type: 'string', description: 'رقم التذكرة أو معرّفها' } },
      required: ['requestId']
    }
  },
  {
    name: 'get_system_status',
    description: 'حالة النظام الصحية: قاعدة البيانات، الخدمات، التخزين.',
    parameters: { type: 'object', properties: {} }
  }
];

/**
 * Write tools. Every one of these returns a CONFIRMATION PROPOSAL -- it does
 * not apply the change. tools.js's proposal() checks writesEnabled() first,
 * records a confirmation row, and writes an audit entry; the change only lands
 * when an administrator confirms it through /api/admin/ai/confirm-action/:id.
 * That is stated in each description so the model represents it honestly to
 * the administrator instead of claiming the work is already done.
 */
const WRITE_TOOLS = [
  {
    name: 'update_product_price',
    description: 'اقتراح تغيير سعر منتج. لا يُنفّذ فوراً — يُنشئ طلب تأكيد يجب أن يوافق عليه المدير.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'معرّف المنتج' },
        price: { type: 'number', description: 'السعر الجديد' }
      },
      required: ['productId', 'price']
    }
  },
  {
    name: 'update_product_stock',
    description: 'اقتراح تعديل كمية/حالة مخزون منتج. يتطلب تأكيد المدير قبل التنفيذ.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        stock_quantity: { type: 'number', description: 'الكمية الجديدة' },
        stock_status: { type: 'string', description: "'in-stock' أو 'out-of-stock'" }
      },
      required: ['productId']
    }
  },
  {
    name: 'update_product_description',
    description: 'اقتراح تعديل وصف منتج. يتطلب تأكيد المدير قبل التنفيذ.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        description: { type: 'string', description: 'الوصف الجديد' }
      },
      required: ['productId', 'description']
    }
  },
  {
    name: 'update_category',
    description: 'اقتراح تعديل قسم (الاسم، الوصف، التفعيل). يتطلب تأكيد المدير.',
    parameters: {
      type: 'object',
      properties: {
        categoryId: { type: 'string' },
        name_ar: { type: 'string' },
        description_ar: { type: 'string' },
        is_active: { type: 'boolean' }
      },
      required: ['categoryId']
    }
  },
  {
    name: 'create_discount',
    description: 'اقتراح إنشاء عرض/خصم جديد. يتطلب تأكيد المدير قبل الإنشاء.',
    parameters: {
      type: 'object',
      properties: {
        title_ar: { type: 'string', description: 'عنوان العرض بالعربية (إلزامي)' },
        discount_type: { type: 'string', description: "'percentage' أو 'fixed'" },
        discount_value: { type: 'number' },
        status: { type: 'string', description: "'draft' أو 'active'" }
      },
      required: ['title_ar']
    }
  },
  {
    name: 'update_discount',
    description: 'اقتراح تعديل عرض قائم. يتطلب تأكيد المدير.',
    parameters: {
      type: 'object',
      properties: {
        offerId: { type: 'string' },
        title_ar: { type: 'string' },
        discount_value: { type: 'number' },
        status: { type: 'string' }
      },
      required: ['offerId']
    }
  },
  {
    name: 'update_store_setting',
    description: 'اقتراح تعديل إعداد عام في المتجر. يتطلب تأكيد المدير. الإعدادات الحساسة (مفاتيح الذكاء الاصطناعي) مرفوضة دائماً.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'مفتاح الإعداد' },
        value: { type: 'string', description: 'القيمة الجديدة' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'create_product',
    description: 'اقتراح إنشاء منتج جديد. يتطلب تأكيد المدير قبل الإنشاء.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'اسم المنتج (إلزامي)' },
        price: { type: 'number' },
        category_id: { type: 'string' },
        is_active: { type: 'boolean' }
      },
      required: ['title']
    }
  },
  {
    name: 'delete_product',
    description: 'اقتراح حذف/أرشفة منتج. إجراء عالي الخطورة — يتطلب تأكيد المدير صراحةً.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId']
    }
  },
  {
    name: 'publish_content',
    description: 'اقتراح نشر محتوى صفحة في نظام إدارة المحتوى. يتطلب تأكيد المدير.',
    parameters: {
      type: 'object',
      properties: { pageId: { type: 'string', description: 'معرّف الصفحة أو الـ slug' } },
      required: ['pageId']
    }
  },
  {
    name: 'update_customer_request',
    description: 'اقتراح تحديث حالة تذكرة عميل وتسجيل ملاحظات الإدارة عليها (ردّ الموظف على الطلب). يتطلب تأكيد المدير قبل التنفيذ.',
    parameters: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'رقم التذكرة أو معرّفها' },
        status: { type: 'string', description: "الحالة الجديدة: 'pending' أو 'in_progress' أو 'resolved' أو 'cancelled'" },
        adminNotes: { type: 'string', description: 'ملاحظات الإدارة / الرد المسجل على التذكرة' }
      },
      required: ['requestId', 'status']
    }
  },
  {
    name: 'update_order_status',
    description: 'اقتراح تغيير حالة طلب. يتطلب تأكيد المدير.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        status: { type: 'string', description: 'الحالة الجديدة' }
      },
      required: ['orderId', 'status']
    }
  }
];

const ADMIN_TOOL_DEFINITIONS = [...READ_TOOLS, ...WRITE_TOOLS];

const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));

module.exports = { ADMIN_TOOL_DEFINITIONS, READ_TOOLS, WRITE_TOOLS, WRITE_TOOL_NAMES };
