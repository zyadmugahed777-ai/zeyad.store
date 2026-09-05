const { getRepositories } = require('../../repositories');

const ARABIC_STOP_WORDS = new Set([
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'تم', 'كان', 'ما', 'هو',
  'هي', 'هل', 'أريد', 'اريد', 'ابحث', 'أبحث', 'عن', 'لو', 'سمحت', 'ممكن',
  'أفضل', 'افضل', 'أحسن', 'احسن', 'لي', 'لنا', 'عندكم', 'بدي', 'ابي', 'ابغى',
  'اعطني', 'أعطني', 'وريني', 'شوف', 'هات', 'يا', 'نجم', 'محتاج', 'عاوز'
]);

const SYNONYMS_MAP = {
  مجلس: ['كنب', 'جلسة', 'ديوان', 'مجالس', 'صالون', 'ضيافة', 'مساند', 'مفارش'],
  مجالس: ['كنب', 'جلسة', 'ديوان', 'مجالس', 'صالون', 'ضيافة'],
  كنب: ['مجلس', 'جلسة', 'أريكة', 'كنبة', 'صالون', 'اطقم'],
  كنبة: ['مجلس', 'جلسة', 'أريكة', 'كنب', 'صالون'],
  غرفة: ['سرير', 'دولاب', 'مرتبة', 'تسريحة', 'كومدينة', 'نوم'],
  غرف: ['سرير', 'دولاب', 'مرتبة', 'تسريحة', 'كومدينة', 'نوم'],
  نوم: ['غرفة', 'سرير', 'مرتبة', 'مفرش', 'دولاب', 'تسريحة'],
  سرير: ['غرفة', 'نوم', 'مرتبة', 'اسرة'],
  مطبخ: ['مطابخ', 'خزائن', 'أواني', 'طقم', 'طباخة', 'فرن', 'مغسلة', 'المنيوم'],
  مطابخ: ['مطبخ', 'خزائن', 'طباخة', 'فرن', 'المنيوم'],
  غسالة: ['غسالات', 'أوتوماتيك', 'حوضين', 'غسيل', 'نشافة', 'lg'],
  غسالات: ['غسالة', 'أوتوماتيك', 'حوضين', 'غسيل', 'نشافة'],
  ثلاجة: ['ثلاجات', 'فريزر', 'تبريد', 'تجميد', 'سامسونج', 'قدم'],
  ثلاجات: ['ثلاجة', 'فريزر', 'تبريد', 'تجميد'],
  مكيف: ['مكيفات', 'سبليت', 'تبريد', 'طن', 'الف', 'وحدة'],
  مكيفات: ['مكيف', 'سبليت', 'تبريد'],
  شاشة: ['شاشات', 'تلفزيون', 'تلفاز', 'سمارت', '4k', 'بوصة'],
  شاشات: ['شاشة', 'تلفزيون', 'سمارت', '4k'],
  طاقة: ['شمسية', 'الواح', 'إنفرتر', 'انفرتر', 'محول', 'بطارية', 'بطاريات', 'منظومة'],
  شمسية: ['طاقة', 'الواح', 'بطاريات', 'انفرتر', 'عواكس', 'جل', 'ليثيوم']
};

