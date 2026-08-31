/**
 * Zeyad For Business - Central Cart Service
 * Canonical backend source of truth for all cart operations.
 * Supports Guest Carts, Authenticated Customer Carts, Automatic Merging, and Coupon Engine.
 * Refactored in Phase 1 Batch 5A to use Repository Layer.
 */

const { getRepositories } = require('../repositories');
const { currencyService } = require('./currency-service');
const { productService } = require('./product-service');
const { couponService } = require('./coupon-service');

class CartService {
  get repo() {
    return getRepositories().carts;
  }

  get productRepo() {
    return getRepositories().products;
  }

  async getOrCreateCart(userId = null, guestId = null) {
    if (!userId && !guestId) {
      throw new Error('User ID or Guest ID is required for cart operation');
    }

    // Ensure guest_session exists if guestId is provided (to satisfy FK constraint)
    if (guestId) {
      await this.repo.ensureGuestSession(guestId);
    }

    let cart = null;

    if (userId) {
      cart = await this.repo.findCartByUserId(userId);
      if (!cart && guestId) {
        // Check if there is an existing guest cart to claim
        const guestCart = await this.repo.findCartByGuestId(guestId);
        if (guestCart) {
          await this.repo.claimGuestCart(guestCart.id, userId);
          cart = { ...guestCart, user_id: userId };
        }
      }
    } else if (guestId) {
      cart = await this.repo.findCartByGuestId(guestId);
    }

    if (!cart) {
      const insertedId = await this.repo.createCart(userId || null, guestId || null);
      cart = {
        id: insertedId,
        user_id: userId || null,
        guest_id: guestId || null,
        coupon_code: null
      };
    }

    return cart;
  }

  async getCart(userId = null, guestId = null, currency = 'SAR', customerPhone = null, customerLocation = 'صنعاء', deliveryMethod = 'standard') {
    const targetCurrency = currencyService.normalizeCurrency(currency);
    const cart = await this.getOrCreateCart(userId, guestId);

    const rawItems = (await this.repo.findCartItems(cart.id)) || [];

    let totalItems = 0;
    let subtotalSar = 0;

    const items = [];
    for (const item of rawItems) {
      const qty = Math.max(1, parseInt(item.quantity, 10));
      totalItems += qty;

      const unitPriceSar = Number(item.price) || 0;
      const itemSubtotalSar = unitPriceSar * qty;
      subtotalSar += itemSubtotalSar;

      const unitPrice = await currencyService.convertPrice(unitPriceSar, targetCurrency);
      const itemSubtotal = unitPrice * qty;

      let imagePath = (item.ci_image_url || item.main_image || '').trim().replace(/\\/g, '/');
      if (!imagePath) imagePath = '/assets/placeholder.svg';
      else if (!imagePath.startsWith('/') && !imagePath.startsWith('http') && !imagePath.startsWith('data:')) imagePath = '/' + imagePath;

      const pid = item.product_id || item.stored_product_id;
      const isActive = item.is_active === true || item.is_active === 1;

      items.push({
        id: pid,
        product_id: pid,
        cart_item_id: item.cart_item_id,
        title: item.title,
        quantity: qty,
        selected_color: item.selected_color || null,
        selectedColor: item.selected_color || null,
        price_sar: unitPriceSar,
        subtotal_sar: itemSubtotalSar,
        price: unitPrice,
        subtotal: itemSubtotal,
        currency: targetCurrency,
        image: imagePath,
        image_url: imagePath,
        stock_status: item.stock_status,
        stock_quantity: item.stock_quantity,
        is_active: isActive,
        in_stock: isActive && item.stock_status !== 'out-of-stock' && item.stock_quantity >= qty
      });
    }

    const subtotal = await currencyService.convertPrice(subtotalSar, targetCurrency);

    // Coupon Evaluation & Dynamic Revalidation
    let appliedCoupon = null;
    let discountSar = 0;
    let discount = 0;
    let freeShipping = false;
    let couponNotice = null;

    if (cart.coupon_code) {
      const validation = await couponService.validateCoupon(cart.coupon_code, {
        subtotalSar,
        customerPhone,
        customerId: userId,
        targetCurrency
      });

      if (validation.isValid) {
        appliedCoupon = validation.coupon;
        discountSar = validation.discount_sar;
        discount = validation.discount;
        freeShipping = validation.free_shipping;
      } else {
        // Auto-remove invalid coupon from database via repository
        try {
          await this.repo.removeCoupon(cart.id);
        } catch (_) {}
        couponNotice = validation.error;
      }
    }

    const { deliveryService } = require('./delivery-service');
    const deliveryInfo = await deliveryService.evaluateCartDelivery(
      items,
      customerLocation,
      deliveryMethod,
      appliedCoupon ? { free_shipping: freeShipping } : null,
      targetCurrency
    );

    const effectiveDeliveryFeeSar = deliveryInfo.delivery_fee_sar || 0;
    const effectiveInstallationFeeSar = deliveryInfo.installation_fee_sar || 0;

    const totalSar = Math.max(0, subtotalSar - discountSar + effectiveDeliveryFeeSar + effectiveInstallationFeeSar);
    const total = await currencyService.convertPrice(totalSar, targetCurrency);

    return {
      cart_id: cart.id,
      user_id: cart.user_id,
      guest_id: cart.guest_id,
      items,
      total_items: totalItems,
      subtotal_sar: Math.round(subtotalSar * 100) / 100,
      subtotal,
      discount_sar: Math.round(discountSar * 100) / 100,
      discount,
      total_sar: Math.round(totalSar * 100) / 100,
      total,
      free_shipping: deliveryInfo.free_shipping,
      delivery: deliveryInfo,
      coupon: appliedCoupon ? {
        code: appliedCoupon.code,
        discount_type: appliedCoupon.discount_type,
        discount_value: appliedCoupon.discount_value,
        discount_label: appliedCoupon.discount_type === 'percentage' ? `خصم ${appliedCoupon.discount_value}%` : 'توصيل مجاني'
      } : null,
      coupon_notice: couponNotice,
      currency: targetCurrency
    };
  }

