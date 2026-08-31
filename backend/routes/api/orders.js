const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { currencyService } = require('../../services/currency-service');
const { cartService } = require('../../services/cart-service');
const { couponService } = require('../../services/coupon-service');
const { addressService } = require('../../services/address-service');
const { deliveryService } = require('../../services/delivery-service');
const { geocodingService } = require('../../services/geocoding-service');
const { notificationService } = require('../../services/notification-service');
const { generateOrderId } = require('../../utils/order-number');
const { formatOrderForWhatsApp } = require('../../utils/whatsapp-prep');
const { sanitize, normalizePhone } = require('../../utils/helpers');
const variants = require('../../services/product-variant-service');
const { requireCustomer, currentCustomerId } = require('../../middleware/customer-auth');

// Create new order
router.post('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const { customer, items, paymentMethod, deliveryMethod, notes, couponCode } = req.body;
    const requestedCurrency = currencyService.normalizeCurrency(req.headers['x-currency'] || req.body.currency || 'SAR');
    const guestId = req.headers['x-guest-id'] || req.body.guestId || null;
    const sessionUserId = req.session?.customer?.id || null;

    if (!customer || !customer.firstName || !customer.phone) {
      return res.status(400).json({ success: false, error: 'بيانات العميل (الاسم ورقم الهاتف) مطلوبة' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'الطلب يجب أن يحتوي على منتج واحد على الأقل' });
    }

    const phone = normalizePhone(customer.phone);
    if (!phone || phone.length < 8) {
      return res.status(400).json({ success: false, error: 'رقم الهاتف غير صحيح' });
    }

    // 1. Authoritative financial calculations directly from repository products
    let subtotalSar = 0;
    const normalizedItems = [];

    for (const item of items) {
      const rawPid = item.id || item.product_id;
      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const product = await repos.products.findById(rawPid);

      if (!product) {
        return res.status(400).json({ success: false, error: `المنتج غير موجود: ${rawPid}` });
      }
      if (!product.is_active) {
        return res.status(400).json({ success: false, error: `المنتج "${product.title}" غير متاح للشراء حالياً` });
      }

      /* A size carries its own full price, so the size the customer chose --
         not the product's base price -- is what they owe. The price is looked
         up server-side from product_sizes; whatever the browser posted is only
         used to name the size, never to set its price. An unknown or stale
         label falls back to the base price rather than charging something that
         was never offered. */
      const chosenSize = String(item.selected_size || item.size || item.selectedSize || '').trim() || null;
      const productSizes = typeof repos.products.findSizes === 'function'
        ? await repos.products.findSizes(product.id)
        : [];
      const unitPriceSar = variants.priceForSize(product, productSizes, chosenSize);
      const sizeIsReal = !!(chosenSize && productSizes.some(s => s.label === chosenSize));
      const itemSubtotalSar = unitPriceSar * qty;
      subtotalSar += itemSubtotalSar;

      const unitPriceNative = await currencyService.convertPrice(unitPriceSar, requestedCurrency);
      const itemSubtotalNative = unitPriceNative * qty;

      let itemImg = item.image || item.image_url || item.main_image || null;
      if (!itemImg && product) {
        const prodImages = await repos.products.findImages(product.id);
        if (prodImages && prodImages.length > 0) {
          itemImg = prodImages[0].image_path;
        }
      }
      if (itemImg && !itemImg.startsWith('/') && !itemImg.startsWith('http') && !itemImg.startsWith('data:')) {
        itemImg = '/' + itemImg;
      }

      let itemColor = (item.selected_color || item.color || item.selectedColor || '').trim() || null;
      if (!itemColor && product) {
        const prodColors = await repos.products.findColors(product.id);
        if (prodColors && prodColors.length > 0) {
          itemColor = prodColors[0].name;
        } else if (product.colors) {
          try {
            const parsed = JSON.parse(product.colors);
            if (Array.isArray(parsed) && parsed.length > 0) {
              itemColor = parsed[0]?.name || (typeof parsed[0] === 'string' ? parsed[0] : null);
            }
          } catch (_) {
            itemColor = product.colors.split(/[,،]+/)[0]?.trim() || null;
          }
        }
      }

      normalizedItems.push({
        id: product.id,
        product_id: product.product_id || String(product.id),
        title: product.title,
        quantity: qty,
        selected_color: itemColor,
        /* Recorded on the order so the admin sees exactly what was bought, and
           so the price stays auditable after the product's sizes change. */
        selected_size: sizeIsReal ? chosenSize : null,
        selected_size_price: sizeIsReal ? unitPriceSar : null,
        image_url: itemImg || '/assets/placeholder.svg',
        unit_price_sar: unitPriceSar,
        subtotal_sar: itemSubtotalSar,
        unit_price: unitPriceNative,
        subtotal: itemSubtotalNative
      });
    }

    let freeShipping = false;
    let discountSar = 0;
    let validatedCoupon = null;

    // Validate coupon via canonical CouponService
    if (couponCode && String(couponCode).trim()) {
      const couponValidation = await couponService.validateCoupon(couponCode, {
        subtotalSar,
        customerPhone: phone,
        customerId: sessionUserId,
        targetCurrency: requestedCurrency
      });

      if (!couponValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: `تعذر تطبيق الكوبون: ${couponValidation.error}`
        });
      }

      validatedCoupon = couponValidation.coupon;
      discountSar = couponValidation.discount_sar;
      freeShipping = couponValidation.free_shipping;
    }

    // Extract and validate structured address & coordinates
    const addressInput = req.body.address || {};
    const addressIdInput = req.body.addressId || addressInput.id || null;
    const province = (req.body.province || addressInput.province || customer.province || customer.city || 'صنعاء').trim();
    const city = (req.body.city || addressInput.city || customer.city || 'صنعاء').trim();
    const district = (req.body.district || addressInput.district || customer.district || '').trim();
    const addressDetail = (req.body.address_line || addressInput.address_line || addressInput.addressDetail || customer.addressDetail || '').trim();

    const rawLat = (req.body.latitude !== undefined && req.body.latitude !== null && req.body.latitude !== '') 
      ? req.body.latitude 
      : (addressInput.latitude !== undefined && addressInput.latitude !== null && addressInput.latitude !== '' ? addressInput.latitude : null);

    const rawLng = (req.body.longitude !== undefined && req.body.longitude !== null && req.body.longitude !== '') 
      ? req.body.longitude 
      : (addressInput.longitude !== undefined && addressInput.longitude !== null && addressInput.longitude !== '' ? addressInput.longitude : null);

    let latitude = null;
    let longitude = null;

    if (rawLat !== null || rawLng !== null) {
      const coordValidation = geocodingService.validateCoordinates(rawLat, rawLng);
      if (!coordValidation.valid) {
        return res.status(400).json({ success: false, error: coordValidation.error || 'إحداثيات الموقع الجغرافي غير صالحة' });
      }
      latitude = coordValidation.latitude;
      longitude = coordValidation.longitude;
    }

    let formattedAddress = (req.body.formatted_address || addressInput.formatted_address || '').trim();
    if (!formattedAddress) {
      formattedAddress = [province, city, district, addressDetail].filter(Boolean).join(' - ');
    }

    const deliveryInfo = await deliveryService.evaluateCartDelivery(
      normalizedItems.map(it => ({
        productId: it.product_id,
        quantity: it.quantity,
        title: it.title
      })),
      { city, province, district, latitude, longitude },
      deliveryMethod || 'standard',
      validatedCoupon ? { free_shipping: freeShipping } : null,
      requestedCurrency
    );

    const shippingFeeSar = deliveryInfo.delivery_fee_sar || 0;
    const installationFeeSar = deliveryInfo.installation_fee_sar || 0;

    const totalSar = Math.max(0, subtotalSar - discountSar + shippingFeeSar + installationFeeSar);
    const subtotalNative = await currencyService.convertPrice(subtotalSar, requestedCurrency);
    const discountNative = await currencyService.convertPrice(discountSar, requestedCurrency);
    const shippingFeeNative = await currencyService.convertPrice(shippingFeeSar, requestedCurrency);
    const installationFeeNative = await currencyService.convertPrice(installationFeeSar, requestedCurrency);
    const totalNative = await currencyService.convertPrice(totalSar, requestedCurrency);
    const exchangeRate = await currencyService.getExchangeRate(requestedCurrency);

    // 2. Process complete order creation inside atomic Transaction
    const txResult = await repos.tx.run(async (db) => {
      // Bind repos to the checked-out transaction client, not the pool, so
      // every write below actually participates in this BEGIN/COMMIT/ROLLBACK
      // instead of silently autocommitting on a separate connection.
      const txRepos = getRepositories(null, db);

      // Resolve the customer this order belongs to.
      //
      // A signed-in customer is identified by their session, never by the
      // phone number in the request body: otherwise a logged-in shopper could
      // type a stranger's number at checkout and attach the order -- and the
      // profile overwrite below -- to that stranger's account.
      let customerRecord = sessionUserId
        ? await txRepos.customers.findById(sessionUserId)
        : await txRepos.customers.findByPhone(phone);

      if (!customerRecord && sessionUserId) {
        // Session points at a row that no longer exists. Fall back to the
        // phone path rather than writing an order with a dangling customer_id.
        customerRecord = await txRepos.customers.findByPhone(phone);
      }

      let customerId;

      if (customerRecord) {
        customerId = customerRecord.id;

        // Only the account's own owner may rewrite its profile. Before this
        // check, any anonymous caller could overwrite an existing customer's
        // name, email and address simply by placing an order that quoted their
        // phone number -- the order itself already carries its own address
        // snapshot, so nothing here is needed to record the delivery details.
        if (sessionUserId && Number(sessionUserId) === Number(customerId)) {
          await txRepos.customers.update(customerId, {
            first_name: customer.firstName,
            last_name: customer.lastName || customerRecord.last_name,
            email: customer.email || customerRecord.email,
            city,
            district,
            address_detail: addressDetail
          });
        }
      } else {
        customerId = await txRepos.customers.create({
          first_name: customer.firstName,
          last_name: customer.lastName || '',
          phone,
          email: customer.email || '',
          city,
          district,
          address_detail: addressDetail
        });
        customerRecord = { id: customerId, first_name: customer.firstName, phone: phone };
      }

      // Canonical Address handling
      let savedAddressId = addressIdInput ? Number(addressIdInput) : null;
      if (!savedAddressId && (city || addressDetail || latitude)) {
        try {
          const newAddr = await addressService.createAddress({
            title: 'عنوان الطلب',
            province,
            city,
            district,
            address_line: addressDetail,
            formatted_address: formattedAddress,
            latitude,
            longitude,
            notes: sanitize(notes)
          }, { customerId, guestId });
          if (newAddr) savedAddressId = newAddr.id;
        } catch (_) {}
      }

      // Atomic Coupon Redemption -- against the transaction client, so a
      // failure later in this callback rolls the redemption back too.
      if (validatedCoupon && validatedCoupon.id) {
        const redeemed = await txRepos.coupons.incrementUsage(validatedCoupon.id);
        if (!redeemed) {
          throw new Error('تعذر إتمام الطلب: تم استهلاك هذا الكوبون بالكامل أو انتهت مرات استخدامه بالتزامن');
        }
      }

      // Lock and decrement stock for every item in the same transaction.
      // Row-locked via FOR UPDATE to prevent two concurrent orders for the
      // last unit from both reading the same quantity and both succeeding.
      for (const item of normalizedItems) {
        await txRepos.products.decrementStockLocked(item.id, item.quantity);
      }

      // Insert Order record with complete snapshot
      const orderIdStr = await generateOrderId();
      const orderDbId = await txRepos.orders.create({
        order_id: orderIdStr,
        customer_id: customerId,
        status: 'pending',
        subtotal: subtotalNative,
        discount: discountNative,
        shipping_fee: shippingFeeNative,
        total: totalNative,
        currency: requestedCurrency,
        exchange_rate: exchangeRate,
        subtotal_sar: subtotalSar,
        discount_sar: discountSar,
        shipping_fee_sar: shippingFeeSar,
        total_sar: totalSar,
        payment_method: paymentMethod || 'cash-on-delivery',
        payment_method_label: null,
        delivery_method: deliveryMethod || 'standard',
        city,
        district,
        address_detail: addressDetail,
        notes: sanitize(notes),
        coupon_code: validatedCoupon ? validatedCoupon.code : null,
        coupon_id: validatedCoupon ? validatedCoupon.id : null,
        free_shipping: (deliveryInfo.free_shipping || freeShipping) ? 1 : 0,
        delivery_pricing_type: deliveryInfo.delivery_status,
        delivery_estimate_text: deliveryInfo.delivery_text,
        delivery_zone: deliveryInfo.zone,
        installation_fee_sar: installationFeeSar,
        installation_fee: installationFeeNative,
        installation_status: deliveryInfo.installation_status,
        address_id: savedAddressId,
        formatted_address: formattedAddress,
        province,
        latitude,
        longitude
      });

      // Insert Order Items
      await txRepos.orders.createOrderItems(orderDbId, normalizedItems);

      // Record Payment entry
      await txRepos.orders.createPayment({
        order_id: orderDbId,
        method: paymentMethod || 'cash-on-delivery',
        amount: totalNative,
        status: 'pending'
      });

      // Update customer lifetime stats
      await txRepos.customers.incrementOrderStats(customerId, totalSar);

      // Clear server cart
      try {
        await cartService.clearCart(sessionUserId, guestId);
      } catch (_) {}

      // Create linked admin notification
      try {
        await notificationService.createNotification({
          type: 'order',
          entityType: 'order',
          entityId: orderDbId,
          title: 'طلب شراء جديد',
          message: `طلب جديد #${orderIdStr} بإجمالي ${totalNative} ${requestedCurrency} من ${customer.firstName}`,
          actionUrl: `/admin/orders/${orderDbId}`
        });
      } catch (_) {}

      return {
        orderId: orderIdStr,
        orderDbId,
        customerId
      };
    });

    const { orderId, orderDbId } = txResult;

    const whatsappText = formatOrderForWhatsApp({
      orderId,
      customer,
      items: normalizedItems,
      financials: {
        subtotal: subtotalNative,
        discount: discountNative,
        shipping_fee: shippingFeeNative,
        total: totalNative,
        purchase_currency: requestedCurrency
      },
      paymentMethod,
      deliveryMethod,
      notes
    });

    res.status(201).json({
      success: true,
      orderId,
      orderNumber: orderId,
      orderDbId,
      whatsappText,
      message: 'تم إنشاء الطلب بنجاح'
    });

  } catch (error) {
    console.error('Order creation error:', error);
    res.status(400).json({ success: false, error: error.message || 'حدث خطأ أثناء معالجة الطلب' });
  }
});

