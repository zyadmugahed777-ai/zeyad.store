const router = require('express').Router();
const { cartService } = require('../../services/cart-service');
const { currencyService } = require('../../services/currency-service');
const { normalizePhone } = require('../../utils/helpers');
const { currentCustomerId } = require('../../middleware/customer-auth');

// Rate limiting map for coupon validations
const couponRateMap = new Map();
const COUPON_RATE_LIMIT = 15; // Max 15 attempts per minute per IP
const COUPON_RATE_WINDOW = 60 * 1000;

function checkCouponRateLimit(ip) {
  const now = Date.now();
  const history = couponRateMap.get(ip) || [];
  const validHistory = history.filter(ts => now - ts < COUPON_RATE_WINDOW);

  if (validHistory.length >= COUPON_RATE_LIMIT) {
    return false;
  }
  validHistory.push(now);
  couponRateMap.set(ip, validHistory);
  return true;
}

function getClientIdentity(req) {
  const userId = currentCustomerId(req);

  // A signed-in customer's cart is keyed on their id and nothing else. The
  // guest id arrives in a header the caller writes, so honouring it alongside
  // a session would let a logged-in shopper reach into an arbitrary guest
  // basket -- and, worse, let cart writes be attributed to a bucket that is
  // not theirs. Only a caller with no session gets a guest identity at all.
  let guestId = null;
  if (!userId) {
    guestId = req.headers['x-guest-id'] || req.query.guestId || req.body.guestId
      || req.cookies?.zfb_guest_id || req.sessionID || 'guest_default';
  }

  const currency = req.headers['x-currency'] || req.query.currency || req.body.currency || 'SAR';

  // The phone drives coupon eligibility ("one use per customer"), so for a
  // signed-in customer it must come from the session. Letting the body
  // override it would let someone spend a per-customer coupon on a stranger's
  // allowance by quoting their number.
  const customerPhone = userId
    ? normalizePhone(req.session?.customer?.phone)
    : normalizePhone(req.query.phone || req.body.phone || req.headers['x-customer-phone']);

  const city = (req.query.city || req.body.city || req.headers['x-city'] || '').trim();
  const province = (req.query.province || req.body.province || '').trim();
  const district = (req.query.district || req.body.district || '').trim();
  const latitude = req.query.latitude || req.body.latitude || null;
  const longitude = req.query.longitude || req.body.longitude || null;
  const deliveryMethod = req.query.deliveryMethod || req.body.deliveryMethod || 'standard';

  const location = { city, province, district, latitude, longitude };
  return { userId, guestId, currency, customerPhone, city, location, deliveryMethod };
}

function formatCartResponse(cart) {
  return {
    success: true,
    cart_id: cart.cart_id,
    count: cart.total_items || 0,
    subtotal: cart.subtotal || 0,
    subtotal_sar: cart.subtotal_sar || 0,
    discount: cart.discount || 0,
    discount_sar: cart.discount_sar || 0,
    total: cart.total || 0,
    total_sar: cart.total_sar || 0,
    totalFormatted: currencyService.formatPrice(cart.total || 0, cart.currency || 'SAR'),
    free_shipping: cart.free_shipping || false,
    delivery: cart.delivery || null,
    delivery_fee: cart.delivery?.delivery_fee || 0,
    delivery_text: cart.delivery?.delivery_text || '',
    installation_fee: cart.delivery?.installation_fee || 0,
    installation_text: cart.delivery?.installation_text || '',
    coupon: cart.coupon || null,
    coupon_notice: cart.coupon_notice || null,
    currency: cart.currency || 'SAR',
    items: cart.items || []
  };
}