const CATEGORY_SLUG_MAP = {
  مجالس: 'majalis',
  مجلس: 'majalis',
  كنب: 'majalis',
  كنبة: 'majalis',
  ديوان: 'majalis',
  صالون: 'majalis',
  'غرف نوم': 'bedrooms',
  'غرفة نوم': 'bedrooms',
  غرفة: 'bedrooms',
  غرف: 'bedrooms',
  نوم: 'bedrooms',
  سرير: 'bedrooms',
  اسرة: 'bedrooms',
  دولاب: 'bedrooms',
  دواليب: 'bedrooms',
  تسريحة: 'bedrooms',
  تسريحات: 'bedrooms',
  مرتبة: 'bedrooms',
  مطابخ: 'kitchens',
  مطبخ: 'kitchens',
  خزائن: 'kitchens',
  أجهزة: 'appliances',
  اجهزة: 'appliances',
  غسالة: 'appliances',
  غسالات: 'appliances',
  نشافة: 'appliances',
  ثلاجة: 'appliances',
  ثلاجات: 'appliances',
  فريزر: 'appliances',
  مكيف: 'appliances',
  مكيفات: 'appliances',
  سبليت: 'appliances',
  شاشة: 'appliances',
  شاشات: 'appliances',
  تلفزيون: 'appliances',
  تلفاز: 'appliances',
  فرن: 'appliances',
  أفران: 'appliances',
  افران: 'appliances',
  ميكرويف: 'appliances',
  بوتاجاز: 'appliances',
  بوتاجازات: 'appliances',
  طباخة: 'appliances',
  خلاط: 'appliances',
  خلاطات: 'appliances',
  مكنسة: 'appliances',
  قلاية: 'appliances',
  'طاقة شمسية': 'solar',
  طاقة: 'solar',
  شمسية: 'solar',
  انفرتر: 'solar',
  إنفرتر: 'solar',
  بطارية: 'solar',
  بطاريات: 'solar',
  الواح: 'solar',
  ألواح: 'solar',
  محول: 'solar',
  منظم: 'solar',
  أثاث: 'furniture',
  اثاث: 'furniture',
  طاولة: 'furniture',
  طاولات: 'furniture',
  كرسي: 'furniture',
  كراسي: 'furniture',
  'غرف أطفال': 'kids-rooms',
  'غرفة أطفال': 'kids-rooms',
  أطفال: 'kids-rooms',
  اطفال: 'kids-rooms'
};

/**
 * stock_status is stored in two spellings: 'in-stock' (406 rows) and
 * 'in_stock' (30 rows). Every availability and display check compared against
 * the hyphen form only, so those 30 products matched neither "in stock" nor
 * "out of stock" and were shown to customers as "طلب مسبق" (pre-order) while
 * being perfectly available -- and were down-ranked in search, since
 * isAvailable fell to 0.4 for them.
 *
 * The divergence came from the admin create/edit routes defaulting to the
 * underscore form while everything that reads it expects the hyphen form; that
 * default is now fixed. Comparing on a normalized value here means the existing
 * rows display correctly straight away, with no data migration.
 */
function normalizeStockStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-');
}

function isInStock(value) {
  const v = normalizeStockStatus(value);
  return v === 'in-stock' || value === 'متوفر';
}

function isOutOfStock(value) {
  return normalizeStockStatus(value) === 'out-of-stock';
}

function normalizeArabicText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[^\w\s\u0600-\u06FF]/gi, ' ')
    .toLowerCase()
    .trim();
}

function extractEntitiesAndIntent(query) {
  const normalized = normalizeArabicText(query);
  const words = normalized.split(/\s+/).filter(Boolean);

  let maxPrice = null;
  let minPrice = null;
  let detectedCategory = null;
  let sortPreference = null; // 'cheapest', 'highest_rated', 'newest', null

  if (/ارخص|الارخص|اقل سعر|رخيص|اقتصادي|مناسب للسعر/.test(normalized)) {
    sortPreference = 'cheapest';
  } else if (/افضل|الافضل|اعلى تقييم|احسن|فاخر|ممتاز|اجود/.test(normalized)) {
    sortPreference = 'highest_rated';
  } else if (/احدث|جديد|موديل جديد/.test(normalized)) {
    sortPreference = 'newest';
  }

  const priceMatch = query.match(/(?:ميزانية|سعر|بحدود|اقل من|أقل من|حتى|تحت|حدود)\s*(\d+[\d,]*)\s*(?:الف|ألف|ريال|ر\.ي|ر\.س)?/i);
  if (priceMatch) {
    let rawNum = priceMatch[1].replace(/,/g, '');
    let val = parseFloat(rawNum);
    if (/الف|ألف/.test(priceMatch[0]) && val < 1000) {
      val = val * 1000;
    }
    maxPrice = val;
  }

  const standaloneNumbers = query.match(/\b\d{4,7}\b/g);
  if (standaloneNumbers && !maxPrice) {
    maxPrice = parseFloat(standaloneNumbers[0]);
  }

  for (const [key, slug] of Object.entries(CATEGORY_SLUG_MAP)) {
    if (normalized.includes(key)) {
      detectedCategory = slug;
      break;
    }
  }

  const keywords = words.filter((w) => !ARABIC_STOP_WORDS.has(w) && w.length >= 2);
  const expandedKeywords = new Set(keywords);
  keywords.forEach((w) => {
    if (SYNONYMS_MAP[w]) {
      SYNONYMS_MAP[w].forEach((syn) => expandedKeywords.add(normalizeArabicText(syn)));
    }
  });

  return {
    normalized,
    keywords: Array.from(expandedKeywords),
    rawKeywords: keywords,
    maxPrice,
    minPrice,
    detectedCategory,
    sortPreference
  };
}

