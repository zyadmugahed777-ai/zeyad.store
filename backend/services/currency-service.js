/**
 * Zeyad For Business - Central Currency & Financial Service
 * Authoritative financial engine for price conversions, formatting, and order calculations.
 * 
 * Rules:
 * - Base Currency: SAR (Saudi Riyal) - all catalog prices in DB are stored in SAR.
 * - Display / Purchase Currencies: SAR, YER (Yemeni Rial).
 * - Fixed Exchange Rate: 1 SAR = 140 YER (Dynamic via settings).
 * - Delegates data access to canonical repositories (products, coupons, settings).
 */

const { settingsService } = require('./settings-service');
const { getRepositories } = require('../repositories');

const BASE_CURRENCY = 'SAR';
const DEFAULT_EXCHANGE_RATE = 140;

class CurrencyService {
  constructor() {}

  getBaseCurrency() {
    return BASE_CURRENCY;
  }

  getSupportedCurrencies() {
    return ['SAR', 'YER'];
  }

  async getExchangeRate() {
    const rate = await settingsService.getNumber('exchange_rate', DEFAULT_EXCHANGE_RATE);
    return rate > 0 ? rate : DEFAULT_EXCHANGE_RATE;
  }

  normalizeCurrency(currency) {
    if (!currency || typeof currency !== 'string') return BASE_CURRENCY;
    const c = currency.toUpperCase().trim();
    if (c === 'YER' || c === 'ر.ي' || c === 'ريال يمني') return 'YER';
    if (c === 'SAR' || c === 'ر.س' || c === 'ريال سعودي') return 'SAR';
    return BASE_CURRENCY;
  }

  /**
   * Convert an amount from Base Currency (SAR) to Target Currency (SAR or YER)
   */
  async convertPrice(amountInSar, targetCurrency = 'SAR') {
    const num = Number(amountInSar) || 0;
    const curr = this.normalizeCurrency(targetCurrency);
    if (curr === 'SAR') {
      return Math.round(num * 100) / 100; // 2 decimal places max
    }
    const rate = await this.getExchangeRate();
    return Math.round(num * rate); // YER is integer
  }

  /**
   * Convert an amount in a given currency back to Base Currency (SAR)
   */
  async convertToSar(amount, fromCurrency = 'SAR') {
    const num = Number(amount) || 0;
    const curr = this.normalizeCurrency(fromCurrency);
    if (curr === 'SAR') {
      return num;
    }
    const rate = await this.getExchangeRate();
    return rate > 0 ? (num / rate) : num;
  }

  /**
   * Format price with currency symbol for display
   */
  formatPrice(amount, currency = 'SAR') {
    const num = Number(amount) || 0;
    const curr = this.normalizeCurrency(currency);
    if (curr === 'SAR') {
      return `${Math.round(num).toLocaleString('ar-SA')} ر.س`;
    }
    return `${Math.round(num).toLocaleString('ar-YE')} ر.ي`;
  }

  /**
   * Calculate complete authoritative order financials
   */
  async calculateOrderFinancials({ items = [], coupon = null, deliveryMethod = 'standard', currency = 'SAR' }) {
    const repos = getRepositories();
    const targetCurrency = this.normalizeCurrency(currency);
    const exchangeRate = await this.getExchangeRate();

    // 1. Calculate items subtotal in SAR by validating with DB
    let subtotalSar = 0;
    const enrichedItems = [];

    for (const item of items) {
      const pId = item.id || item.product_id;
      const product = await repos.products.findForOrderFinancials(pId);
      if (!product) {
        throw new Error(`المنتج المطلوب غير متوفر: ${pId}`);
      }
      if (product.is_active === false || product.is_active === 0) {
        throw new Error(`المنتج غير متاح للبيع حالياً: ${product.title}`);
      }

      const qty = Math.max(1, parseInt(item.quantity || item.qty || 1, 10));
      const unitPriceSar = Number(product.price) || 0;
      const itemSubtotalSar = unitPriceSar * qty;
      subtotalSar += itemSubtotalSar;

      const unitPricePurchase = await this.convertPrice(unitPriceSar, targetCurrency);
      const itemSubtotalPurchase = unitPricePurchase * qty;

      enrichedItems.push({
        id: product.id,
        product_id: product.product_id,
        title: product.title,
        main_image: product.main_image || '/assets/placeholder.svg',
        quantity: qty,
        unit_price_sar: unitPriceSar,
        subtotal_sar: itemSubtotalSar,
        unit_price: unitPricePurchase,
        subtotal: itemSubtotalPurchase,
        currency: targetCurrency
      });
    }

    // 2. Calculate Coupon Discount in SAR
    let discountSar = 0;
    let couponApplied = null;

    if (coupon) {
      const couponCode = (typeof coupon === 'string' ? coupon : coupon.code || '').trim().toUpperCase();
      if (couponCode) {
        const couponRow = await repos.coupons.findValidByCode(couponCode);

        if (couponRow) {
          const minOrderSar = Number(couponRow.min_order) || 0;
          if (subtotalSar >= minOrderSar) {
            if (couponRow.discount_type === 'percentage') {
              const pct = Math.min(100, Math.max(0, Number(couponRow.discount_value) || 0));
              discountSar = (subtotalSar * pct) / 100;
            } else {
              // Fixed amount - in SAR
              discountSar = Math.min(subtotalSar, Number(couponRow.discount_value) || 0);
            }
            couponApplied = {
              id: couponRow.id,
              code: couponRow.code,
              discount_type: couponRow.discount_type,
              discount_value: couponRow.discount_value,
              discount_sar: discountSar,
              discount: await this.convertPrice(discountSar, targetCurrency)
            };
          }
        }
      }
    }

    // 3. Calculate Shipping Fee
    // Standard is free (0). Express delivery fee: 500 YER or 500/140 = ~3.57 SAR
    let shippingFeeSar = 0;
    if (deliveryMethod === 'express') {
      const expressFeeYer = await settingsService.getNumber('express_delivery_fee', 500);
      shippingFeeSar = expressFeeYer / exchangeRate;
    }

    // 4. Calculate Final Totals
    const totalSar = Math.max(0, subtotalSar - discountSar + shippingFeeSar);

    const subtotalPurchase = await this.convertPrice(subtotalSar, targetCurrency);
    const discountPurchase = await this.convertPrice(discountSar, targetCurrency);
    const shippingFeePurchase = targetCurrency === 'YER' && deliveryMethod === 'express'
      ? await settingsService.getNumber('express_delivery_fee', 500)
      : await this.convertPrice(shippingFeeSar, targetCurrency);

    const totalPurchase = Math.max(0, subtotalPurchase - discountPurchase + shippingFeePurchase);

    return {
      base_currency: BASE_CURRENCY,
      purchase_currency: targetCurrency,
      exchange_rate: exchangeRate,
      subtotal_sar: Math.round(subtotalSar * 100) / 100,
      discount_sar: Math.round(discountSar * 100) / 100,
      shipping_fee_sar: Math.round(shippingFeeSar * 100) / 100,
      total_sar: Math.round(totalSar * 100) / 100,
      subtotal: subtotalPurchase,
      discount: discountPurchase,
      shipping_fee: shippingFeePurchase,
      total: totalPurchase,
      items: enrichedItems,
      coupon: couponApplied
    };
  }
}

const currencyServiceInstance = new CurrencyService();

module.exports = {
  CurrencyService,
  currencyService: currencyServiceInstance
};
