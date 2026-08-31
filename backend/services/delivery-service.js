/**
 * Zeyad For Business - Canonical Delivery Service
 * Single Source of Truth for Delivery Policies, Zone Pricing, Dynamic Estimates,
 * Installation Separation, Mixed Cart Rules, and Public/Najm Intelligence.
 * Refactored in Phase 1 Batch 5C to use Repository Layer (SqliteDeliveryRepo).
 */

const { getRepositories } = require('../repositories');
const { currencyService } = require('./currency-service');

class DeliveryService {
  get repo() {
    return getRepositories().delivery;
  }

  get authRepo() {
    return getRepositories().auth;
  }

  /**
   * Normalize Arabic text for city / zone matching
   */
  normalizeArabic(text) {
    if (!text) return '';
    return String(text)
      .trim()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[\u064B-\u065F]/g, '') // remove diacritics
      .toLowerCase();
  }

  /**
   * Detect whether location is within Sana'a or Provinces
   * Supports cityName, provinceName, and (latitude, longitude) coordinates
   */
  detectZone(cityName, options = {}) {
    const { latitude, longitude, province } = options;

    // 1. Geometric Coordinate Resolution
    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null && latitude !== '' && longitude !== '') {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        // Sana'a metropolitan bounding box
        if (lat >= 15.15 && lat <= 15.55 && lng >= 44.05 && lng <= 44.38) {
          return 'sana_a';
        }
        // Known Yemen coordinates outside Sana'a
        if (lat >= 12.0 && lat <= 19.0 && lng >= 41.0 && lng <= 54.0) {
          return 'provinces';
        }
      }
    }

    // 2. Text-Based Resolution
    const combined = `${cityName || ''} ${province || ''} ${options.district || ''}`;
    if (!combined.trim()) return 'sana_a'; // Default to Sana'a if unspecified

    const norm = this.normalizeArabic(combined);
    if (
      norm.includes('صنعا') ||
      norm.includes('امانه العاصمه') ||
      norm.includes('حده') ||
      norm.includes('حدء') ||
      norm.includes('السبعين') ||
      norm.includes('شعوب') ||
      norm.includes('التحرير') ||
      norm.includes('معين') ||
      norm.includes('الوحده') ||
      norm.includes('الثوره') ||
      norm.includes('ازال') ||
      norm.includes('الصافيه') ||
      norm.includes('الاصبحي') ||
      norm.includes('بيت بوس') ||
      norm.includes('مذبح')
    ) {
      return 'sana_a';
    }

    return 'provinces';
  }

  /**
   * Fetch delivery policies
   */
  async getPolicies(filters = {}) {
    return await this.repo.findPolicies(filters);
  }

  /**
   * Fetch single policy by ID
   */
  async getPolicyById(id) {
    return await this.repo.findPolicyById(id);
  }

  /**
   * Fetch single policy by Code
   */
  async getPolicyByCode(code) {
    return await this.repo.findPolicyByCode(code);
  }

  /**
   * Fetch all provinces
   */
  async getProvinces(activeOnly = true) {
    return await this.repo.findProvinces(activeOnly);
  }

  /**
   * Create new delivery policy
   */
  async createPolicy(data, adminUser = null) {
    if (!data.code || !data.name_ar) {
      throw new Error('رمز السياسة واسمها بالعربية مطلوبان');
    }

    const cleanCode = String(data.code).trim();
    const existing = await this.repo.findPolicyByCode(cleanCode);
    if (existing) {
      throw new Error(`سياسة التوصيل بالرمز "${cleanCode}" مسجلة مسبقاً`);
    }

    const minPriceYer = Number(data.min_price_yer || 0);
    const maxPriceYer = Number(data.max_price_yer || 0);
    const fixedPriceYer = Number(data.fixed_price_yer || 0);

    const minPriceSar = Number(data.min_price_sar ?? (minPriceYer > 0 ? await currencyService.convertToSar(minPriceYer, 'YER') : 0));
    const maxPriceSar = Number(data.max_price_sar ?? (maxPriceYer > 0 ? await currencyService.convertToSar(maxPriceYer, 'YER') : 0));
    const fixedPriceSar = Number(data.fixed_price_sar ?? (fixedPriceYer > 0 ? await currencyService.convertToSar(fixedPriceYer, 'YER') : 0));

    const newId = await this.repo.createPolicy({
      code: cleanCode,
      name_ar: String(data.name_ar).trim(),
      name_en: data.name_en ? String(data.name_en).trim() : null,
      description: data.description ? String(data.description).trim() : null,
      category_scope: data.category_scope || 'all',
      zone_scope: data.zone_scope || 'all',
      service_type: data.service_type || 'delivery',
      pricing_type: data.pricing_type || 'range',
      min_price_yer: minPriceYer,
      max_price_yer: maxPriceYer,
      min_price_sar: minPriceSar,
      max_price_sar: maxPriceSar,
      fixed_price_yer: fixedPriceYer,
      fixed_price_sar: fixedPriceSar,
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      sort_order: Number(data.sort_order || 0),
      notes: data.notes ? String(data.notes).trim() : null
    });

    // Audit log
    try {
      await this.authRepo.logAction({
        user_id: adminUser?.id || null,
        action: 'CREATE_DELIVERY_POLICY',
        entity: 'delivery_policies',
        entity_id: newId,
        old_values: null,
        new_values: { code: cleanCode, name_ar: data.name_ar, pricing_type: data.pricing_type },
        ip_address: '127.0.0.1'
      });
    } catch (_) {}

    return await this.getPolicyById(newId);
  }

  /**
   * Update existing delivery policy
   */
  async updatePolicy(id, data, adminUser = null) {
    const existing = await this.getPolicyById(id);
    if (!existing) throw new Error('سياسة التوصيل غير موجودة');

    const nameAr = (data.name_ar || data.nameAr || existing.name_ar).trim();
    const pricingType = data.pricing_type || data.pricingType || existing.pricing_type;
    const minPriceYer = Number(data.min_price_yer ?? data.minPriceYer ?? existing.min_price_yer);
    const maxPriceYer = Number(data.max_price_yer ?? data.maxPriceYer ?? existing.max_price_yer);
    const fixedPriceYer = Number(data.fixed_price_yer ?? data.fixedPriceYer ?? existing.fixed_price_yer);

    const minPriceSar = Number(data.min_price_sar ?? (minPriceYer > 0 ? await currencyService.convertToSar(minPriceYer, 'YER') : 0));
    const maxPriceSar = Number(data.max_price_sar ?? (maxPriceYer > 0 ? await currencyService.convertToSar(maxPriceYer, 'YER') : 0));
    const fixedPriceSar = Number(data.fixed_price_sar ?? (fixedPriceYer > 0 ? await currencyService.convertToSar(fixedPriceYer, 'YER') : 0));

    await this.repo.updatePolicy(id, {
      name_ar: nameAr,
      name_en: data.name_en !== undefined ? data.name_en : existing.name_en,
      description: data.description !== undefined ? data.description : existing.description,
      category_scope: data.category_scope !== undefined ? data.category_scope : existing.category_scope,
      zone_scope: data.zone_scope !== undefined ? data.zone_scope : existing.zone_scope,
      service_type: data.service_type !== undefined ? data.service_type : existing.service_type,
      pricing_type: pricingType,
      min_price_yer: minPriceYer,
      max_price_yer: maxPriceYer,
      min_price_sar: minPriceSar,
      max_price_sar: maxPriceSar,
      fixed_price_yer: fixedPriceYer,
      fixed_price_sar: fixedPriceSar,
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
      sort_order: Number(data.sort_order ?? existing.sort_order),
      notes: data.notes !== undefined ? data.notes : existing.notes
    });

    // Audit log
    try {
      await this.authRepo.logAction({
        user_id: adminUser?.id || null,
        action: 'UPDATE_DELIVERY_POLICY',
        entity: 'delivery_policies',
        entity_id: id,
        old_values: { name_ar: existing.name_ar, min_price_yer: existing.min_price_yer, max_price_yer: existing.max_price_yer },
        new_values: { name_ar: nameAr, min_price_yer: minPriceYer, max_price_yer: maxPriceYer },
        ip_address: '127.0.0.1'
      });
    } catch (_) {}

    return await this.getPolicyById(id);
  }

  /**
   * Toggle policy active status
   */
  async togglePolicy(id, adminUser = null) {
    const existing = await this.getPolicyById(id);
    if (!existing) throw new Error('السياسة غير موجودة');

    const newStatus = await this.repo.togglePolicy(id);

    try {
      await this.authRepo.logAction({
        user_id: adminUser?.id || null,
        action: 'TOGGLE_DELIVERY_POLICY',
        entity: 'delivery_policies',
        entity_id: id,
        old_values: { is_active: existing.is_active },
        new_values: { is_active: newStatus },
        ip_address: '127.0.0.1'
      });
    } catch (_) {}

    return { id, is_active: newStatus };
  }

  /**
   * Delete policy
   */
  async deletePolicy(id, adminUser = null) {
    const existing = await this.getPolicyById(id);
    if (!existing) throw new Error('السياسة غير موجودة');

    await this.repo.deletePolicy(id);

    try {
      await this.authRepo.logAction({
        user_id: adminUser?.id || null,
        action: 'DELETE_DELIVERY_POLICY',
        entity: 'delivery_policies',
        entity_id: id,
        old_values: { code: existing.code, name_ar: existing.name_ar },
        new_values: null,
        ip_address: '127.0.0.1'
      });
    } catch (_) {}

    return true;
  }

  /**
   * Authoritative Delivery & Installation Evaluator for Cart and Checkout
   */
  async evaluateCartDelivery(items = [], customerLocation = '', deliveryMethod = 'standard', coupon = null, currency = 'SAR') {
    const targetCurrency = currencyService.normalizeCurrency(currency);

    // Parse location object or string
    let cityName = '';
    let locationOpts = {};
    if (typeof customerLocation === 'object' && customerLocation !== null) {
      cityName = customerLocation.city || customerLocation.province || '';
      locationOpts = customerLocation;
    } else {
      cityName = String(customerLocation || '');
      locationOpts = { city: cityName };
    }

    // 1. Showroom Pickup
    if (deliveryMethod === 'showroom_pickup') {
      return {
        delivery_status: 'free',
        delivery_text: 'استلام مباشر من معرض زياد ستور (مجاناً)',
        delivery_fee_sar: 0,
        delivery_fee: 0,
        delivery_range_yer: { min: 0, max: 0 },
        delivery_range_sar: { min: 0, max: 0 },
        delivery_range_text: 'مجاناً',
        zone: 'sana_a',
        zone_name: 'المعرض الرئيسي',
        service_type: 'showroom_pickup',
        requires_installation: false,
        installation_status: 'none',
        installation_text: 'بدون تركيب',
        installation_fee_sar: 0,
        installation_fee: 0,
        free_shipping: true,
        policy_code: 'showroom_pickup'
      };
    }

    const zone = this.detectZone(cityName, locationOpts);
    const zoneName = zone === 'sana_a' ? 'داخل صنعاء' : 'المحافظات';

    if (!items || items.length === 0) {
      return {
        delivery_status: 'range',
        delivery_text: 'يحدد من قبل الإدارة بعد تأكيد الطلب',
        delivery_fee_sar: 0,
        delivery_fee: 0,
        delivery_range_yer: { min: 0, max: 0 },
        delivery_range_sar: { min: 0, max: 0 },
        delivery_range_text: 'يحدد من قبل الإدارة',
        zone,
        zone_name: zoneName,
        service_type: 'delivery',
        requires_installation: false,
        installation_status: 'none',
        installation_text: 'بدون تركيب',
        installation_fee_sar: 0,
        installation_fee: 0,
        free_shipping: false,
        policy_code: zone === 'sana_a' ? 'household_sana_a' : 'household_provinces'
      };
    }

    // 2. Hydrate full product delivery info from Repository to guarantee single source of truth
    const productIds = items.map(it => it.productId || it.id || it.sku).filter(Boolean);
    const dbProducts = (await this.repo.findProductsDeliveryInfo(productIds)) || [];

    const productMap = new Map();
    dbProducts.forEach(p => {
      productMap.set(String(p.id), p);
      if (p.product_id) productMap.set(String(p.product_id), p);
      if (p.sku) productMap.set(String(p.sku), p);
    });

    let hasQuoteAfterConfirmation = false;
    let hasBedroomOrFurniture = false;
    let hasInstallationRequired = false;
    let totalSeparateInstallationSar = 0;
    let allItemsFreeSanaA = true;
    let hasFreeSanaA = false;

    items.forEach(it => {
      const pId = String(it.productId || it.id || it.sku);
      const dbProd = productMap.get(pId) || {};
      const qty = Number(it.quantity) || 1;

      const policyType = dbProd.delivery_policy_type || it.delivery_policy_type || 'default';
      const catSlug = (dbProd.category_slug || it.categorySlug || it.category_slug || '').toLowerCase();
      const catName = dbProd.category_name || it.categoryName || it.category_name || '';
      const itCatName = String(it.categoryName || it.category_name || it.category || '').toLowerCase();
      const isFurnitureCat = catSlug.includes('furniture') || catSlug.includes('bedroom') || catName.includes('أثاث') || catName.includes('غرف') || catName.includes('نوم') || itCatName.includes('غرف') || itCatName.includes('أثاث') || itCatName.includes('bedroom') || itCatName.includes('furniture');

      const requiresInst = (dbProd.requires_installation === 1 || dbProd.requires_installation === true || it.requires_installation === 1 || it.requires_installation === true || isFurnitureCat) ? 1 : 0;
      const instFeeSar = Number(dbProd.installation_fee_sar || it.installation_fee_sar || 0);

      if (policyType === 'quote_after_confirmation' || it.delivery_policy_type === 'quote_after_confirmation') {
        hasQuoteAfterConfirmation = true;
      }
      if (policyType === 'free_sana_a' || it.delivery_policy_type === 'free_sana_a') {
        hasFreeSanaA = true;
      } else {
        allItemsFreeSanaA = false;
      }

      if (requiresInst === 1) {
        hasInstallationRequired = true;
        totalSeparateInstallationSar += (instFeeSar * qty);
      }

      if (isFurnitureCat) {
        hasBedroomOrFurniture = true;
        hasInstallationRequired = true;
      }
    });

    // 3. Evaluate Status & Policy
    let matchedPolicy = null;
    let deliveryStatus = 'range';
    let serviceType = 'delivery';

    if (hasQuoteAfterConfirmation) {
      deliveryStatus = 'quote';
    } else if (zone === 'sana_a' && allItemsFreeSanaA && hasFreeSanaA) {
      deliveryStatus = 'free';
    }

    if (hasBedroomOrFurniture) {
      serviceType = 'delivery_and_installation';
      matchedPolicy = await this.getPolicyByCode(zone === 'sana_a' ? 'bedroom_sana_a' : 'bedroom_provinces');
    } else {
      matchedPolicy = await this.getPolicyByCode(zone === 'sana_a' ? 'household_sana_a' : 'household_provinces');
    }

    // Fallback to generic zone policy if specific code not found
    if (!matchedPolicy) {
      matchedPolicy = (await this.getPolicyByCode(zone === 'sana_a' ? 'general_sana_a' : 'general_provinces')) || {
        min_price_yer: zone === 'sana_a' ? 1000 : 3000,
        max_price_yer: zone === 'sana_a' ? 2000 : 6000,
        min_price_sar: zone === 'sana_a' ? 7.14 : 21.43,
        max_price_sar: zone === 'sana_a' ? 14.29 : 42.86,
        pricing_type: 'range'
      };
    }

    // Min / Max ranges
    const minPriceYer = Number(matchedPolicy.min_price_yer || 0);
    const maxPriceYer = Number(matchedPolicy.max_price_yer || 0);
    const minPriceSar = Number(matchedPolicy.min_price_sar || (minPriceYer > 0 ? await currencyService.convertToSar(minPriceYer, 'YER') : 0));
    const maxPriceSar = Number(matchedPolicy.max_price_sar || (maxPriceYer > 0 ? await currencyService.convertToSar(maxPriceYer, 'YER') : 0));

    // Build user-facing delivery text
    let deliveryText = '';
    let deliveryFeeSar = 0;
    let isFree = false;

    if (deliveryStatus === 'quote') {
      deliveryText = 'يحدد من قبل الإدارة بعد تأكيد الطلب';
    } else if (deliveryStatus === 'free') {
      deliveryText = `التوصيل مجاني (${zoneName})`;
      isFree = true;
    } else {
      deliveryText = 'يحدد من قبل الإدارة بعد تأكيد الطلب';
    }

    // 4. Installation Handling
    let installationStatus = 'none';
    let installationText = 'بدون تركيب';
    let installationFeeSar = 0;

    if (hasBedroomOrFurniture && matchedPolicy.service_type === 'delivery_and_installation') {
      installationStatus = 'included';
      installationText = 'شامل التوصيل والتركيب المنزلي';
      installationFeeSar = 0; // Included inside bedroom estimate
    } else if (hasInstallationRequired && totalSeparateInstallationSar > 0) {
      installationStatus = 'separate';
      installationFeeSar = totalSeparateInstallationSar;
      const instDisplay = await currencyService.convertPrice(installationFeeSar, targetCurrency);
      installationText = `رسوم التركيب: ${instDisplay.toLocaleString('ar-SA')} ${targetCurrency === 'YER' ? 'ر.ي' : 'ر.س'}`;
    }

    // 5. Coupon Free Shipping Override
    let isCouponFreeShipping = false;
    if (coupon && coupon.free_shipping === true) {
      deliveryStatus = 'free';
      deliveryText = 'مجاناً (عرض كوبون)';
      deliveryFeeSar = 0;
      isFree = true;
      isCouponFreeShipping = true;
    }

    const deliveryFeeDisplay = await currencyService.convertPrice(deliveryFeeSar, targetCurrency);
    const installationFeeDisplay = await currencyService.convertPrice(installationFeeSar, targetCurrency);

    return {
      delivery_status: deliveryStatus,
      delivery_text: deliveryText,
      delivery_fee_sar: deliveryFeeSar,
      delivery_fee: deliveryFeeDisplay,
      delivery_range_yer: { min: 0, max: 0 },
      delivery_range_sar: { min: 0, max: 0 },
      delivery_range_text: isFree ? 'مجاناً' : 'يحدد من قبل الإدارة',
      zone,
      zone_name: zoneName,
      service_type: serviceType,
      requires_installation: hasInstallationRequired,
      installation_status: installationStatus,
      installation_text: installationText,
      installation_fee_sar: installationFeeSar,
      installation_fee: installationFeeDisplay,
      free_shipping: isFree,
      is_coupon_free_shipping: isCouponFreeShipping,
      policy_code: matchedPolicy.code || 'standard'
    };
  }

  /**
   * Structured Public Delivery Information for /delivery.html
   */
  async getPublicDeliveryInfo() {
    const policies = await this.getPolicies({ activeOnly: true });
    const provinces = await this.getProvinces(true);

    const sanaaPolicies = policies.filter(p => p.zone_scope === 'sana_a' || p.zone_scope === 'all');
    const provincePolicies = policies.filter(p => p.zone_scope === 'provinces' || p.zone_scope === 'all');

    return {
      sana_a: {
        title: 'داخل أمانة العاصمة صنعاء',
        timeline: 'خلال 24 — 48 ساعة (توصيل سريع بنفس اليوم متاح)',
        policies: sanaaPolicies
      },
      provinces: {
        title: 'شحن وتوصيل المحافظات اليمنية',
        timeline: 'خلال 2 — 4 أيام عمل عبر مكاتب الشحن المعتمدة',
        provincesList: provinces,
        policies: provincePolicies
      },
      installation_note: 'الأسعار تقديرية وقد تختلف حسب المدينة، المنطقة، حجم الطلب، وعدد القطع ومتطلبات التركيب. يتم تأكيد السعر النهائي المباشر مع العميل قبل الشحن.',
      faqs: [
        {
          q: 'كيف يتم احتساب تكلفة التوصيل داخل صنعاء؟',
          a: 'الأدوات والأجهزة المنزلية والعروض من 1,000 إلى 2,000 ريال يمني تقديرياً، بينما غرف النوم والأثاث من 10,000 إلى 12,000 ريال شاملة التوصيل والتركيب المنزلي.'
        },
        {
          q: 'هل يمكنني معرفة تكلفة الشحن لمحافظتي بدقة؟',
          a: 'نعم، تبدأ تكلفة شحن الأدوات المنزلية للمحافظات من 3,000 إلى 6,000 ريال، ولغرف النوم والأثاث مع التركيب من 20,000 إلى 30,000 ريال حسب بعد المحافظة.'
        },
        {
          q: 'ماذا يعني (سيتم إبلاغ العميل بالسعر بعد تأكيد الطلب)؟',
          a: 'هذا يعني أن المنتج يتطلب ترتيبات نقل خاصة أو مسافات بعيدة، وسيقوم فريق المبيعات بالتواصل معك فوراً لتحديد أفضل سعر توصيل مناسب قبل إرسال الشحنة.'
        }
      ]
    };
  }

  /**
   * Real-time Najm AI Delivery Knowledge Assistant
   */
  async getNajmDeliveryAnswer(query = '', context = {}) {
    const norm = this.normalizeArabic(query);
    const city = context.city || (norm.includes('صنعا') ? 'صنعاء' : (norm.includes('عدن') ? 'عدن' : (norm.includes('تعز') ? 'تعز' : (norm.includes('اب') ? 'إب' : ''))));
    const zone = this.detectZone(city);

    const isBedroom = norm.includes('نوم') || norm.includes('غرف') || norm.includes('اثاث') || norm.includes('دولاب') || norm.includes('سرير');

    if (isBedroom) {
      const pol = await this.getPolicyByCode(zone === 'sana_a' ? 'bedroom_sana_a' : 'bedroom_provinces');
      const min = pol ? pol.min_price_yer.toLocaleString('ar-SA') : (zone === 'sana_a' ? '10,000' : '20,000');
      const max = pol ? pol.max_price_yer.toLocaleString('ar-SA') : (zone === 'sana_a' ? '12,000' : '30,000');
      const zoneLabel = zone === 'sana_a' ? 'داخل صنعاء' : (city ? `إلى ${city}` : 'للمحافظات');

      return `بالنسبة لغرف النوم والأثاث ${zoneLabel}، التكلفة التقديرية تشمل التوصيل والتركيب المنزلي بأيدي فنيين متخصصين وتتراوح بين **${min} إلى ${max} ريال يمني** (حسب حجم الغرفة وموقع التوصيل). يتم تأكيد السعر النهائي معك مباشرة عند تأكيد الطلب. هل تود أن أساعدك في إضافتها لسلتك؟`;
    }

    if (zone === 'sana_a') {
      const pol = await this.getPolicyByCode('household_sana_a');
      const min = pol ? pol.min_price_yer.toLocaleString('ar-SA') : '1,000';
      const max = pol ? pol.max_price_yer.toLocaleString('ar-SA') : '2,000';
      return `التوصيل داخل أمانة العاصمة صنعاء للأدوات والأجهزة المنزلية والعروض يتراوح تقديرياً بين **${min} إلى ${max} ريال يمني** فقط، مع إمكانية التوصيل السريع خلال 24-48 ساعة. كما نوفر التوصيل بأسعار رمزية مع إمكانية استخدام كوبونات الخصم والشحن المجاني عند توفرها!`;
    }

    const pol = await this.getPolicyByCode('household_provinces');
    const min = pol ? pol.min_price_yer.toLocaleString('ar-SA') : '3,000';
    const max = pol ? pol.max_price_yer.toLocaleString('ar-SA') : '6,000';
    const dest = city ? `إلى محافظة ${city}` : 'إلى كافة المحافظات اليمنية';
    return `شحن وتوصيل الأدوات والأجهزة المنزلية ${dest} يتراوح تقديرياً بين **${min} إلى ${max} ريال يمني** عبر مكاتب الشحن المعتمدة والمضمونة، ويصلك الطلب خلال 2 إلى 4 أيام عمل.`;
  }
}

const deliveryService = new DeliveryService();

module.exports = { DeliveryService, deliveryService };
