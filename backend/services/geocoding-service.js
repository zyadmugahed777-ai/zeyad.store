/**
 * Zeyad For Business - Geocoding & Location Resolution Service
 * Intelligent Yemeni Geo-Dictionary + OSM Nominatim Proxy with Offline Fallback
 */

const https = require('https');
const http = require('http');

function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[أإآء]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove harakat/tashkeel
    .replace(/[-_،,\/\\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Local High-Accuracy Yemeni Geo-Dictionary with 60+ key districts and landmarks
const YEMENI_LOCATIONS = [
  // Sana'a City & Main Landmarks
  { name: 'صنعاء - أمانة العاصمة', city: 'صنعاء', province: 'أمانة العاصمة', district: 'أمانة العاصمة', lat: 15.369445, lng: 44.191006, type: 'city' },
  { name: 'السائلة - سائلة صنعاء القديمة', city: 'صنعاء', province: 'أمانة العاصمة', district: 'صنعاء القديمة - السائلة', lat: 15.3540, lng: 44.2135, type: 'landmark' },
  { name: 'صنعاء القديمة - باب اليمن', city: 'صنعاء', province: 'أمانة العاصمة', district: 'صنعاء القديمة', lat: 15.3533, lng: 44.2144, type: 'landmark' },
  { name: 'باب السباح - شارع القصر', city: 'صنعاء', province: 'أمانة العاصمة', district: 'التحرير', lat: 15.3510, lng: 44.2090, type: 'landmark' },
  { name: 'سوق الملح - صنعاء القديمة', city: 'صنعاء', province: 'أمانة العاصمة', district: 'صنعاء القديمة', lat: 15.3555, lng: 44.2155, type: 'landmark' },
  { name: 'ميدان التحرير - شارع علي عبدالمغني', city: 'صنعاء', province: 'أمانة العاصمة', district: 'التحرير', lat: 15.3550, lng: 44.2025, type: 'street' },
  { name: 'شارع الزبيري - صنعاء', city: 'صنعاء', province: 'أمانة العاصمة', district: 'التحرير - الوحدة', lat: 15.3524, lng: 44.1982, type: 'street' },
  { name: 'شارع جمال - شارع القصر', city: 'صنعاء', province: 'أمانة العاصمة', district: 'التحرير', lat: 15.3565, lng: 44.2050, type: 'street' },
  
  // Hadda & Southern Sana'a
  { name: 'حدة - صنعاء', city: 'صنعاء', province: 'أمانة العاصمة', district: 'السبعين - حدة', lat: 15.3148, lng: 44.1865, type: 'district' },
  { name: 'شارع حدة - الحي الدبلوماسي', city: 'صنعاء', province: 'أمانة العاصمة', district: 'حدة', lat: 15.3210, lng: 44.1880, type: 'street' },
  { name: 'الحي السياسي - شارع عمان', city: 'صنعاء', province: 'أمانة العاصمة', district: 'الوحدة - الحي السياسي', lat: 15.3360, lng: 44.1870, type: 'district' },
  { name: 'شارع بغداد - شارع الجزائر', city: 'صنعاء', province: 'أمانة العاصمة', district: 'الوحدة', lat: 15.3410, lng: 44.1950, type: 'street' },
  { name: 'ميدان السبعين - جامع الصالح', city: 'صنعاء', province: 'أمانة العاصمة', district: 'السبعين', lat: 15.3285, lng: 44.2120, type: 'landmark' },
  { name: 'حي الأصبحي - صنعاء', city: 'صنعاء', province: 'أمانة العاصمة', district: 'السبعين - الأصبحي', lat: 15.2950, lng: 44.2150, type: 'district' },
  { name: 'حي بيت بوس - شارع الخمسين', city: 'صنعاء', province: 'أمانة العاصمة', district: 'سنحان - بيت بوس', lat: 15.2750, lng: 44.2050, type: 'district' },
  { name: 'حي شميلة - شارع تعز', city: 'صنعاء', province: 'أمانة العاصمة', district: 'السبعين - شميلة', lat: 15.3120, lng: 44.2250, type: 'district' },
  { name: 'دار سلم - قاع القيضي', city: 'صنعاء', province: 'أمانة العاصمة', district: 'سنحان - دار سلم', lat: 15.2580, lng: 44.2380, type: 'district' },
  { name: 'أرتل - بيت زبطان', city: 'صنعاء', province: 'أمانة العاصمة', district: 'سنحان', lat: 15.2700, lng: 44.1850, type: 'district' },
  { name: 'حي بيت معياد - حي القادسية', city: 'صنعاء', province: 'أمانة العاصمة', district: 'السبعين', lat: 15.3220, lng: 44.2210, type: 'district' },
  { name: 'فج عطان - شارع الستين الجنوبي', city: 'صنعاء', province: 'أمانة العاصمة', district: 'الوحدة - عطان', lat: 15.3180, lng: 44.1680, type: 'district' },

  // Western & Northern Sana'a
  { name: 'شارع الستين الغربي - عصر', city: 'صنعاء', province: 'أمانة العاصمة', district: 'معين - عصر', lat: 15.3460, lng: 44.1650, type: 'street' },
  { name: 'شارع هائل - شارع الرقاص', city: 'صنعاء', province: 'أمانة العاصمة', district: 'معين - هائل', lat: 15.3620, lng: 44.1820, type: 'street' },
  { name: 'شارع صخر - الدائري الغربي - الجامعة', city: 'صنعاء', province: 'أمانة العاصمة', district: 'معين - الجامعة', lat: 15.3560, lng: 44.1820, type: 'street' },
  { name: 'شارع الرباط - شارع عشرين', city: 'صنعاء', province: 'أمانة العاصمة', district: 'معين', lat: 15.3680, lng: 44.1870, type: 'street' },
  { name: 'حي مذبح - شملان', city: 'صنعاء', province: 'أمانة العاصمة', district: 'معين - مذبح', lat: 15.3780, lng: 44.1550, type: 'district' },
  { name: 'الحصبة - شارع مازدا', city: 'صنعاء', province: 'أمانة العاصمة', district: 'الثورة - الحصبة', lat: 15.3902, lng: 44.2051, type: 'district' },
  { name: 'شارع المطار - جولة الجمنة - دارس', city: 'صنعاء', province: 'أمانة العاصمة', district: 'بني الحارث', lat: 15.4350, lng: 44.2180, type: 'street' },
  { name: 'شارع عمران - التلفزيون', city: 'صنعاء', province: 'أمانة العاصمة', district: 'الثورة', lat: 15.4050, lng: 44.1850, type: 'street' },
  { name: 'الجراف - الروضة - خط المطار', city: 'صنعاء', province: 'أمانة العاصمة', district: 'الثورة - الجراف', lat: 15.4120, lng: 44.2100, type: 'district' },
  { name: 'شيراتون - شارع النصر - سعوان', city: 'صنعاء', province: 'أمانة العاصمة', district: 'آزال - شيراتون', lat: 15.3650, lng: 44.2400, type: 'district' },
  { name: 'نقم - مسيك - هبرة', city: 'صنعاء', province: 'أمانة العاصمة', district: 'آزال - نقم', lat: 15.3520, lng: 44.2380, type: 'district' },
  { name: 'شارع خولان - الحثيلي', city: 'صنعاء', province: 'أمانة العاصمة', district: 'السبعين - خولان', lat: 15.3200, lng: 44.2450, type: 'street' },

  // Aden
  { name: 'عدن - المعلا / كريتر / خورمكسر', city: 'عدن', province: 'عدن', district: 'المعلا', lat: 12.7855, lng: 45.0187, type: 'city' },
  { name: 'كريتر - صيرة - عدن القديمة', city: 'عدن', province: 'عدن', district: 'صيرة - كريتر', lat: 12.7797, lng: 45.0366, type: 'district' },
  { name: 'خور مكسر - ساحل أبين', city: 'عدن', province: 'عدن', district: 'خور مكسر', lat: 12.8250, lng: 45.0380, type: 'district' },
  { name: 'المنصورة - ريمي - الحجاز', city: 'عدن', province: 'عدن', district: 'المنصورة', lat: 12.8580, lng: 44.9850, type: 'district' },
  { name: 'الشيخ عثمان - السيلة - عبد القوي', city: 'عدن', province: 'عدن', district: 'الشيخ عثمان', lat: 12.8750, lng: 44.9980, type: 'district' },
  { name: 'التواهي - القلوعة - جولدمور', city: 'عدن', province: 'عدن', district: 'التواهي', lat: 12.7880, lng: 44.9820, type: 'district' },
  { name: 'مدينة إنماء - كابوتا - الحسوة', city: 'عدن', province: 'عدن', district: 'البريقة - إنماء', lat: 12.8420, lng: 44.9350, type: 'district' },
  { name: 'البريقة - صلاح الدين - الخيسة', city: 'عدن', province: 'عدن', district: 'البريقة', lat: 12.7350, lng: 44.8620, type: 'district' },
  { name: 'دار سعد - الممدارة - بئر فضل', city: 'عدن', province: 'عدن', district: 'دار سعد', lat: 12.8980, lng: 45.0150, type: 'district' },

  // Taiz
  { name: 'تعز - شارع جمال - وسط المدينة', city: 'تعز', province: 'تعز', district: 'القاهرة', lat: 13.5779, lng: 44.0175, type: 'city' },
  { name: 'الحوبان - جولة الذكرة - مفرق ماوية', city: 'تعز', province: 'تعز', district: 'صالة - الحوبان', lat: 13.6250, lng: 44.0750, type: 'district' },
  { name: 'حي المسبح - التحرير الأسفل', city: 'تعز', province: 'تعز', district: 'المظفر', lat: 13.5890, lng: 44.0080, type: 'district' },
  { name: 'بير باشا - جامعة تعز - الدحي', city: 'تعز', province: 'تعز', district: 'المظفر - بير باشا', lat: 13.5680, lng: 43.9780, type: 'district' },
  { name: 'عصيفرة - كلابة - الروضة', city: 'تعز', province: 'تعز', district: 'القاهرة', lat: 13.6020, lng: 44.0250, type: 'district' },

  // Ibb
  { name: 'إب - شارع العدين - المدينة', city: 'إب', province: 'إب', district: 'الظهار', lat: 13.9759, lng: 44.1708, type: 'city' },
  { name: 'شارع تعز - المعاين - جبل ربي', city: 'إب', province: 'إب', district: 'المشنة', lat: 13.9680, lng: 44.1790, type: 'street' },
  { name: 'مفرق جبلة - السحول', city: 'إب', province: 'إب', district: 'ريف إب', lat: 13.9450, lng: 44.1520, type: 'district' },
  { name: 'يريم - كتاب - السمارة', city: 'يريم', province: 'إب', district: 'يريم', lat: 14.2980, lng: 44.3800, type: 'city' },

  // Hodeidah
  { name: 'الحديدة - شارع صنعاء - الكورنيش', city: 'الحديدة', province: 'الحديدة', district: 'الميناء - الحوك', lat: 14.7978, lng: 42.9545, type: 'city' },
  { name: 'شارع جمال - شارع جيزان - الحالي', city: 'الحديدة', province: 'الحديدة', district: 'الحالي', lat: 14.8120, lng: 42.9680, type: 'street' },
  { name: 'باجل - كيلو 16 - المراوعة', city: 'باجل', province: 'الحديدة', district: 'باجل', lat: 14.9850, lng: 43.2850, type: 'city' },

  // Hadramout
  { name: 'المكلا - ديس المكلا - الشرج', city: 'المكلا', province: 'حضرموت', district: 'المكلا', lat: 14.5425, lng: 49.1242, type: 'city' },
  { name: 'فوة - روكب - بويش', city: 'المكلا', province: 'حضرموت', district: 'فوة - المكلا', lat: 14.5280, lng: 49.0750, type: 'district' },
  { name: 'سيئون - تريم - شبام', city: 'سيئون', province: 'حضرموت', district: 'سيئون', lat: 15.9419, lng: 48.7871, type: 'city' },
  { name: 'الشحر - الحامي - الديس الشرقية', city: 'الشحر', province: 'حضرموت', district: 'الشحر', lat: 14.7580, lng: 49.6050, type: 'city' },

  // Raymah
  { name: 'مديرية مزهر - ريمة', city: 'مزهر', province: 'ريمة', district: 'مديرية مزهر', lat: 14.6320, lng: 43.7147, type: 'district' },
  { name: 'الجبين - عاصمة ريمة', city: 'الجبين', province: 'ريمة', district: 'الجبين', lat: 14.6300, lng: 43.7150, type: 'city' },
  { name: 'بلاد الطعام - ريمة', city: 'بلاد الطعام', province: 'ريمة', district: 'بلاد الطعام', lat: 14.7300, lng: 43.6800, type: 'district' },
  { name: 'كسمة - ريمة', city: 'كسمة', province: 'ريمة', district: 'كسمة', lat: 14.5500, lng: 43.6200, type: 'district' },
  { name: 'الجعفرية - ريمة', city: 'الجعفرية', province: 'ريمة', district: 'الجعفرية', lat: 14.4800, lng: 43.5500, type: 'district' },
  { name: 'السلفية - ريمة', city: 'السلفية', province: 'ريمة', district: 'السلفية', lat: 14.7500, lng: 43.8500, type: 'district' },

  // Other Provinces
  { name: 'ذمار - شارع رداع - جامعة ذمار', city: 'ذمار', province: 'ذمار', district: 'ذمار', lat: 14.5427, lng: 44.4051, type: 'city' },
  { name: 'رداع - البيضاء - السوادية', city: 'رداع', province: 'البيضاء', district: 'رداع', lat: 14.4250, lng: 44.8350, type: 'city' },
  { name: 'مأرب - المدينة - المجمع - الوادي', city: 'مأرب', province: 'مأرب', district: 'مدينة مأرب', lat: 15.4590, lng: 45.3253, type: 'city' },
  { name: 'عمران - خمر - ريدة', city: 'عمران', province: 'عمران', district: 'عمران', lat: 15.6600, lng: 43.9400, type: 'city' },
  { name: 'صعدة - المدينة - الطلح', city: 'صعدة', province: 'صعدة', district: 'صعدة', lat: 16.9400, lng: 43.7600, type: 'city' },
  { name: 'حجة - عبس - حرض', city: 'حجة', province: 'حجة', district: 'حجة', lat: 15.6920, lng: 43.6050, type: 'city' },
  { name: 'عتق - بيحان - عزان', city: 'عتق', province: 'شبوة', district: 'عتق', lat: 14.5350, lng: 46.8320, type: 'city' },
  { name: 'الغيضة - حوف - سيحوت', city: 'الغيضة', province: 'المهرة', district: 'الغيضة', lat: 16.2080, lng: 52.1760, type: 'city' },
  { name: 'الحوطة - تبن - طور الباحة', city: 'الحوطة', province: 'لحج', district: 'الحوطة', lat: 13.0600, lng: 44.8820, type: 'city' },
  { name: 'زنجبار - جعار - خنفر', city: 'زنجبار', province: 'أبين', district: 'زنجبار', lat: 13.1280, lng: 45.3800, type: 'city' },
  { name: 'الضالع - قعطبة - دمت', city: 'الضالع', province: 'الضالع', district: 'الضالع', lat: 13.6950, lng: 44.7300, type: 'city' },
  { name: 'المحويت - شبام كوكبان', city: 'المحويت', province: 'المحويت', district: 'المحويت', lat: 15.4700, lng: 43.5450, type: 'city' },
  { name: 'حديبو - قلنسية - سقطرى', city: 'حديبو', province: 'سقطرى', district: 'حديبو', lat: 12.6500, lng: 54.0200, type: 'city' }
];

class GeocodingService {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Search locations by query string
   */
  async searchLocations(query) {
    if (!query || !String(query).trim()) return [];
    const rawQ = String(query).trim();
    const normQ = normalizeArabic(rawQ);
    const cacheKey = `search:${normQ}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 1. Search local high-speed dictionary with Arabic normalization and fuzzy token matching
    const stopWords = ['مديرية', 'محافظة', 'مدينة', 'حي', 'منطقة', 'شارع', 'سوق', 'جولة', 'قرية', 'عاصمة'];
    let tokens = normQ.split(/\s+/).filter(Boolean);
    const meaningfulTokens = tokens.filter(t => !stopWords.includes(t));
    const activeTokens = meaningfulTokens.length > 0 ? meaningfulTokens : tokens;

    const strippedTokens = activeTokens.map(t => t.startsWith('ال') && t.length > 3 ? t.substring(2) : t);

    const localMatches = YEMENI_LOCATIONS.filter(loc => {
      const fullText = normalizeArabic(`${loc.name} ${loc.city} ${loc.district} ${loc.province}`);
      const tokenMatch = activeTokens.some(tok => fullText.includes(tok));
      if (tokenMatch) return true;
      const strippedMatch = strippedTokens.some(stok => fullText.includes(stok));
      if (strippedMatch) return true;
      return false;
    }).map(loc => ({
      name: loc.name,
      formatted_address: `${loc.name}، ${loc.province}، اليمن`,
      city: loc.city,
      province: loc.province.includes('العاصمة') ? 'صنعاء' : loc.province,
      district: loc.district,
      latitude: loc.lat,
      longitude: loc.lng,
      source: 'local_dictionary'
    }));

    if (localMatches.length >= 1) {
      this.cache.set(cacheKey, localMatches);
      return localMatches;
    }

    // 2. Try online Nominatim with timeout
    try {
      const onlineResults = await this.queryNominatimSearch(rawQ);
      const combined = [...localMatches, ...onlineResults];
      // Deduplicate by close lat/lng
      const unique = [];
      combined.forEach(item => {
        const isDupe = unique.some(u => 
          Math.abs(u.latitude - item.latitude) < 0.005 && Math.abs(u.longitude - item.longitude) < 0.005
        );
        if (!isDupe) unique.push(item);
      });
      const finalRes = unique.slice(0, 10);
      this.cache.set(cacheKey, finalRes);
      return finalRes;
    } catch (err) {
      // Fallback to closest local or default match
      return localMatches.length > 0 ? localMatches : [
        {
          name: rawQ,
          formatted_address: `${rawQ}، اليمن`,
          city: 'صنعاء',
          province: 'صنعاء',
          district: '',
          latitude: 15.369445,
          longitude: 44.191006,
          source: 'default_fallback'
        }
      ];
    }
  }

  /**
   * Fallback proximity location details
   */
  fallbackLocationDetails(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    let closestHub = YEMENI_LOCATIONS[0];
    let minDistance = Infinity;

    for (const loc of YEMENI_LOCATIONS) {
      const d = Math.hypot(loc.lat - lat, loc.lng - lng);
      if (d < minDistance) {
        minDistance = d;
        closestHub = loc;
      }
    }

    const isSanaaCoordinates = (lat >= 15.15 && lat <= 15.55 && lng >= 44.05 && lng <= 44.38);

    return {
      formatted_address: `${closestHub.name}، ${closestHub.province}، اليمن`,
      country: 'اليمن',
      province: isSanaaCoordinates ? 'صنعاء' : (closestHub.province.includes('العاصمة') ? 'صنعاء' : closestHub.province),
      city: isSanaaCoordinates ? 'صنعاء' : closestHub.city,
      district: closestHub.district,
      street: closestHub.type === 'street' ? closestHub.name : '',
      latitude: lat,
      longitude: lng,
      source: 'local_proximity'
    };
  }

  /**
   * Reverse Geocode (latitude, longitude) -> Structured Address
   */
  async reverseGeocode(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new Error('إحداثيات غير صحيحة');
    }

    const cacheKey = `rev:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 1. Proximity match to closest known Yemeni hub
    let closestHub = YEMENI_LOCATIONS[0];
    let minDistance = Infinity;

    for (const loc of YEMENI_LOCATIONS) {
      const d = Math.hypot(loc.lat - lat, loc.lng - lng);
      if (d < minDistance) {
        minDistance = d;
        closestHub = loc;
      }
    }

    // Determine zone directly from coordinates
    const isSanaaCoordinates = (lat >= 15.15 && lat <= 15.55 && lng >= 44.05 && lng <= 44.38);

    // 2. Try online Nominatim reverse query
    try {
      const onlineRev = await this.queryNominatimReverse(lat, lng);
      if (onlineRev && onlineRev.formatted_address) {
        const result = {
          formatted_address: onlineRev.formatted_address,
          country: 'اليمن',
          province: isSanaaCoordinates ? 'صنعاء' : (onlineRev.province || closestHub.province),
          city: isSanaaCoordinates ? 'صنعاء' : (onlineRev.city || closestHub.city),
          district: onlineRev.district || (isSanaaCoordinates ? closestHub.district : ''),
          street: onlineRev.street || '',
          latitude: lat,
          longitude: lng,
          source: 'nominatim'
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      // Continue to fallback
    }

    // 3. Fallback resolution from closest hub
    const fallbackRes = this.fallbackLocationDetails(lat, lng);
    this.cache.set(cacheKey, fallbackRes);
    return fallbackRes;
  }

  /**
   * Helper: Query OSM Nominatim Search API
   */
  queryNominatimSearch(q) {
    return new Promise((resolve, reject) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=ye&format=json&addressdetails=1&accept-language=ar&limit=5`;
      const req = https.get(url, {
        headers: { 'User-Agent': 'ZeyadForBusiness-ECommerce/2.0 (info@zeyad.store)' },
        timeout: 3000
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return resolve([]);
            const parsed = data.map(item => {
              const addr = item.address || {};
              const city = addr.city || addr.town || addr.municipality || addr.state || 'صنعاء';
              const province = addr.state || addr.region || city;
              const district = addr.suburb || addr.neighbourhood || addr.quarter || addr.district || '';
              return {
                name: item.display_name.split(',')[0],
                formatted_address: item.display_name,
                city,
                province,
                district,
                latitude: Number(item.lat),
                longitude: Number(item.lon),
                source: 'nominatim'
              };
            });
            resolve(parsed);
          } catch (e) {
            resolve([]);
          }
        });
      });

      req.on('error', () => resolve([]));
      req.on('timeout', () => { req.destroy(); resolve([]); });
    });
  }

  /**
   * Helper: Query OSM Nominatim Reverse API
   */
  queryNominatimReverse(lat, lng) {
    return new Promise((resolve, reject) => {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=ar`;
      const req = https.get(url, {
        headers: { 'User-Agent': 'ZeyadForBusiness-ECommerce/2.0 (info@zeyad.store)' },
        timeout: 3000
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (!data || !data.address) return resolve(null);
            const addr = data.address;
            const city = addr.city || addr.town || addr.municipality || addr.state || '';
            const province = addr.state || addr.region || city;
            const district = addr.suburb || addr.neighbourhood || addr.quarter || addr.district || '';
            const street = addr.road || addr.street || '';
            resolve({
              formatted_address: data.display_name,
              city,
              province,
              district,
              street
            });
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  }

  search(query) {
    return this.searchLocations(query);
  }

  reverse(latitude, longitude) {
    return this.reverseGeocode(latitude, longitude);
  }

  validateCoordinates(latitude, longitude) {
    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return { latitude: null, longitude: null, isValid: false, valid: false, error: 'الإحداثيات مطلوبة' };
    }
    const nLat = Number(latitude);
    const nLng = Number(longitude);
    if (Number.isNaN(nLat) || Number.isNaN(nLng)) {
      return { latitude: null, longitude: null, isValid: false, valid: false, error: 'الإحداثيات الجغرافية غير صحيحة' };
    }
    if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
      return { latitude: null, longitude: null, isValid: false, valid: false, error: 'نطاق الإحداثيات الجغرافية غير صالح' };
    }
    return { latitude: Number(nLat.toFixed(7)), longitude: Number(nLng.toFixed(7)), isValid: true, valid: true };
  }
}

const geocodingService = new GeocodingService();
module.exports = { GeocodingService, geocodingService, YEMENI_LOCATIONS };