async function searchProductsHybrid({
  query = '',
  categorySlug = null,
  maxPrice = null,
  minPrice = null,
  sortBy = null,
  limit = 8,
  offset = 0
} = {}) {
  const parsed = extractEntitiesAndIntent(query);

  const finalCategory = categorySlug || parsed.detectedCategory;
  const finalMaxPrice = maxPrice || parsed.maxPrice;
  const finalMinPrice = minPrice || parsed.minPrice;
  const sort = sortBy || parsed.sortPreference;

  let sql = `
    SELECT
      p.id,
      p.product_id,
      p.title,
      p.description,
      p.price,
      p.old_price,
      p.sku,
      p.brand,
      p.warranty,
      p.shipping,
      p.delivery_time,
      p.stock_status,
      p.stock_quantity,
      p.rating,
      p.reviews_count,
      p.is_best_seller,
      p.is_new,
      c.name_ar as category_name,
      c.slug as category_slug,
      (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)
      AND (p.show_in_najm = 1 OR p.show_in_najm IS NULL)
  `;

  const params = [];

  // Category Relevance Filter
  if (finalCategory) {
    sql += ` AND (c.slug LIKE ? OR c.name_ar LIKE ?)`;
    params.push(`%${finalCategory}%`, `%${finalCategory}%`);
  }

  if (finalMaxPrice && finalMaxPrice > 0) {
    sql += ` AND p.price <= ?`;
    params.push(finalMaxPrice);
  }

  if (finalMinPrice && finalMinPrice > 0) {
    sql += ` AND p.price >= ?`;
    params.push(finalMinPrice);
  }

  if (sort === 'cheapest') {
    sql += ` ORDER BY p.price ASC, p.id DESC LIMIT 1000`;
  } else if (sort === 'highest_rated') {
    sql += ` ORDER BY p.rating DESC, p.reviews_count DESC, p.id DESC LIMIT 1000`;
  } else if (sort === 'newest') {
    sql += ` ORDER BY p.id DESC LIMIT 1000`;
  } else {
    sql += ` ORDER BY p.id DESC LIMIT 1000`;
  }

  let rows = [];
  const repos = getRepositories();
  try {
    rows = await repos.products.queryForAiSearch(sql, params);
  } catch (err) {
    console.error('SQL Search error:', err);
    return [];
  }

  // If no rows found with strict category, try fallback search without category only if query was specific
  let isCategoryFallback = false;
  if ((!rows || rows.length === 0) && finalCategory && parsed.rawKeywords.length > 0) {
    const fallbackSql = `
      SELECT
        p.id, p.product_id, p.title, p.description, p.price, p.old_price, p.sku, p.brand,
        p.warranty, p.shipping, p.delivery_time, p.stock_status, p.stock_quantity, p.rating,
        p.reviews_count, p.is_best_seller, p.is_new, c.name_ar as category_name, c.slug as category_slug,
        (SELECT image_path FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as main_image
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND (p.is_archived = 0 OR p.is_archived IS NULL)
        AND (p.show_in_najm = 1 OR p.show_in_najm IS NULL)
      ORDER BY p.is_best_seller DESC, p.reviews_count DESC LIMIT 100
    `;
    try {
      rows = await repos.products.queryForAiSearch(fallbackSql);
      // This fallback ignores the requested category entirely and pulls
      // site-wide best-sellers instead. Mark every row so callers (and,
      // through them, the model) can be honest that these are NOT category
      // matches -- without this flag they were indistinguishable from a
      // real category hit, and Najm could present an unrelated best-seller
      // (e.g. a kitchen appliance for a bedroom-furniture query) as if it
      // matched the customer's actual request.
      isCategoryFallback = true;
    } catch (_) {
      rows = [];
    }
  }

  if (!rows || rows.length === 0) return [];

  const searchTerms = parsed.keywords.length > 0 ? parsed.keywords : [normalizeArabicText(query)];

  const scoredProducts = (rows || []).map((p) => {
    const titleNorm = normalizeArabicText(p.title);
    const descNorm = normalizeArabicText(p.description || '');
    const brandNorm = normalizeArabicText(p.brand || '');
    const catNorm = normalizeArabicText(p.category_name || '');
    const haystack = `${titleNorm} ${descNorm} ${brandNorm} ${catNorm}`;

    let matchCount = 0;
    let titleMatch = 0;

    searchTerms.forEach((term) => {
      if (term && titleNorm.includes(term)) {
        titleMatch += 5;
        matchCount += 5;
      } else if (term && haystack.includes(term)) {
        matchCount += 1;
      }
    });

    const isAvailable = (isInStock(p.stock_status) || (p.stock_quantity && p.stock_quantity > 0)) ? 1.0 : 0.4;
    const ratingScore = Math.min((p.rating || 4.5) / 5, 1);
    const bestSellerBonus = p.is_best_seller ? 1.4 : 1.0;
    const discountBonus = (p.old_price && p.old_price > p.price) ? 1.2 : 1.0;

    let budgetScore = 1.0;
    if (finalMaxPrice && finalMaxPrice > 0) {
      const diffRatio = p.price / finalMaxPrice;
      if (diffRatio <= 1.0) {
        budgetScore = 1.0 + (1.0 - diffRatio) * 0.5;
      } else {
        budgetScore = 0.2;
      }
    }

    // Category guard bonus: matching category gets 3x boost
    let categoryBonus = 1.0;
    if (finalCategory && (p.category_slug === finalCategory || p.category_name?.includes(finalCategory))) {
      categoryBonus = 3.0;
    }

    const totalScore = (matchCount * 2.5 + titleMatch * 2.0) * categoryBonus * isAvailable * ratingScore * bestSellerBonus * discountBonus * budgetScore;

    return {
      id: p.id,
      product_id: p.product_id || p.id,
      title: p.title,
      description: p.description,
      brand: p.brand || 'زياد ستور',
      category_name: p.category_name,
      category_slug: p.category_slug,
      price: p.price,
      priceFormatted: `${Number(p.price || 0).toLocaleString('ar-YE')} ر.ي`,
      old_price: p.old_price,
      oldPriceFormatted: p.old_price ? `${Number(p.old_price).toLocaleString('ar-YE')} ر.ي` : null,
      discountPercent: (p.old_price && p.old_price > p.price) ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : null,
      stock_status: p.stock_status || 'in-stock',
      stockStatusAr: isInStock(p.stock_status) ? 'متوفر' : (isOutOfStock(p.stock_status) ? 'نفد' : 'طلب مسبق'),
      // Do NOT fabricate rating/reviews_count/warranty/delivery_time when the
      // database value is null -- this data becomes grounding context Najm
      // presents to customers as fact (e.g. a genuinely unspecified warranty
      // being confidently quoted as "معتمد لمدة سنتين"). Pass the real value
      // through, null and all; ratingScore above already has its own
      // internal-only default for ranking math and is never exposed here.
      rating: p.rating,
      reviews_count: p.reviews_count,
      main_image: p.main_image || 'assets/placeholder.svg',
      warranty: p.warranty || null,
      delivery_time: p.delivery_time || null,
      url: `product.html?id=${p.product_id || p.id}`,
      score: totalScore,
      isCategoryFallback
    };
  });

  // A sort preference has to order the *relevant* products, not replace
  // relevance with itself. "كم سعر أرخص ثلاجة عندكم؟" parses to
  // sortPreference='cheapest', and sorting all ~400 catalogue rows by price
  // answered "the cheapest anything we sell" -- kitchen cabinets and tables --
  // with not one fridge in the result, while the plain query "ثلاجة" returned
  // all five fridges correctly. Same for 'highest_rated'.
  //
  // Restrict to products that actually matched a search term, then apply the
  // requested ordering inside that set. When nothing matched, fall back to the
  // whole set (so the customer still gets something) but say so, rather than
  // presenting unrelated products as if they answered the question.
  const relevant = scoredProducts.filter((p) => p.score > 0);
  const hasSearchTerms = searchTerms.length > 0 && searchTerms[0] !== '';
  const noRelevanceMatch = hasSearchTerms && relevant.length === 0;
  const pool = relevant.length > 0 ? relevant : scoredProducts;

  if (sort === 'cheapest') {
    pool.sort((a, b) => a.price - b.price);
  } else if (sort === 'highest_rated') {
    pool.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews_count || 0) - (a.reviews_count || 0));
  } else if (hasSearchTerms) {
    pool.sort((a, b) => b.score - a.score || (b.reviews_count || 0) - (a.reviews_count || 0));
  }

  const page = pool.slice(offset, offset + limit);

  // Reuse the existing honesty flag: it already means "these are not matches
  // for what was actually asked", which is exactly the case here. Without it a
  // zero-relevance result set was indistinguishable downstream from a real hit
  // -- e.g. an English query, which no title in this Arabic catalogue matches.
  if (noRelevanceMatch) {
    return page.map((p) => ({ ...p, isCategoryFallback: true }));
  }
  return page;
}