// Get current cart
router.get('/', async (req, res) => {
  try {
    const { userId, guestId, currency, customerPhone, location, deliveryMethod } = getClientIdentity(req);
    const cart = await cartService.getCart(userId, guestId, currency, customerPhone, location, deliveryMethod);
    res.json(formatCartResponse(cart));
  } catch (error) {
    console.error('Get Cart Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// Add item to cart
router.post(['/add', '/items'], async (req, res) => {
  try {
    const { userId, guestId, currency, customerPhone } = getClientIdentity(req);
    const { productId, quantity = 1, selected_color, selectedColor, color, image_url, image } = req.body;

    if (!userId && !guestId) {
      return res.status(400).json({ success: false, error: 'جلسة المستخدم أو معرف الزائر مطلوب' });
    }
    if (!productId) {
      return res.status(400).json({ success: false, error: 'معرف المنتج مطلوب' });
    }

    const chosenColor = selected_color || selectedColor || color || null;
    const chosenImage = image_url || image || null;

    const updatedCart = await cartService.addItem(userId, guestId, productId, quantity, currency, customerPhone, chosenColor, chosenImage);
    res.json(formatCartResponse(updatedCart));
  } catch (error) {
    console.error('Add Cart Error:', error);
    res.status(400).json({ success: false, error: error.message || 'حدث خطأ أثناء إضافة المنتج' });
  }
});

// Update item quantity in cart
router.put('/update', async (req, res) => {
  try {
    const { userId, guestId, currency, customerPhone } = getClientIdentity(req);
    const { productId, quantity } = req.body;

    if (!userId && !guestId) {
      return res.status(400).json({ success: false, error: 'جلسة المستخدم أو معرف الزائر مطلوب' });
    }

    const updatedCart = await cartService.updateItem(userId, guestId, productId, quantity, currency, customerPhone);
    res.json(formatCartResponse(updatedCart));
  } catch (error) {
    console.error('Update Cart Error:', error);
    res.status(400).json({ success: false, error: error.message || 'حدث خطأ أثناء تحديث السلة' });
  }
});

// Remove item from cart
router.delete('/remove', async (req, res) => {
  try {
    const { userId, guestId, currency, customerPhone } = getClientIdentity(req);
    const { productId } = req.body;

    if (!userId && !guestId) {
      return res.status(400).json({ success: false, error: 'جلسة المستخدم أو معرف الزائر مطلوب' });
    }

    const updatedCart = await cartService.removeItem(userId, guestId, productId, currency, customerPhone);
    res.json(formatCartResponse(updatedCart));
  } catch (error) {
    console.error('Remove Cart Error:', error);
    res.status(500).json({ success: false, error: error.message || 'حدث خطأ أثناء إزالة المنتج' });
  }
});

// Apply coupon to cart
router.post('/coupon', async (req, res) => {
  try {
    const ip = req.ip || '127.0.0.1';
    if (!checkCouponRateLimit(ip)) {
      return res.status(429).json({
        success: false,
        error: 'تم تجاوز الحد المسموح لمحاولات الكوبونات. يرجى الانتظار دقيقة قبل المحاولة مرة أخرى.'
      });
    }

    const { userId, guestId, currency, customerPhone } = getClientIdentity(req);
    const code = req.body.code || req.body.couponCode || '';

    if (!userId && !guestId) {
      return res.status(400).json({ success: false, error: 'جلسة السلة غير موجودة' });
    }

    const updatedCart = await cartService.applyCoupon(userId, guestId, code, currency, customerPhone);
    res.json({
      ...formatCartResponse(updatedCart),
      message: updatedCart.free_shipping ? 'تم تطبيق عرض التوصيل المجاني بنجاح!' : 'تم تطبيق كود الخصم بنجاح!'
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'تعذر تطبيق الكوبون' });
  }
});

// Remove coupon from cart
router.delete('/coupon', async (req, res) => {
  try {
    const { userId, guestId, currency, customerPhone } = getClientIdentity(req);
    const updatedCart = await cartService.removeCoupon(userId, guestId, currency, customerPhone);
    res.json({
      ...formatCartResponse(updatedCart),
      message: 'تمت إزالة الكوبون بنجاح'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'حدث خطأ أثناء إزالة الكوبون' });
  }
});

// Clear cart
router.delete('/clear', async (req, res) => {
  try {
    const { userId, guestId } = getClientIdentity(req);
    await cartService.clearCart(userId, guestId);
    res.json({ success: true, count: 0, total: 0, items: [] });
  } catch (error) {
    console.error('Clear Cart Error:', error);
    res.status(500).json({ success: false, error: error.message || 'حدث خطأ أثناء تفريغ السلة' });
  }
});

// Merge guest cart into user cart
router.post('/merge', async (req, res) => {
  try {
    const userId = currentCustomerId(req);
    const { guestId, currency = 'SAR' } = req.body;

    if (userId && guestId) {
      await cartService.mergeGuestCart(guestId, userId);
    }

    // The phone comes from the session, not the body -- see getClientIdentity.
    const customerPhone = userId ? normalizePhone(req.session?.customer?.phone) : null;
    const updatedCart = await cartService.getCart(userId, null, currency, customerPhone);
    res.json(formatCartResponse(updatedCart));
  } catch (error) {
    console.error('Merge Cart Error:', error);
    res.status(500).json({ success: false, error: error.message || 'حدث خطأ أثناء دمج السلة' });
  }
});

module.exports = router;
