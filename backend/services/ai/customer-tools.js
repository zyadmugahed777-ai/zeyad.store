const crypto = require('crypto');
const { getRepositories } = require('../../repositories');
const { searchProductsHybrid, getFeaturedRecommendations, getComplementaryRecommendations, normalizeArabicText } = require('./hybrid-search');
const { createCustomerRequest, getCustomerRequest } = require('./customer-requests');
const { logActionAudit } = require('./audit-service');
const { generateOrderId } = require('../../utils/order-number');
const { normalizePhone } = require('../../utils/helpers');

async function getActiveCartId(repos, userId, guestId) {
  if (userId) {
    let cart = await repos.cart.findCartByUserId(userId);
    if (!cart) {
      const id = await repos.cart.createCart(userId, null);
      return id;
    }
    return cart.id;
  } else if (guestId) {
    await repos.cart.ensureGuestSession(guestId);
    let cart = await repos.cart.findCartByGuestId(guestId);
    if (!cart) {
      const id = await repos.cart.createCart(null, guestId);
      return id;
    }
    return cart.id;
  }
  return null;
}

const customerToolsDefinitions = [
  {
    name: 'search_products',
    description: 'ابحث في كتالوج متجر زياد ستور عن المنتجات الحقيقية بناءً على كلمات البحث أو القسم أو الميزانية أو الترتيب (الأرخص، الأعلى تقييماً).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'نص البحث (مثال: غسالة، غرف نوم، كنب مودرن، ألواح طاقة)' },
        category: { type: 'string', description: 'اسم القسم أو التصنيف (مثال: bedrooms, majalis, appliances, kitchens, solar, kids-rooms)' },
        sort_by: { type: 'string', enum: ['cheapest', 'highest_rated', 'newest'], description: 'ترتيب النتائج: cheapest للأرخص، highest_rated للأعلى تقييماً' },
        max_price: { type: 'number', description: 'الحد الأقصى للميزانية بالريال اليمني' },
        min_price: { type: 'number', description: 'الحد الأدنى للسعر بالريال اليمني' }
      }
    }
  },
  {
    name: 'get_product',
    description: 'جلب التفاصيل والمواصفات الكاملة والسعر الحقيقي والصور لمنتج محدد برقم الرمز أو المعرف.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'معرف المنتج أو رمز الـ SKU' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'get_product_details',
    description: 'مرادف لجلب التفاصيل والمواصفات الكاملة لمنتج محدد.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'معرف المنتج أو رمز الـ SKU' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'get_product_price',
    description: 'معرفة السعر الحقيقي الدقيق والخصومات المعتمدة لمنتج بالريال اليمني والريال السعودي.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'معرف المنتج أو رمز الـ SKU' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'check_product_stock',
    description: 'التحقق الحقيقي من توفر المنتج والمخزون وحالة التوفر (متوفر، نفد، طلب مسبق).',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'معرف المنتج أو رمز الـ SKU' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'get_categories',
    description: 'جلب قائمة صالات العرض وأقسام المتجر المتاحة مع عدد المنتجات.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_related_products',
    description: 'اقتراح منتجات تكميلية أو بديلة تناسب منتجاً معيناً أو قسماً محدداً.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'اسم القسم' },
        related_product_id: { type: 'string', description: 'معرف المنتج الأساسي' }
      }
    }
  },
  {
    name: 'get_recommendations',
    description: 'مرادف لاقتراح منتجات مميزة أو تكميلية للعميل.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'اسم القسم' },
        related_product_id: { type: 'string', description: 'معرف المنتج الأساسي' }
      }
    }
  },
  {
    name: 'compare_products',
    description: 'مقارنة دقيقة ومباشرة بين منتجين أو أكثر من حيث السعر والمواصفات والضمان.',
    parameters: {
      type: 'object',
      properties: {
        product_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'قائمة بمعرفات المنتجات للمقارنة بينها'
        }
      },
      required: ['product_ids']
    }
  },
  {
    name: 'get_cart',
    description: 'عرض محتويات سلة التسوق الحالية للعميل وإجمالي المبلغ.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'add_to_cart',
    description: 'إضافة منتج حقيقي إلى سلة تسوق العميل وتحديث السلة في قاعدة البيانات.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'معرف المنتج' },
        quantity: { type: 'number', description: 'الكمية المطلوبة (افتراضي 1)' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'remove_from_cart',
    description: 'إزالة منتج من سلة تسوق العميل.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'معرف المنتج' }
      },
      required: ['product_id']
    }
  },
  {
    name: 'update_cart',
    description: 'تعديل كمية منتج موجود في سلة تسوق العميل.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'معرف المنتج' },
        quantity: { type: 'number', description: 'الكمية الجديدة' }
      },
      required: ['product_id', 'quantity']
    }
  },
  {
    name: 'create_order_request',
    description: 'تجهيز مسودة طلب شراء وعرض الفاتورة على العميل مع إجمالي المبلغ لأخذ موافقته قبل التثبيت.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'اسم العميل' },
        phone: { type: 'string', description: 'رقم هاتف العميل' },
        city: { type: 'string', description: 'المدينة' },
        address: { type: 'string', description: 'تفاصيل العنوان' },
        delivery_method: { type: 'string', description: 'طريقة التوصيل' },
        payment_method: { type: 'string', description: 'طريقة الدفع' }
      },
      required: ['customer_name', 'phone']
    }
  },
  {
    name: 'prepare_order_draft',
    description: 'مرادف لتجهيز مسودة طلب شراء.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'اسم العميل' },
        phone: { type: 'string', description: 'رقم هاتف العميل' },
        city: { type: 'string', description: 'المدينة' },
        address: { type: 'string', description: 'تفاصيل العنوان' },
        delivery_method: { type: 'string', description: 'طريقة التوصيل' },
        payment_method: { type: 'string', description: 'طريقة الدفع' }
      },
      required: ['customer_name', 'phone']
    }
  },
  {
    name: 'confirm_order',
    description: 'التنفيذ النهائي وتثبيت الطلب في قاعدة البيانات بعد موافقة وتأكيد العميل الصريح.',
    parameters: {
      type: 'object',
      properties: {
        draft_token: { type: 'string', description: 'رمز مسودة الطلب المؤكدة' }
      },
      required: ['draft_token']
    }
  },
  {
    name: 'get_order_status',
    description: 'معرفة حالة وتتبع طلب حقيقي في المتجر (يتطلب رقم الطلب ورقم الهاتف المسجل).',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'رقم الطلب' },
        phone: { type: 'string', description: 'رقم هاتف العميل المسجل في الطلب' }
      },
      required: ['order_id', 'phone']
    }
  },
  {
    name: 'track_order',
    description: 'مرادف لتتبع حالة الطلب الحقيقي.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'رقم الطلب' },
        phone: { type: 'string', description: 'رقم الهاتف' }
      },
      required: ['order_id', 'phone']
    }
  },
  {
    name: 'create_customer_request',
    description: 'تسجيل طلب/تذكرة متابعة للإدارة والموظف البشري عند الحاجة لتدخل إداري، منتج غير متوفر، أو عرض خاص.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'اسم العميل' },
        phone: { type: 'string', description: 'رقم الهاتف للتواصل' },
        request_text: { type: 'string', description: 'تفاصيل الطلب أو المشكلة' },
        requested_products: { type: 'string', description: 'المنتجات المطلوبة إن وجدت' },
        quantity: { type: 'number', description: 'الكمية المطلوبة' },
        budget: { type: 'number', description: 'الميزانية المقترحة' },
        najm_notes: { type: 'string', description: 'ملاحظات وتوصية نجم للمالك' },
        priority: { type: 'string', description: 'أولوية الطلب (low, normal, high, urgent)' },
        order_id: { type: 'string', description: 'رقم الطلب المرتبط إن وجد' },
        category: { type: 'string', description: 'فئة الطلب (مبيعات، خاص، صيانة، ضمان، تركيب)' }
      },
      required: ['customer_name', 'phone', 'request_text']
    }
  },
  {
    name: 'get_customer_request',
    description: 'الاستعلام عن حالة تذكرة أو طلب عميل مسجل سابقاً. يتطلب رقم الهاتف المسجل في التذكرة للتحقق من هوية صاحبها.',
    parameters: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'رقم الطلب المعتمد (مثال: REQ-2026-1234)' },
        // The handler enforces this independently -- the schema is only a hint
        // to the model and must never be the security boundary.
        phone: { type: 'string', description: 'رقم هاتف العميل المسجل في التذكرة (إلزامي للتحقق الأمني)' }
      },
      required: ['request_id', 'phone']
    }
  },
  {
    name: 'get_store_information',
    description: 'الحصول على معلومات وسياسات متجر زياد الرسمية (الفروع، أرقام التواصل، الضمان، الشحن، التركيب، طرق الدفع).',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'الموضوع (warranty, shipping, payment, branches, contact, general)' }
      }
    }
  },
  {
    name: 'get_delivery_policy_and_estimate',
    description: 'معرفة سياسة وأسعار التوصيل والتركيب التقديرية الحقيقية من قاعدة بيانات المتجر داخل صنعاء أو المحافظات لأي منتج أو قسم.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'المدينة أو المحافظة (مثال: صنعاء، عدن، تعز، إب)' },
        product_id: { type: 'string', description: 'معرف المنتج أو رمزه إن وجد' },
        category: { type: 'string', description: 'نوع المنتج أو القسم (مثال: bedrooms, appliances, solar)' }
      }
    }
  },
  {
    name: 'get_store_policies',
    description: 'مرادف للحصول على السياسات الرسمية للمتجر.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'موضوع السياسة' }
      }
    }
  }
];