  async addItem(userId = null, guestId = null, productId, quantity = 1, currency = 'SAR', customerPhone = null, selectedColor = null, imageUrl = null) {
    const qty = Math.max(1, parseInt(quantity, 10));
    
    // Resolve product via product repo
    const product = await this.productRepo.findById(productId);
    if (!product) throw new Error(`المنتج غير موجود: ${productId}`);
    if (!product.is_active) throw new Error('المنتج غير متاح حالياً');

    const canonicalPid = product.product_id || String(product.id);
    const cart = await this.getOrCreateCart(userId, guestId);
    const colorVal = selectedColor ? String(selectedColor).trim() : null;
    let imgVal = imageUrl ? String(imageUrl).trim() : null;
    if (imgVal && !imgVal.startsWith('/') && !imgVal.startsWith('http') && !imgVal.startsWith('data:')) {
      imgVal = '/' + imgVal;
    }

    await this.repo.addItem(cart.id, canonicalPid, product.id, productId, qty, colorVal, imgVal);

    return await this.getCart(userId, guestId, currency, customerPhone);
  }

  async updateItem(userId = null, guestId = null, productId, quantity, currency = 'SAR', customerPhone = null) {
    const qty = parseInt(quantity, 10);
    const cart = await this.getOrCreateCart(userId, guestId);

    const product = await this.productRepo.findById(productId);
    if (!product) return await this.getCart(userId, guestId, currency, customerPhone);

    const canonicalPid = product.product_id || String(product.id);

    await this.repo.updateItem(cart.id, canonicalPid, product.id, productId, qty);

    return await this.getCart(userId, guestId, currency, customerPhone);
  }

  async removeItem(userId = null, guestId = null, productId, currency = 'SAR', customerPhone = null) {
    const product = await this.productRepo.findById(productId);
    if (!product) return await this.getCart(userId, guestId, currency, customerPhone);

    const canonicalPid = product.product_id || String(product.id);
    const cart = await this.getOrCreateCart(userId, guestId);

    await this.repo.removeItem(cart.id, canonicalPid, product.id, productId);

    return await this.getCart(userId, guestId, currency, customerPhone);
  }

  async applyCoupon(userId = null, guestId = null, code, currency = 'SAR', customerPhone = null) {
    const cart = await this.getOrCreateCart(userId, guestId);
    const currentCart = await this.getCart(userId, guestId, currency, customerPhone);

    if (!currentCart.items || currentCart.items.length === 0) {
      throw new Error('السلة فارغة. أضف منتجات لتطبيق الكوبون.');
    }

    const validation = await couponService.validateCoupon(code, {
      subtotalSar: currentCart.subtotal_sar,
      customerPhone,
      customerId: userId,
      targetCurrency: currency
    });

    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    await this.repo.setCoupon(cart.id, validation.coupon.code);

    return await this.getCart(userId, guestId, currency, customerPhone);
  }

  async removeCoupon(userId = null, guestId = null, currency = 'SAR', customerPhone = null) {
    const cart = await this.getOrCreateCart(userId, guestId);
    await this.repo.removeCoupon(cart.id);

    return await this.getCart(userId, guestId, currency, customerPhone);
  }

  async clearCart(userId = null, guestId = null) {
    if (!userId && !guestId) return { success: true };

    if (userId) {
      const userCart = await this.repo.findCartByUserId(userId);
      if (userCart) {
        await this.repo.clearCartById(userCart.id);
      }
    }
    if (guestId) {
      const guestCart = await this.repo.findCartByGuestId(guestId);
      if (guestCart) {
        await this.repo.clearCartById(guestCart.id);
      }
    }

    return { success: true, message: 'Cart cleared successfully' };
  }

  async mergeGuestCart(guestId, userId) {
    if (!guestId || !userId) return;

    const guestCart = await this.repo.findGuestCartForMerge(guestId, userId);
    if (!guestCart) return;

    const userCart = await this.getOrCreateCart(userId, null);

    await this.repo.mergeGuestCart(guestCart.id, userCart.id, guestCart.coupon_code, userCart.coupon_code);
  }
}

const cartServiceInstance = new CartService();

module.exports = {
  CartService,
  cartService: cartServiceInstance
};