async function getFeaturedRecommendations(limit = 8) {
  const repos = getRepositories();
  const rows = await repos.products.getFeaturedRecommendations(limit);

  return (rows || []).map((p) => ({
    id: p.id,
    product_id: p.product_id || p.id,
    title: p.title,
    brand: 'زياد ستور',
    price: p.price,
    priceFormatted: `${Number(p.price || 0).toLocaleString('ar-YE')} ر.ي`,
    old_price: p.old_price,
    oldPriceFormatted: p.old_price ? `${Number(p.old_price).toLocaleString('ar-YE')} ر.ي` : null,
    discountPercent: p.old_price && p.old_price > p.price ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : null,
    stock_status: p.stock_status || 'in-stock',
    stockStatusAr: isInStock(p.stock_status) ? 'متوفر' : 'طلب مسبق',
    rating: p.rating,
    reviews_count: p.reviews_count,
    main_image: p.main_image || 'assets/placeholder.svg',
    category_name: p.category_name,
    category_slug: p.category_slug,
    url: `product.html?id=${p.product_id || p.id}`
  }));
}

async function getComplementaryRecommendations(productId, categorySlug, limit = 4) {
  const repos = getRepositories();
  const rows = await repos.products.getComplementaryRecommendations(productId, categorySlug, limit);

  return (rows || []).map((p) => ({
    id: p.id,
    product_id: p.product_id || p.id,
    title: p.title,
    brand: 'زياد ستور',
    price: p.price,
    priceFormatted: `${Number(p.price || 0).toLocaleString('ar-YE')} ر.ي`,
    old_price: p.old_price,
    oldPriceFormatted: p.old_price ? `${Number(p.old_price).toLocaleString('ar-YE')} ر.ي` : null,
    discountPercent: p.old_price && p.old_price > p.price ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : null,
    stock_status: p.stock_status || 'in-stock',
    stockStatusAr: isInStock(p.stock_status) ? 'متوفر' : 'طلب مسبق',
    rating: p.rating,
    reviews_count: p.reviews_count,
    main_image: p.main_image || 'assets/placeholder.svg',
    category_name: p.category_name,
    url: `product.html?id=${p.product_id || p.id}`
  }));
}

module.exports = {
  normalizeArabicText,
  extractEntitiesAndIntent,
  searchProductsHybrid,
  getFeaturedRecommendations,
  getComplementaryRecommendations
};