async function executeCustomerTool(name, args = {}, context = {}) {
  const repos = getRepositories();
  const { sessionId, guestId, userId, ipAddress } = context;

  switch (name) {
    case 'search_products': {
      const products = await searchProductsHybrid({
        query: args.query || '',
        categorySlug: args.category || null,
        maxPrice: args.max_price ? Number(args.max_price) : null,
        minPrice: args.min_price ? Number(args.min_price) : null,
        sortBy: args.sort_by || null,
        limit: 8
      });
      const categoryFallback = (products || []).length > 0 && products[0].isCategoryFallback === true;

      return {
        success: true,
        count: (products || []).length,
        // Tells the model these are NOT real category matches -- the
        // category search returned zero rows and this list is a site-wide
        // best-sellers fallback instead. Without this the model has no way
        // to know the difference and can present an unrelated product as if
        // it matched the customer's actual request.
        note: categoryFallback
          ? 'لم يتم العثور على منتجات مطابقة للتصنيف المطلوب تحديداً. القائمة التالية هي أكثر المنتجات مبيعاً في المتجر بشكل عام وقد لا تطابق طلب العميل، وضّح ذلك له صراحة قبل عرضها.'
          : null,
        products: (products || []).map(p => ({
          id: p.product_id || p.id,
          product_id: p.product_id || p.id,
          title: p.title,
          brand: p.brand || 'زياد ستور',
          price: p.price,
          priceFormatted: p.priceFormatted,
          oldPrice: p.old_price,
          oldPriceFormatted: p.oldPriceFormatted,
          discountPercent: p.discountPercent,
          stockStatus: p.stock_status,
          stockStatusAr: p.stockStatusAr,
          rating: p.rating,
          reviewsCount: p.reviews_count,
          mainImage: p.main_image,
          category: p.category_name,
          warranty: p.warranty,
          deliveryTime: p.delivery_time,
          url: p.url
        }))
      };
    }

    case 'get_product':
    case 'get_product_details': {
      const pid = String(args.product_id || '').trim();
      const product = await repos.products.findForCustomerTool(pid);

      if (!product) {
        return { success: false, error: 'المنتج غير موجود أو غير نشط في كتالوج المتجر.' };
      }

      return {
        success: true,
        product: {
          id: product.product_id || product.id,
          internalId: product.id,
          title: product.title,
          description: product.description,
          price: product.price,
          priceFormatted: Number(product.price).toLocaleString('ar-YE') + ' ر.ي',
          oldPrice: product.old_price,
          oldPriceFormatted: product.old_price ? Number(product.old_price).toLocaleString('ar-YE') + ' ر.ي' : null,
          category: product.category_name,
          brand: product.brand,
          stockStatus: product.stock_status,
          quantity: product.stock_quantity,
          warranty: product.warranty,
          deliveryTime: product.delivery_time,
          rating: product.rating,
          reviewsCount: product.reviews_count,
          mainImage: product.images[0]?.image_path || null,
          images: (product.images || []).map(i => i.image_path),
          specs: (product.specs || []).map(s => ({ label: s.label, value: s.value })),
          faqs: (product.faqs || []).map(f => ({ question: f.question, answer: f.answer })),
          colors: (product.colors || []).map(c => ({ name: c.name, hex: c.hex }))
        }
      };
    }

    case 'get_product_price': {
      const pid = String(args.product_id || '').trim();
      const product = await repos.products.findForCustomerTool(pid);

      if (!product) return { success: false, error: 'المنتج غير موجود.' };

      const exRateSetting = await repos.settings.findByKey('exchange_rate_sar_yer');
      const sarRate = exRateSetting ? Number(exRateSetting.value) || 140 : 140;
      const priceSar = (product.price / sarRate).toFixed(1);

      return {
        success: true,
        product_id: product.product_id || product.id,
        title: product.title,
        priceYer: product.price,
        priceYerFormatted: Number(product.price).toLocaleString('ar-YE') + ' ر.ي',
        priceSar: Number(priceSar),
        priceSarFormatted: Number(priceSar).toLocaleString('ar-SA') + ' ر.س',
        oldPrice: product.old_price,
        oldPriceFormatted: product.old_price ? Number(product.old_price).toLocaleString('ar-YE') + ' ر.ي' : null,
        discountPercent: product.old_price ? Math.round(((product.old_price - product.price) / product.old_price) * 100) : 0
      };
    }

    case 'check_product_stock': {
      const pid = String(args.product_id || '').trim();
      const product = await repos.products.findForCustomerTool(pid);

      if (!product) return { success: false, error: 'المنتج غير موجود.' };

      const statusMapAr = {
        in_stock: 'متوفر وجاهز للتسليم الفوري',
        'in-stock': 'متوفر وجاهز للتسليم الفوري',
        out_of_stock: 'نفدت الكمية حالياً',
        'out-of-stock': 'نفدت الكمية حالياً',
        pre_order: 'متاح للطلب المسبق والتصنيع'
      };

      return {
        success: true,
        product_id: product.product_id || product.id,
        title: product.title,
        stockStatus: product.stock_status,
        stockStatusAr: statusMapAr[product.stock_status] || product.stock_status,
        availableQuantity: product.stock_quantity,
        deliveryTime: product.delivery_time || 'من 24 إلى 48 ساعة'
      };
    }

    case 'get_categories': {
      const categories = await repos.categories.findActiveWithProductCounts();

      return {
        success: true,
        count: (categories || []).length,
        categories: (categories || []).map(c => ({
          id: c.id,
          name: c.name_ar,
          slug: c.slug,
          productCount: c.product_count,
          image: c.image
        }))
      };
    }

    case 'get_related_products':
    case 'get_recommendations': {
      const catSlug = args.category || null;
      const relatedId = args.related_product_id || null;

      let products = [];
      if (relatedId) {
        products = await getComplementaryRecommendations(relatedId, 4);
      } else {
        products = await getFeaturedRecommendations(6);
      }

      return {
        success: true,
        count: products.length,
        products: products.map(p => ({
          id: p.product_id || p.id,
          title: p.title,
          price: p.price,
          priceFormatted: p.priceFormatted,
          oldPrice: p.old_price,
          oldPriceFormatted: p.oldPriceFormatted,
          stockStatus: p.stock_status,
          mainImage: p.main_image,
          category: p.category_name
        }))
      };
    }

    case 'compare_products': {
      const ids = Array.isArray(args.product_ids) ? args.product_ids : [];
      if (ids.length < 2) return { success: false, error: 'يرجى تحديد معرفين على الأقل للمقارنة.' };

      const products = await repos.products.findForComparison(ids);

      const comparison = (products || []).map(p => {
        return {
          id: p.product_id || p.id,
          title: p.title,
          price: p.price,
          priceFormatted: Number(p.price).toLocaleString('ar-YE') + ' ر.ي',
          oldPrice: p.old_price,
          category: p.category_name,
          warranty: p.warranty,
          deliveryTime: p.delivery_time,
          stockStatus: p.stock_status,
          mainImage: p.images[0]?.image_path || null,
          specs: (p.specs || []).map(s => `${s.label}: ${s.value}`).join(' | ')
        };
      });

      return { success: true, count: comparison.length, items: comparison };
    }

    case 'get_cart': {
      const cartId = await getActiveCartId(repos, userId, guestId);
      if (!cartId) return { success: true, count: 0, items: [], subtotal: 0, formattedSubtotal: '0 ر.ي' };

      const items = await repos.cart.findCartItems(cartId);
      const subtotal = (items || []).reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);

      return {
        success: true,
        count: items.reduce((s, i) => s + i.quantity, 0),
        items: items.map(i => ({
          id: i.stored_product_id,
          code: i.product_id,
          title: i.title,
          quantity: i.quantity,
          unitPrice: i.price,
          totalPrice: i.price * i.quantity,
          formattedUnitPrice: Number(i.price).toLocaleString('ar-YE') + ' ر.ي',
          formattedTotalPrice: Number(i.price * i.quantity).toLocaleString('ar-YE') + ' ر.ي',
          mainImage: i.main_image
        })),
        subtotal,
        formattedSubtotal: Number(subtotal).toLocaleString('ar-YE') + ' ر.ي', totalFormatted: Number(subtotal).toLocaleString('ar-YE') + ' ر.ي'
      };
    }

    case 'add_to_cart': {
      const pid = String(args.product_id || '').trim();
      const qty = Math.max(1, Math.min(Number(args.quantity) || 1, 50));
      const cartId = await getActiveCartId(repos, userId, guestId);

      const product = await repos.products.findForCustomerTool(pid);

      if (!product) return { success: false, error: 'المنتج غير متوفر أو غير موجود.' };
      if (product.stock_status === 'out_of_stock' || product.stock_status === 'out-of-stock') {
        return { success: false, error: `عذراً، المنتج "${product.title}" نفدت كميته حالياً.` };
      }

      await repos.cart.addItem(cartId, product.product_id || String(product.id), product.id, pid, qty);

      logActionAudit({
        sessionId,
        action: 'add_to_cart',
        targetType: 'product',
        targetId: String(product.id),
        payload: { productId: product.id, title: product.title, quantity: qty },
        result: 'success',
        ipAddress
      });

      return {
        success: true,
        message: `تمت إضافة (${qty}) من "${product.title}" إلى سلتك بنجاح.`,
        product: { id: product.product_id || product.id, title: product.title, quantityAdded: qty, price: product.price }
      };
    }

    case 'remove_from_cart': {
      const pid = String(args.product_id || '').trim();
      const cartId = await getActiveCartId(repos, userId, guestId);
      if (!cartId) return { success: false, error: 'السلة فارغة.' };

      const product = await repos.products.findForCustomerTool(pid);
      if (!product) return { success: false, error: 'المنتج غير موجود.' };

      await repos.cart.removeItem(cartId, product.product_id || String(product.id), product.id, pid);

      logActionAudit({
        sessionId,
        action: 'remove_from_cart',
        targetType: 'product',
        targetId: String(product.id),
        payload: { productId: product.id, title: product.title },
        result: 'success',
        ipAddress
      });

      return {
        success: true,
        message: `تمت إزالة "${product.title}" من السلة.`
      };
    }

    case 'update_cart': {
      const pid = String(args.product_id || '').trim();
      const qty = Number(args.quantity);
      const cartId = await getActiveCartId(repos, userId, guestId);
      if (!cartId) return { success: false, error: 'السلة فارغة.' };

      const product = await repos.products.findForCustomerTool(pid);
      if (!product) return { success: false, error: 'المنتج غير موجود.' };

      if (qty <= 0) {
        await repos.cart.removeItem(cartId, product.product_id || String(product.id), product.id, pid);
        return { success: true, message: `تمت إزالة "${product.title}" من السلة.` };
      }

      await repos.cart.updateItem(cartId, product.product_id || String(product.id), product.id, pid, qty);

      return { success: true, message: `تم تعديل كمية "${product.title}" في السلة إلى (${qty}).` };
    }

    case 'create_order_request':
    case 'prepare_order_draft': {
      const cartId = await getActiveCartId(repos, userId, guestId);
      const cartItems = await repos.cart.findCartItems(cartId);

      if ((cartItems || []).length === 0) {
        return { success: false, error: 'سلة التسوق فارغة حالياً. أضف منتجات أولاً لتجهيز الطلب.' };
      }

      const items = (cartItems || []).map(ci => ({
        id: ci.internal_id,
        product_id: ci.product_id || ci.stored_product_id,
        quantity: ci.quantity,
        title: ci.title,
        price: ci.price,
        code: ci.product_id
      }));

      const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
      const shippingFee = 0;
      const total = subtotal + shippingFee;

      const draftToken = 'DFT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const idempotencyKey = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      const customerPayload = {
        customerName: args.customer_name,
        phone: args.phone,
        city: args.city || 'صنعاء',
        address: args.address || '',
        deliveryMethod: args.delivery_method || 'توصيل لباب المنزل',
        paymentMethod: args.payment_method || 'الدفع عند الاستلام'
      };

      await repos.ai.createOrderDraft({
        draftToken,
        idempotencyKey,
        sessionId: sessionId || 'guest',
        customerPayload,
        itemsPayload: items,
        subtotal,
        shippingFee,
        total,
        expiresAt
      });

      logActionAudit({
        sessionId,
        action: 'prepare_order_draft',
        targetType: 'order_draft',
        targetId: draftToken,
        payload: { draftToken, total, itemsCount: items.length },
        result: 'success',
        ipAddress
      });

      return {
        success: true,
        draftToken,
        draftOrder: { draftToken, total, itemsCount: items.length, customerName: args.customer_name, phone: args.phone },
        customerName: args.customer_name,
        phone: args.phone,
        itemsCount: items.length,
        itemsSummary: items.map(i => `${i.title} (الكمية: ${i.quantity})`),
        subtotal,
        subtotalFormatted: Number(subtotal).toLocaleString('ar-YE') + ' ر.ي',
        total,
        totalFormatted: Number(total).toLocaleString('ar-YE') + ' ر.ي',
        message: `تم تجهيز مسودة الطلب برقم ${draftToken}. هل تؤكد اعتماد الطلب النهائي لإرساله لفريق التجهيز؟`
      };
    }

    case 'confirm_order': {
      const token = String(args.draft_token || '').trim();
      const draft = await repos.ai.getUnconfirmedOrderDraftByToken(token, sessionId || null);

      if (!draft) {
        return { success: false, error: 'رمز المسودة غير صالح أو منتهي الصلاحية أو تم تأكيده مسبقاً.' };
      }

      // Atomically claim the draft before creating anything -- if two
      // concurrent requests both pass the lookup above (neither has
      // confirmed yet), only one of them wins this conditional UPDATE.
      // Claiming first (rather than after createCustomerOrder) is what
      // actually prevents a duplicate order, not just a duplicate
      // is_confirmed flag.
      const claimed = await repos.ai.confirmOrderDraft(draft.id);
      if (!claimed) {
        return { success: false, error: 'تم تأكيد هذا الطلب بالفعل من قبل طلب آخر بنفس الرمز.' };
      }

      const customer = typeof draft.customer_payload === 'string' ? JSON.parse(draft.customer_payload) : draft.customer_payload;
      const items = typeof draft.items_payload === 'string' ? JSON.parse(draft.items_payload) : draft.items_payload;
      const orderId = await generateOrderId();

      await repos.orders.createCustomerOrder({
        order_id: orderId,
        subtotal: draft.subtotal,
        shipping_fee: draft.shipping_fee,
        total: draft.total
      }, items, customer);

      // Clear Cart
      const cartId = await getActiveCartId(repos, userId, guestId);
      if (cartId) {
        await repos.cart.clearCartById(cartId);
      }

      logActionAudit({
        sessionId,
        action: 'confirm_order',
        targetType: 'order',
        targetId: orderId,
        payload: { orderId, total: draft.total, itemsCount: items.length },
        result: 'success',
        ipAddress
      });

      return {
        success: true,
        orderId,
        total: draft.total,
        totalFormatted: Number(draft.total).toLocaleString('ar-YE') + ' ر.ي',
        message: `ألف مبروك! تم تسجيل طلبك بنجاح برقم معتمد: ${orderId}. سيتم التواصل معك عبر الواتساب لتأكيد موعد التسليم.`
      };
    }

    case 'get_order_status':
    case 'track_order': {
      const rawId = String(args.order_id || '').trim();
      const phone = String(args.phone || '').trim();

      // Order IDs are sequential (ZFB-YYYY-NNNNNN), so without a mandatory
      // phone check this endpoint is a full order-enumeration IDOR: anyone
      // who guesses or increments an order_id gets that customer's status,
      // total, items, and city. The phone check must never be skippable --
      // it was previously only enforced `if (phone)` was even provided.
      if (!phone) {
        return { success: false, error: 'يرجى إدخال رقم الهاتف المسجل في الطلب لأسباب أمنية.' };
      }

      const order = await repos.orders.findSingleOrderForAiTracking(rawId);

      if (!order) {
        return { success: false, error: 'لم يتم العثور على طلب بهذا الرقم. تأكد من صحة رقم الطلب.' };
      }

      // Compare normalized numbers for equality, not substrings. The previous
      // two-way `includes` test made the check a formality: `phone: "7"` is a
      // substring of practically every Yemeni number on file, so a single
      // digit satisfied it and the enumeration this guard exists to stop was
      // still wide open. It also threw outright when an order's customer had
      // no phone recorded, since null has no .includes.
      const orderPhone = normalizePhone(order.customer_phone);
      if (!orderPhone || orderPhone !== normalizePhone(phone)) {
        return { success: false, error: 'رقم الهاتف المدخل لا يتطابق مع الرقم المسجل في الطلب لأسباب أمنية.' };
      }

      const statusMap = {
        pending: 'قيد المراجعة والتأكيد',
        confirmed: 'تم التأكيد وجارٍ التجهيز في المستودع',
        processing: 'جارٍ التجهيز والتغليف',
        shipped: 'في الطريق مع مندوب التوصيل',
        delivered: 'تم التسليم بنجاح',
        cancelled: 'ملغي'
      };

      return {
        success: true,
        orderId: order.order_id,
        order: { orderId: order.order_id, status: order.status, total: order.total, createdAt: order.created_at },
        status: order.status,
        statusAr: statusMap[order.status] || order.status,
        createdAt: order.created_at,
        total: order.total,
        totalFormatted: Number(order.total).toLocaleString('ar-YE') + ' ر.ي',
        itemsCount: order.items.length,
        items: order.items.map(i => `${i.product_title} (${i.quantity})`),
        deliveryMethod: order.delivery_method,
        city: order.city
      };
    }

    case 'create_support_ticket':
    case 'create_customer_request': {
      return createCustomerRequest({
        sessionId,
        customerName: args.customer_name,
        phone: args.phone,
        orderId: args.order_id,
        category: args.category || 'general',
        requestText: args.request_text,
        requestedProducts: args.requested_products,
        quantity: args.quantity || 1,
        budget: args.budget,
        najmNotes: args.najm_notes,
        priority: args.priority || 'normal',
        ipAddress
      });
    }

    case 'get_customer_request': {
      const phone = String(args.phone || '').trim();

      // request_id is generated as REQ-<year>-<4 random digits>: only 9000
      // values per year, from Math.random(), so it is trivially enumerable.
      // Without an ownership check this tool hands out any customer's name,
      // request text and admin notes to whoever guesses a number -- the same
      // IDOR shape already closed on track_order, which is the pattern
      // followed here. The phone check must never be skippable.
      if (!phone) {
        return { success: false, error: 'يرجى إدخال رقم الهاتف المسجل في التذكرة لأسباب أمنية.' };
      }

      // Was missing its await: getCustomerRequest is async, so `req` was a
      // Promise -- always truthy, so the not-found guard below never fired and
      // every field read off it was undefined. Najm cheerfully reported a
      // ticket that did not exist, with blank details.
      const req = await getCustomerRequest(args.request_id);
      if (!req) return { success: false, error: 'لم يتم العثور على تذكرة بهذا الرقم.' };

      // Normalized equality, not a substring test -- the same bypass closed on
      // track_order above: a single digit is a substring of nearly every
      // number on file and satisfied the old two-way `includes` check.
      const onFile = normalizePhone(req.phone);
      if (!onFile || onFile !== normalizePhone(phone)) {
        return { success: false, error: 'رقم الهاتف المدخل لا يتطابق مع الرقم المسجل في التذكرة لأسباب أمنية.' };
      }

      return {
        success: true,
        requestId: req.request_id,
        customerName: req.customer_name,
        status: req.status,
        statusLabel: req.statusLabel,
        requestText: req.request_text,
        adminNotes: req.admin_notes || 'قيد المتابعة من فريق الإدارة',
        createdAt: req.created_at
      };
    }

    case 'get_store_information':
    case 'get_store_policies': {
      // Both of these were missing their await. `settings.map(...)` and
      // `branches.map(...)` therefore ran against a Promise and threw
      // TypeError every single time, so Najm could never answer a question
      // about the store's phone, address, payment methods or branches -- it
      // fell back to the hardcoded defaults below only because Wave 9's
      // per-tool error isolation swallowed the throw.
      const settings = await repos.settings.findByKeys(['site_name', 'contact_phone', 'contact_whatsapp', 'contact_email', 'contact_address', 'payment_methods', 'shipping_methods']);
      const info = Object.fromEntries(settings.map(s => [s.key, s.value || '']));

      const branches = await repos.branches.findAll({ is_active: 1 });

      return {
        success: true,
        storeName: info.site_name || 'زياد ستور',
        phone: info.contact_phone || '01-234567',
        whatsapp: info.contact_whatsapp || '777000000',
        address: info.contact_address || 'صنعاء، اليمن',
        paymentMethods: info.payment_methods || 'نقداً عند الاستلام، الكريمي، المحافظ الإلكترونية',
        shippingMethods: info.shipping_methods || 'توصيل صنعاء (خلال 24 ساعة)، شحن المحافظات',
        warrantyPolicy: 'ضمان ذهبي شامل 12 إلى 24 شهراً على كافة الأجهزة وغرف النوم والمجالس ومنظومات الطاقة.',
        returnPolicy: 'إمكانية المعاينة عند الاستلام، وضمان الاستبدال في حال وجود أي عيب مصنعي خلال 3 أيام.',
        branches: branches.map(b => ({
          name: b.name_ar,
          city: b.city,
          address: b.address,
          phone: b.phone,
          workingHours: b.working_hours
        }))
      };
    }

    case 'get_delivery_policy_and_estimate': {
      const { deliveryService } = require('../delivery-service');
      const city = args.city || '';
      const answer = await deliveryService.getNajmDeliveryAnswer(args.category || args.product_id || '', { city });
      const info = await deliveryService.getPublicDeliveryInfo();
      return {
        success: true,
        answer,
        city: city || 'صنعاء',
        general_policies: info
      };
    }

    default:
      return { success: false, error: `الأداة "${name}" غير معروفة في النظام.` };
  }
}

module.exports = {
  customerToolsDefinitions,
  executeCustomerTool
};