// ---------------------------------------------------------------------------
// Guest order tracking.
//
// This used to accept an order number OR a phone number, either alone. Order
// numbers are sequential (ZFB-2026-000036), so "order number alone" meant
// anyone could walk the whole order book -- names, phone numbers, addresses,
// totals -- by counting. "Phone number alone" handed over a person's entire
// purchase history to anyone who knew their number.
//
// A guest must now present the pair: the order number AND the phone number on
// that order. Knowing one no longer yields the other. A signed-in customer is
// already identified, so they may look up their own orders with the order
// number by itself.
// ---------------------------------------------------------------------------
router.all(['/track', '/track/:phoneOrOrder'], async (req, res, next) => {
  try {
    const repos = getRepositories();
    const sessionCustomerId = req.session?.customer?.id || null;

    const positional = String(req.params.phoneOrOrder || '').trim().replace(/^#/, '');
    const orderNumberParam = String(req.query.orderNumber || req.body.orderNumber || positional || '').trim().replace(/^#/, '');
    const cleanPhone = normalizePhone(req.query.phone || req.body.phone || '');

    if (!orderNumberParam) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الطلب' });
    }

    if (!sessionCustomerId && (!cleanPhone || cleanPhone.length < 8)) {
      return res.status(400).json({
        success: false,
        code: 'PHONE_REQUIRED',
        error: 'يرجى إدخال رقم الطلب ورقم الهاتف المستخدم في الطلب معاً، أو تسجيل الدخول لعرض طلباتك'
      });
    }

    const order = await repos.orders.findByOrderId(orderNumberParam);

    // One response for "no such order" and for "that order is not yours".
    // Distinguishing them would confirm which order numbers exist, which is
    // the enumeration this endpoint is being closed against.
    const notFound = () => res.status(404).json({
      success: false,
      error: 'لم يتم العثور على أي طلب مطابق للبيانات المدخلة'
    });

    if (!order) return notFound();

    const belongsToSession = sessionCustomerId && Number(order.customer_id) === Number(sessionCustomerId);
    const phoneMatches = cleanPhone && normalizePhone(order.phone) === cleanPhone;

    if (!belongsToSession && !phoneMatches) return notFound();

    const items = (await repos.orders.findItemsByOrderId(order.id)) || [];
    const result = [{ ...order, items }];

    res.json({
      success: true,
      count: result.length,
      data: result,
      orders: result
    });

  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// The signed-in customer's own orders.
//
// The previous version resolved the customer from ?phone= when there was no
// session -- any phone number returned that person's orders -- and, failing
// even that, fell back to `findAll({}, 10, 0)`: the ten most recent orders in
// the entire store, handed to any caller who sent a guestId header. Identity
// now comes from the session and from nowhere else.
// ---------------------------------------------------------------------------
router.get('/my-orders', requireCustomer, async (req, res, next) => {
  try {
    const repos = getRepositories();
    const customerId = currentCustomerId(req);

    const orders = (await repos.orders.findByCustomer(customerId)) || [];

    const result = await Promise.all(orders.map(async ord => ({
      ...ord,
      items: (await repos.orders.findItemsByOrderId(ord.id)) || []
    })));

    res.json({
      success: true,
      count: result.length,
      data: result,
      orders: result
    });
  } catch (error) {
    next(error);
  }
});

// Validate coupon endpoint
router.post('/validate-coupon', async (req, res) => {
  try {
    const code = req.body.code || req.body.couponCode || '';
    const subtotal = parseFloat(req.body.subtotal) || 0;
    const currency = req.body.currency || 'SAR';
    const customerId = currentCustomerId(req);

    // Coupon eligibility is per customer ("one use each"), and the phone is
    // what identifies them to the coupon service. For a signed-in customer it
    // therefore has to come from the session: taking it from the body let
    // someone quote a stranger's number to probe whether that person had
    // already used a coupon, or to spend against their allowance. A guest has
    // no session, so their number still comes from the request.
    const customerPhone = customerId
      ? normalizePhone(req.session?.customer?.phone)
      : (req.body.phone || req.body.customerPhone || null);

    const subtotalSar = currency === 'SAR' ? subtotal : subtotal / (await currencyService.getExchangeRate(currency));

    const validation = await couponService.validateCoupon(code, {
      subtotalSar,
      customerPhone,
      customerId,
      targetCurrency: currency
    });

    if (!validation.isValid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    res.json({
      success: true,
      data: {
        code: validation.coupon.code,
        discountType: validation.coupon.discount_type,
        discountValue: validation.coupon.discount_value,
        discountAmount: validation.discount,
        discountAmountSar: validation.discount_sar,
        freeShipping: validation.free_shipping,
        minOrder: validation.coupon.min_order
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'تعذر التحقق من الكوبون' });
  }
});

// ---------------------------------------------------------------------------
// A single order.
//
// This was the plainest IDOR in the codebase: GET /api/orders/ZFB-2026-000012
// returned the order, its items, and the joined customer's name, phone, email
// and address to anyone who asked, with no session of any kind. Order numbers
// count upwards, so the whole customer list was one for-loop away.
//
// Holding the id is no longer sufficient. The order must belong to the
// session's own customer -- or the caller must be a signed-in operator, whose
// access to customer data is granted by the admin panel's RBAC and is
// unaffected by this route.
// ---------------------------------------------------------------------------
router.get('/:orderId', requireCustomer, async (req, res, next) => {
  try {
    const repos = getRepositories();
    const customerId = currentCustomerId(req);

    const order = await repos.orders.findByOrderId(req.params.orderId);

    // "Not yours" and "does not exist" answer identically, so a 403/404 split
    // cannot be used to discover which order numbers are real.
    if (!order || Number(order.customer_id) !== Number(customerId)) {
      return res.status(404).json({ success: false, error: 'الطلب غير موجود' });
    }

    const items = (await repos.orders.findItemsByOrderId(order.id)) || [];

    res.json({
      success: true,
      data: {
        ...order,
        items
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;