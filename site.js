
// ---------------------------------------------------------------------------
// HTML escaping for values interpolated into markup below.
//
// Product titles, brands and descriptions are operator-supplied free text, and
// saved addresses are typed by the customer. Both were going into innerHTML
// raw, which is the same defect already proven exploitable on the search page:
// a value containing markup executes as script for whoever loads the page.
// Self-contained so it cannot depend on another file's load order.
// ---------------------------------------------------------------------------
function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

(function () {
  const CART_KEY = "zfb.cart";
  const ORDER_KEY = "zfb.lastOrder";
  const WISHLIST_KEY = "zfb.wishlist";

  const paymentMethods = [
    { id: "kuraimi", label: "كريمي" },
    { id: "jaib", label: "جيب" },
    { id: "jawali", label: "جوالي" },
    { id: "floosk", label: "فلوسك" },
    { id: "one-cash", label: "ون كاش" },
    { id: "bank-transfer", label: "حوالة بنكية" },
    { id: "money-transfer", label: "حوالة مالية" },
    { id: "cash-on-delivery", label: "الدفع عند الاستلام" },
    { id: "gold", label: "ذهب" },
    { id: "direct-transfer", label: "تحويل مباشر" },
  ];

  // Preserve navigation context for seamless support & issue reports
  try {
    sessionStorage.setItem('zfb_last_page', window.location.href);
    const urlParams = new URLSearchParams(window.location.search);
    const pId = urlParams.get('product_id') || urlParams.get('pid') || urlParams.get('id');
    const pTitle = document.querySelector('h1.product-title, .product-hero h1, .product-main h1')?.textContent?.trim();
    if (pId) sessionStorage.setItem('zfb_last_product_id', pId);
    if (pTitle) sessionStorage.setItem('zfb_last_product_title', pTitle);
  } catch (_) {}

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('zfb-state-change', { detail: { key, value: value } }));
  }

  function createId(prefix) {
    return `${prefix}-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  function normalizePhone(value) {
    return String(value || "").replace(/[^\d+]/g, "");
  }

  function getApiError(data, fallback) {
    return data?.error || data?.message || fallback || "تعذر تنفيذ الطلب. حاول مرة أخرى.";
  }

  function normalizeApiAction(action) {
    const map = {
      "/api/submit-form": "/api/contact",
      "/api/book-appointment": "/api/appointments",
      "/api/request-consultation": "/api/consultations",
      "/api/request-design": "/api/designs",
      "/api/request-quote": "/api/quotes",
    };
    return map[action] || action;
  }

  function normalizeFormData(form) {
    const formData = new FormData(form);
    const action = form.getAttribute("action") || "";

    if (action === "/api/submit-form") {
      const firstName = formData.get("firstName");
      const lastName = formData.get("lastName");
      if (formData.get("contactName") && !formData.has("fullName")) formData.set("fullName", formData.get("contactName"));
      if (formData.get("contactPhone") && !formData.has("phone")) formData.set("phone", formData.get("contactPhone"));
      if (formData.get("contactSubject") && !formData.has("subject")) formData.set("subject", formData.get("contactSubject"));
      if ((firstName || lastName) && !formData.has("fullName")) formData.set("fullName", `${firstName || ""} ${lastName || ""}`.trim());
      if (!formData.has("subject")) formData.set("subject", "طلب من نموذج الموقع");
      if (!formData.has("message")) {
        const details = Array.from(formData.entries())
          .filter(([key]) => !["fullName", "message"].includes(key))
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n");
        formData.set("message", details || "طلب جديد من الموقع");
      }
    }

    return formData;
  }

  async function submitApiForm(form) {
    const formData = normalizeFormData(form);
    const hasFiles = Array.from(formData.values()).some((value) => (
      typeof File !== "undefined" && value instanceof File && value.name && value.size > 0
    ));
    const fetchOptions = {
      method: form.method?.toUpperCase() || "POST",
      headers: { Accept: "application/json" },
    };

    if (hasFiles) {
      fetchOptions.body = formData;
    } else {
      fetchOptions.headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(Object.fromEntries(formData.entries()));
    }

    const response = await fetch(normalizeApiAction(form.getAttribute("action")), {
      ...fetchOptions,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(getApiError(data));
    return data;
  }

  function isYemeniPhone(value) {
    const phone = normalizePhone(value);
    return /^(?:\+?967)?7[01378]\d{7}$/.test(phone) || /^(?:\+?967)?[12]\d{6,8}$/.test(phone);
  }

  function ProductModel(input) {
    const selectedColor = input.selected_color || input.selectedColor || input.color || null;
    const imageUrl = input.image || input.image_url || input.main_image || (input.gallery && input.gallery[0]) || null;
    return {
      id: input.id || input.product_id || "",
      product_id: input.product_id || input.id || "",
      sku: input.sku || "",
      name: input.name || input.title || "",
      title: input.title || input.name || "",
      category: input.category || "",
      subcategory: input.subcategory || "",
      brand: input.brand || "",
      quantity: Math.max(1, Number(input.quantity) || 1),
      price: Number(input.price) || 0,
      discount: Number(input.discount) || 0,
      stock: input.stock || "",
      currency: input.currency || "YER",
      selected_color: selectedColor,
      selectedColor: selectedColor,
      color: selectedColor,
      image: imageUrl,
      image_url: imageUrl,
      gallery: input.gallery || (imageUrl ? [imageUrl] : [])
    };
  }

  function CustomerModel(input) {
    const firstName = input.firstName || "";
    const lastName = input.lastName || "";
    return {
      id: input.id || createId("CUS"),
      firstName,
      lastName,
      name: input.name || `${firstName} ${lastName}`.trim(),
      phone: normalizePhone(input.phone),
      email: input.email || "",
      city: input.city || "",
      address: input.address || {},
      notes: input.notes || "",
    };
  }

  function CartModel(items) {
    const products = (items || []).map((item) => ProductModel(item));
    const subtotal = products.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discount = products.reduce((sum, item) => sum + item.discount * item.quantity, 0);
    return {
      id: createId("CART"),
      products,
      subtotal,
      discount,
      totalQuantity: products.reduce((sum, item) => sum + item.quantity, 0),
      currency: "YER",
    };
  }

  function OrderModel(input) {
    const cart = CartModel(input.products || []);
    const shipping = Number(input.shipping || 0);
    return {
      orderId: input.orderId || createId("ZFB"),
      customer: CustomerModel(input.customer || {}),
      products: cart.products,
      productIds: cart.products.map((item) => item.id),
      quantities: Object.fromEntries(cart.products.map((item) => [item.id, item.quantity])),
      prices: Object.fromEntries(cart.products.map((item) => [item.id, item.price])),
      discount: Number(input.discount ?? cart.discount) || 0,
      shipping,
      paymentMethod: input.paymentMethod || {},
      orderTotal: Number(input.orderTotal ?? cart.subtotal - cart.discount + shipping) || 0,
      createdAt: input.createdAt || new Date().toISOString(),
      status: input.status || "pending-confirmation",
      currency: input.currency || "YER",
      notes: input.notes || "",
      integrations: {
        whatsappBusinessReady: true,
        adminPanelReady: true,
        databaseReady: true,
      },
    };
  }

  window.ZFBBackend = {
    keys: { cart: CART_KEY, order: ORDER_KEY, wishlist: WISHLIST_KEY },
    models: { ProductModel, CartModel, OrderModel, CustomerModel },
  };

  function numberFromText(text) {
    const western = String(text || "")
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
    const value = parseFloat((western.match(/[\d,.]+/) || ["0"])[0].replace(/,/g, ""));
    return Number.isFinite(value) ? value : 0;
  }

  function productFromElement(source) {
    const card = source.closest("[data-product-id], .product-card, .premium-product-page, .cart-item, .summary-product");
    const title = card?.querySelector("h1, h3, h4")?.textContent?.trim() || "منتج من زياد ستور";
    const priceText =
      card?.dataset.price ||
      card?.querySelector("[data-field='price'], .current, .price strong, .cart-item-price strong, .summary-product-price")?.textContent ||
      "0";
    const id =
      card?.dataset.productId ||
      title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) ||
      "zfb-product";

    let rawPrice = numberFromText(priceText);
    const baseSarAttr = card?.getAttribute('data-base-sar') || card?.querySelector('[data-base-sar]')?.getAttribute('data-base-sar');
    if (baseSarAttr && !isNaN(parseFloat(baseSarAttr))) {
      rawPrice = parseFloat(baseSarAttr);
    } else if (window.PRODUCTS_DB) {
      const dbItem = window.PRODUCTS_DB.find(p => String(p.id) === String(id) || String(p.product_id) === String(id) || p.sku === card?.dataset.sku);
      if (dbItem && dbItem.price) {
        rawPrice = Number(dbItem.price);
      }
    }

    return {
      id,
      sku: card?.dataset.sku || "",
      title,
      name: title,
      quantity: Math.max(1, parseInt(card?.querySelector("input[type='number']")?.value || "1", 10)),
      price: rawPrice,
      discount: numberFromText(card?.dataset.discount || card?.querySelector(".discount, .saving")?.textContent || "0"),
      priceText: priceText.trim(),
      category: card?.dataset.category || document.body.dataset.category || "",
      subcategory: card?.dataset.subcategory || "",
      brand: card?.dataset.brand || card?.querySelector("[data-field='brand']")?.textContent?.trim() || "",
      stock: card?.dataset.stock || card?.querySelector(".stock span, [data-field='availability']")?.textContent?.trim() || "",
      currency: card?.dataset.currency || "SAR",
      image: card?.querySelector("img")?.getAttribute("src") || "",
      image_url: card?.querySelector("img")?.getAttribute("src") || "",
      selected_color: card?.dataset.color || card?.dataset.selectedColor || null,
      selectedColor: card?.dataset.color || card?.dataset.selectedColor || null,
      gallery: card?.querySelector("img")?.getAttribute("src") ? [card.querySelector("img").getAttribute("src")] : [],
    };
  }

  window.productFromElement = productFromElement;

  function cartTotal(cart) {
    return cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
  }

  function cartCount() {
    if (window.ZFB && window.ZFB.Cart) return window.ZFB.Cart.count();
    return read(CART_KEY, []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  }

  function updateCartBadges() {
    const count = cartCount();
    document.querySelectorAll("#floating-cart-count, .cart b, .zfb-mobile-cart-count, .cart-badge-count, .cart-count-badge, .nav-cart-badge").forEach((node) => {
      node.textContent = count;
      node.setAttribute("data-order", String(count));
      if (node.classList.contains('zfb-mobile-cart-count') || node.classList.contains('cart-badge-count')) {
        node.hidden = count <= 0;
        node.style.display = count > 0 ? 'inline-block' : 'none';
      }
    });
    window.dispatchEvent(new CustomEvent("zfb-state-change", { detail: { key: CART_KEY, count: count } }));
  }

  window.updateCartBadges = updateCartBadges;

  function addItem(source) {
    const item = productFromElement(source);
    if (!item || !item.id) return null;

    if (window.ZFB && window.ZFB.Cart && typeof window.ZFB.Cart.add === 'function') {
      window.ZFB.Cart.add(item, item.quantity || 1);
    } else {
      const cart = read(CART_KEY, []);
      const existing = cart.find((entry) => String(entry.id) === String(item.id) || (entry.sku && entry.sku === item.sku));
      if (existing) {
        existing.quantity = (Number(existing.quantity) || 1) + (Number(item.quantity) || 1);
      } else {
        cart.push(item);
      }
      write(CART_KEY, cart);
    }

    // Async sync with backend cart
    const currentGuestId = localStorage.getItem('zfb.guest_id') || 'guest_' + Date.now();
    localStorage.setItem('zfb.guest_id', currentGuestId);
    fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-guest-id': currentGuestId },
      body: JSON.stringify({ productId: item.id || item.product_id, quantity: item.quantity || 1 })
    }).catch(() => {});

    updateCartBadges();
    return item;
  }

  window.addToCart = function (button, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    const original = button.innerHTML;
    
    try {
        const item = addItem(button);
        if(!item || !item.id) throw new Error("Product data missing");
        
        // Visual Feedback (works reliably across all themes)
        button.setAttribute("aria-live", "polite");
        button.innerHTML = "✓ تمت الإضافة";
        button.style.setProperty("background", "#16a34a", "important");
        button.style.setProperty("color", "#ffffff", "important");
        
        // Bounce animation for the cart icon
        const cartIcons = document.querySelectorAll('.cart svg, .cart-icon, .zfb-mobile-cart-btn svg, .nav-cart-item svg');
        cartIcons.forEach(icon => {
          icon.style.transform = 'scale(1.25)';
          setTimeout(() => { icon.style.transform = 'scale(1)'; }, 250);
        });

        // Show luxury Toast notification
        if (typeof showToast === 'function') {
          showToast(`تمت إضافة "${item.title}" إلى سلة التسوق`);
        } else if (window.ZFB && window.ZFB.Notification) {
          window.ZFB.Notification.show(`تمت إضافة "${item.title}" إلى السلة`, 'success');
        }
    } catch(err) {
        console.error("Cart Error:", err);
        button.innerHTML = "خطأ";
        button.style.setProperty("background", "#ef4444", "important");
        button.style.setProperty("color", "#ffffff", "important");
    }

    setTimeout(() => {
        button.innerHTML = original;
        button.style.removeProperty("background");
        button.style.removeProperty("color");
    }, 1500);
  };

  function setupSearch() {
    document.querySelectorAll("form.search").forEach((form) => {
      if (!form.querySelector("[name='q']")) {
        const input = form.querySelector("input[type='search']");
        if (input) input.name = "q";
      }
      form.action = "search.html";
      form.method = "get";
      form.addEventListener("submit", (event) => {
        const value = form.querySelector("input[type='search']")?.value.trim();
        if (!value) event.preventDefault();
      });
    });
  }

  function getCart() {
    let items = [];
    if (window.ZFB && window.ZFB.Cart && window.ZFB.Cart.get) {
      items = window.ZFB.Cart.get() || [];
    }
    if (!items || items.length === 0) {
      items = read(CART_KEY, []);
    }
    return (items || []).map(item => {
      let price = Number(item.price || item.currentPrice || item.oldPrice || 0);
      if (price <= 0 && window.PRODUCTS_DB) {
        const itemId = item.id || item.product_id || item.productId || item.sku;
        const dbP = window.PRODUCTS_DB.find(p => String(p.id) === String(itemId) || String(p.product_id || '') === String(itemId) || p.sku === item.sku);
        if (dbP) {
          price = Number(dbP.price || dbP.currentPrice || dbP.oldPrice || 0);
        }
      }
      return { ...item, price };
    });
  }
  window.getCart = getCart;

  async function renderCheckoutSummary() {
    const cart = getCart();
    const currentCurrency = window.ZFB_CURRENCY ? window.ZFB_CURRENCY.getCurrency() : (localStorage.getItem('zfb_currency') || 'SAR');

    function formatNative(amount, cur = currentCurrency) {
      const num = Math.round(Number(amount) || 0);
      const formatted = num.toLocaleString('ar-YE');
      return cur === 'SAR' ? `${formatted} ر.س` : `${formatted} ر.ي`;
    }

    const container = document.getElementById("checkout-items-container");
    if (container) {
       container.innerHTML = "";
       if (cart.length === 0) {
          container.innerHTML = "<div style='text-align:center; padding: 20px; color: var(--muted);'>السلة فارغة</div>";
       } else {
          cart.forEach(item => {
             let basePrice = Number(item.price || item.currentPrice || item.unitPrice || 0);
             if (basePrice <= 0 && window.PRODUCTS_DB) {
               const pId = item.id || item.product_id || item.sku;
               const dbP = window.PRODUCTS_DB.find(p => String(p.id) === String(pId) || String(p.product_id) === String(pId) || p.sku === item.sku);
               if (dbP) basePrice = Number(dbP.price || 0);
             }

             let itemDisplayPrice = basePrice;
             if (currentCurrency === 'YER') {
               if (basePrice < 50000) itemDisplayPrice = Math.round(basePrice * 140);
             } else {
               if (basePrice > 50000) itemDisplayPrice = Math.round(basePrice / 140);
             }

             const div = document.createElement('div');
             div.className = 'summary-product';
             div.setAttribute('data-product-id', item.id || item.sku || "");
             div.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px dashed var(--line,#eee);';
             const col = item.selected_color || item.color || item.selectedColor;
             div.innerHTML = `
               <img src="${item.image || (item.gallery && item.gallery[0]) || '/assets/placeholder.svg'}" alt="${escHtml(item.title)}" style="width:54px; height:54px; border-radius:10px; object-fit:cover; border:1px solid var(--line,#eee);" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
               <div class="summary-product-info" style="flex:1;">
                 <h3 style="font-size:0.88rem; font-weight:700; margin:0 0 4px; color:var(--ink,#111);">${escHtml(item.title)}</h3>
                 ${col ? `<span style="display:inline-block; font-size:0.75rem; color:var(--gold,#c79a52); background:rgba(199,154,82,0.12); padding:1px 6px; border-radius:4px; margin-bottom:4px; font-weight:600;">اللون: ${col}</span>` : ''}
                 <p class="summary-product-price" style="font-size:0.85rem; font-weight:700; color:var(--gold,#c79a52); margin:0;">${itemDisplayPrice > 0 ? formatNative(itemDisplayPrice, currentCurrency) : 'حسب الاختيار'}</p>
               </div>
               <span class="summary-product-quantity" style="font-weight:700; font-size:0.88rem; background:var(--surface-alt,#f8fafc); padding:4px 8px; border-radius:6px;">x${item.quantity || 1}</span>
             `;
             container.appendChild(div);
          });
       }
    }

    const guestId = (typeof getGuestId === 'function' ? getGuestId() : (localStorage.getItem('zfb.guest_id') || localStorage.getItem('zfb_guest_id') || ''));
    const cityInput = getInput('city');
    const selectedCity = (cityInput?.value || 'صنعاء').trim();
    const selectedDeliveryCard = document.querySelector(".delivery-options .delivery-card.selected");
    const isPickup = selectedDeliveryCard?.textContent?.includes('المعرض') || selectedDeliveryCard?.dataset?.method === 'showroom_pickup';
    const deliveryMethod = isPickup ? 'showroom_pickup' : 'standard';

    const latVal = getInput('address-latitude')?.value || '';
    const lngVal = getInput('address-longitude')?.value || '';

    const totalsContainer = document.querySelector(".summary-totals");
    if (!totalsContainer) return;

    const subtotalLine = totalsContainer.querySelector(".subtotal-line") || totalsContainer.querySelector(".summary-line:nth-child(1)");
    const subtotalAmount = totalsContainer.querySelector(".subtotal-amount");
    const countTextEl = totalsContainer.querySelector(".checkout-items-count-text");
    const discountLine = totalsContainer.querySelector(".discount-line") || totalsContainer.querySelector(".summary-line.discount");
    const discountLabel = totalsContainer.querySelector(".discount-label");
    const discountAmount = totalsContainer.querySelector(".discount-amount");
    const deliveryLine = totalsContainer.querySelector(".delivery-line") || totalsContainer.querySelector(".summary-line:nth-child(3)");
    const deliveryAmount = totalsContainer.querySelector(".delivery-amount");
    const instLine = document.getElementById("checkout-summary-installation-line");
    const instAmount = document.getElementById("checkout-installation-amount");
    const totalElement = totalsContainer.querySelector(".total-amount") || totalsContainer.querySelector(".summary-total strong");
    const mobileTotalStr = document.querySelector(".mobile-checkout-total strong");

    const localItemCount = cart.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
    if (countTextEl) countTextEl.textContent = `${localItemCount}`;

    // Checkout coupon UI elements
    const checkoutInputGroup = document.getElementById("checkout-coupon-input-group");
    const checkoutBadge = document.getElementById("checkout-applied-coupon-badge");
    const checkoutBadgeLabel = document.getElementById("checkout-applied-coupon-label");

    try {
      const res = await fetch(`/api/cart?currency=${currentCurrency}&guestId=${guestId}&city=${encodeURIComponent(selectedCity)}&deliveryMethod=${deliveryMethod}&latitude=${encodeURIComponent(latVal)}&longitude=${encodeURIComponent(lngVal)}&_t=${Date.now()}`, {
        headers: { 'x-guest-id': guestId, 'x-currency': currentCurrency }
      });
      const data = await res.json();
      if (data && data.success) {
        const cur = data.currency || currentCurrency;
        if (subtotalAmount) subtotalAmount.textContent = formatNative(data.subtotal, cur);
        else if (subtotalLine) {
          const spans = subtotalLine.querySelectorAll("span");
          if (spans.length >= 2) spans[1].textContent = formatNative(data.subtotal, cur);
        }

        // Coupon Handling
        if (data.coupon) {
          if (checkoutInputGroup) checkoutInputGroup.style.display = "none";
          if (checkoutBadge) checkoutBadge.style.display = "flex";
          if (checkoutBadgeLabel) checkoutBadgeLabel.textContent = `${data.coupon.code} (${data.coupon.discount_label})`;
          if (discountLine && data.discount > 0) {
            discountLine.style.display = "flex";
            if (discountLabel) discountLabel.textContent = `خصم الكوبون (${data.coupon.code})`;
            if (discountAmount) discountAmount.textContent = `- ${formatNative(data.discount, cur)}`;
          } else if (discountLine) {
            discountLine.style.display = "none";
          }
          localStorage.setItem("zfb_applied_coupon", data.coupon.code);
        } else {
          if (checkoutInputGroup) checkoutInputGroup.style.display = "flex";
          if (checkoutBadge) checkoutBadge.style.display = "none";
          if (discountLine) discountLine.style.display = "none";
          localStorage.removeItem("zfb_applied_coupon");
        }

        // Delivery Display: Strictly Free if Coupon/Pickup/FreePolicy, Range if Range policy, Quote if Quote Required
        if (deliveryAmount) {
          if (data.coupon?.discount_type === 'free_shipping' || data.is_coupon_free_shipping) {
            deliveryAmount.textContent = "مجاناً (عرض كوبون)";
            deliveryAmount.style.color = "#16a34a";
          } else if (isPickup) {
            deliveryAmount.textContent = "مجاناً (استلام من المعرض)";
            deliveryAmount.style.color = "#16a34a";
          } else if (data.delivery?.delivery_status === 'free' || data.free_shipping) {
            deliveryAmount.textContent = "مجاناً";
            deliveryAmount.style.color = "#16a34a";
          } else if (data.delivery?.delivery_status === 'range' && data.delivery?.delivery_range_text) {
            deliveryAmount.textContent = `توصيل تقديري: ${data.delivery.delivery_range_text}`;
            deliveryAmount.style.color = "var(--primary-gold, #c79a52)";
          } else if (data.delivery?.delivery_status === 'quote') {
            deliveryAmount.textContent = "يتم تحديد رسوم التوصيل بعد تأكيد الطلب";
            deliveryAmount.style.color = "var(--muted, #9ca3af)";
          } else {
            deliveryAmount.textContent = "يتم تحديد رسوم التوصيل بعد تأكيد الطلب";
            deliveryAmount.style.color = "inherit";
          }
        } else if (deliveryLine) {
          const spans = deliveryLine.querySelectorAll("span");
          if (spans.length >= 2) {
            if (data.coupon?.discount_type === 'free_shipping' || data.is_coupon_free_shipping) {
              spans[1].textContent = "مجاناً (عرض كوبون)";
              spans[1].style.color = "#16a34a";
            } else if (isPickup) {
              spans[1].textContent = "مجاناً (استلام من المعرض)";
              spans[1].style.color = "#16a34a";
            } else if (data.delivery?.delivery_status === 'free' || data.free_shipping) {
              spans[1].textContent = "مجاناً";
              spans[1].style.color = "#16a34a";
            } else if (data.delivery?.delivery_status === 'range' && data.delivery?.delivery_range_text) {
              spans[1].textContent = `توصيل تقديري: ${data.delivery.delivery_range_text}`;
              spans[1].style.color = "var(--primary-gold, #c79a52)";
            } else {
              spans[1].textContent = "يتم تحديد رسوم التوصيل بعد تأكيد الطلب";
              spans[1].style.color = "inherit";
            }
          }
        }

        // Installation Display Handling
        if (instLine && instAmount) {
          if (data.delivery && (data.delivery.requires_installation || data.delivery.installation_fee_sar > 0 || data.delivery.installation_fee > 0 || data.delivery.installation_status === 'included')) {
            instLine.style.display = "flex";
            if (data.delivery.installation_status === 'included') {
              instAmount.textContent = "شامل مع التوصيل";
              instAmount.style.color = "#16a34a";
            } else if (data.delivery.installation_fee > 0) {
              instAmount.textContent = `+ ${formatNative(data.delivery.installation_fee, cur)}`;
              instAmount.style.color = "var(--primary-gold, #c79a52)";
            } else {
              instLine.style.display = "none";
            }
          } else {
            instLine.style.display = "none";
          }
        }

        // Grand Total: strictly Subtotal - Discount + Installation (authoritative from backend)
        if (totalElement) totalElement.textContent = formatNative(data.total, cur);
        if (mobileTotalStr) mobileTotalStr.textContent = formatNative(data.total, cur);
        return;
      }
    } catch (_) {}

    // Offline fallback
    let localSub = 0;
    cart.forEach(it => {
      let p = Number(it.price || it.currentPrice || 0);
      if (currentCurrency === 'YER' && p < 50000) p = p * 140;
      localSub += p * (Number(it.quantity) || 1);
    });
    if (subtotalAmount) subtotalAmount.textContent = formatNative(localSub, currentCurrency);
    if (totalElement) totalElement.textContent = formatNative(localSub, currentCurrency);
    if (mobileTotalStr) mobileTotalStr.textContent = formatNative(localSub, currentCurrency);
  }
  window.renderCheckoutSummary = renderCheckoutSummary;

  function setupSelectableCards(selector) {
    document.querySelectorAll(selector).forEach((card) => {
      card.addEventListener("click", () => {
        const group = card.parentElement;
        group.querySelectorAll(selector).forEach((item) => {
          item.classList.remove("selected");
          item.setAttribute("aria-checked", "false");
        });
        card.classList.add("selected");
        card.setAttribute("aria-checked", "true");
        if (window.renderCheckoutSummary) window.renderCheckoutSummary();
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          card.click();
        }
      });
    });
  }

  function setupPaymentMethods() {
    const notesSection = document.querySelector("#notes-title")?.closest(".checkout-section");
    if (!notesSection || document.querySelector(".payment-options")) return;
    const section = document.createElement("section");
    section.className = "checkout-section";
    section.setAttribute("aria-labelledby", "payment-title");
    section.innerHTML = `
      <div class="section-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
        <h2 id="payment-title">طريقة الدفع</h2>
      </div>
      <div class="payment-options" role="radiogroup" aria-label="طريقة الدفع">
        ${paymentMethods
          .map(
            (method, index) => `
          <div class="delivery-card payment-card${index === 0 ? " selected" : ""}" role="radio" aria-checked="${index === 0 ? "true" : "false"}" tabindex="0" data-payment-method="${method.id}" data-order="payment-method">
            <div class="delivery-radio"></div>
            <div class="delivery-card-body">
              <strong>${method.label}</strong>
              <span>سيتم تأكيد تفاصيل الدفع مع فريق المبيعات بعد إنشاء الطلب</span>
            </div>
          </div>`
          )
          .join("")}
      </div>
      <p class="form-hint">لا يتم تحصيل أي مبلغ داخل الموقع حالياً. يتم تجهيز الطلب فقط للربط لاحقاً مع واتساب بزنس أو لوحة الإدارة أو قاعدة البيانات.</p>
    `;
    notesSection.before(section);
    setupSelectableCards(".payment-card");
  }

  function setInvalid(field, message) {
    field.setAttribute("aria-invalid", "true");
    let error = field.parentElement.querySelector(".field-error");
    if (!error) {
      error = document.createElement("p");
      error.className = "field-error";
      field.parentElement.appendChild(error);
    }
    error.textContent = message;
  }

  function clearInvalid(field) {
    field.removeAttribute("aria-invalid");
    field.parentElement.querySelector(".field-error")?.remove();
  }

  function getInput(id) {
    return document.getElementById(id);
  }

  function normalizePaymentMethodId(id) {
    return {
      jeeb: "jaib",
      floosak: "floosk",
      cod: "cash-on-delivery",
    }[id] || id || "";
  }

  function getSelectedPaymentMethod() {
    const selectedCard = document.querySelector(".payment-card.selected");
    if (selectedCard) {
      return {
        id: selectedCard.dataset.paymentMethod || "",
        label: selectedCard.querySelector("strong")?.textContent.trim() || "",
      };
    }

    const select = getInput("payment-method");
    const id = normalizePaymentMethodId(select?.value);
    return {
      id,
      label: select?.selectedOptions?.[0]?.textContent.trim() || "",
    };
  }

  function validateCheckout() {
    const required = ["first-name", "last-name", "phone", "city", "district"];
    if (getInput("payment-method")) required.push("payment-method");
    let valid = true;
    required.forEach((id) => {
      const field = getInput(id);
      if (!field) return;
      if (!field.value.trim()) {
        valid = false;
        setInvalid(field, "هذا الحقل مطلوب لإكمال الطلب");
      } else {
        clearInvalid(field);
      }
    });
    const phone = getInput("phone");
    if (phone && phone.value.trim() && !isYemeniPhone(phone.value)) {
      valid = false;
      setInvalid(phone, "أدخل رقم هاتف صحيح للتواصل");
    }
    return valid;
  }

  function buildOrderObject() {
    const cart = read(CART_KEY, []);
    const products = cart.length
      ? cart
      : Array.from(document.querySelectorAll(".summary-product")).map((item) => productFromElement(item));
    const selectedDelivery = document.querySelector(".delivery-options .delivery-card.selected");
    const selectedPayment = getSelectedPaymentMethod();
    const deliveryCost = numberFromText(selectedDelivery?.querySelector(".delivery-card-price")?.textContent);
    const subtotal = cartTotal(products);
    const discounts = products.reduce((sum, item) => sum + (Number(item.discount) || 0), 0);

    const lat = getInput("address-latitude")?.value ? parseFloat(getInput("address-latitude").value) : null;
    const lng = getInput("address-longitude")?.value ? parseFloat(getInput("address-longitude").value) : null;
    const addrId = getInput("address-id")?.value ? parseInt(getInput("address-id").value, 10) : null;
    const prov = getInput("province")?.value || getInput("city")?.value || "صنعاء";
    const formattedAddr = getInput("formatted-address")?.value || "";

    const order = OrderModel({
      customer: {
        firstName: getInput("first-name")?.value.trim() || "",
        lastName: getInput("last-name")?.value.trim() || "",
        phone: getInput("phone")?.value.trim() || "",
        email: getInput("email")?.value.trim() || "",
        city: getInput("city")?.value || "",
        address: {
          id: addrId,
          province: prov,
          district: getInput("district")?.value.trim() || "",
          detail: getInput("address-detail")?.value.trim() || "",
          formattedAddress: formattedAddr,
          latitude: lat,
          longitude: lng
        },
      },
      products,
      paymentMethod: selectedPayment,
      shipping: deliveryCost,
      discount: discounts,
      orderTotal: subtotal - discounts + deliveryCost,
      notes: getInput("notes")?.value.trim() || "",
    });
    return {
      ...order,
      orderedAt: order.createdAt,
      city: order.customer.city,
      address: order.customer.address,
      delivery: {
        method: selectedDelivery?.querySelector("strong")?.textContent.trim() || "",
        cost: deliveryCost,
      },
      subtotal,
      discounts: order.discount,
      deliveryCost,
      total: order.orderTotal,
      customerNotes: order.notes,
      couponCode: localStorage.getItem("zfb_applied_coupon") || order.couponCode || "",
    };
  }


  function setupCheckout() {
    setupSelectableCards(".delivery-card");
    setupPaymentMethods();
    
    // Canonical location and summary synchronization
    window.addEventListener("cartUpdated", renderCheckoutSummary);
    window.addEventListener("zfb-state-change", renderCheckoutSummary);
    window.addEventListener("zfb-currency-change", renderCheckoutSummary);
    window.addEventListener("zfb-location-change", renderCheckoutSummary);

    getInput("city")?.addEventListener("change", (e) => {
      if (window.ZFB_CHECKOUT_LOCATION) {
        window.ZFB_CHECKOUT_LOCATION.city = e.target.value;
        window.ZFB_CHECKOUT_LOCATION.province = e.target.value;
      }
      renderCheckoutSummary();
    });
    getInput("district")?.addEventListener("input", (e) => {
      if (window.ZFB_CHECKOUT_LOCATION) {
        window.ZFB_CHECKOUT_LOCATION.district = e.target.value.trim();
      }
    });
    getInput("address-detail")?.addEventListener("input", (e) => {
      if (window.ZFB_CHECKOUT_LOCATION) {
        window.ZFB_CHECKOUT_LOCATION.address_line = e.target.value.trim();
      }
    });

    // Initialize Interactive Checkout Map
    const mapContainer = document.getElementById("zfb-checkout-map-container");
    if (mapContainer && window.ZFBCheckoutMap) {
      window.zfbCheckoutMap = new window.ZFBCheckoutMap("zfb-checkout-map-container", {
        onLocationSelected: (loc) => {
          if (getInput("address-latitude")) getInput("address-latitude").value = loc.latitude;
          if (getInput("address-longitude")) getInput("address-longitude").value = loc.longitude;
          if (getInput("province")) getInput("province").value = loc.province || '';
          if (getInput("formatted-address")) getInput("formatted-address").value = loc.formatted_address || '';
          renderCheckoutSummary();
        }
      });
    }

    // Load saved addresses for user/guest
    (async () => {
      try {
        const guestId = (typeof getGuestId === 'function' ? getGuestId() : (localStorage.getItem('zfb.guest_id') || localStorage.getItem('zfb_guest_id') || ''));
        const res = await fetch(`/api/addresses?guestId=${guestId}`);
        const resData = await res.json();
        if (resData.success && Array.isArray(resData.data) && resData.data.length > 0) {
          const savedContainer = document.getElementById("checkout-saved-addresses-container");
          const savedList = document.getElementById("checkout-saved-addresses-list");
          if (savedContainer && savedList) {
            savedContainer.style.display = "block";
            savedList.innerHTML = resData.data.map((addr, idx) => `
              <div class="zfb-saved-address-card ${idx === 0 ? 'selected' : ''}" data-id="${addr.id}" data-lat="${addr.latitude || ''}" data-lng="${addr.longitude || ''}" data-city="${addr.city || ''}" data-province="${addr.province || ''}" data-district="${addr.district || ''}" data-address="${addr.address_line || ''}">
                <div class="zfb-saved-address-radio"></div>
                <div style="flex: 1;">
                  <strong>${escHtml(addr.title || 'عنوان محفوظ')}: ${escHtml(addr.city || '')} - ${escHtml(addr.district || '')}</strong>
                  <p style="margin: 2px 0 0; font-size: 0.8rem; color: var(--muted, #9ca3af);">${addr.formatted_address || addr.address_line || ''}</p>
                </div>
              </div>
            `).join('');

            savedList.querySelectorAll(".zfb-saved-address-card").forEach(card => {
              card.addEventListener("click", () => {
                savedList.querySelectorAll(".zfb-saved-address-card").forEach(c => c.classList.remove("selected"));
                card.classList.add("selected");
                const addrId = card.dataset.id;
                const lat = parseFloat(card.dataset.lat);
                const lng = parseFloat(card.dataset.lng);
                const city = card.dataset.city;
                const district = card.dataset.district;
                const addr = card.dataset.address;

                if (getInput("address-id")) getInput("address-id").value = addrId;
                if (getInput("city") && city) {
                  const sel = getInput("city");
                  for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === city || sel.options[i].text === city) {
                      sel.selectedIndex = i;
                      break;
                    }
                  }
                }
                if (getInput("district") && district) getInput("district").value = district;
                if (getInput("address-detail") && addr) getInput("address-detail").value = addr;
                if (getInput("address-latitude") && !isNaN(lat)) getInput("address-latitude").value = lat;
                if (getInput("address-longitude") && !isNaN(lng)) getInput("address-longitude").value = lng;

                if (window.zfbCheckoutMap && !isNaN(lat) && !isNaN(lng)) {
                  window.zfbCheckoutMap.setLocation(lat, lng, true);
                }
                renderCheckoutSummary();
              });
            });
          }
        }
      } catch (_) {}
    })();

    // Auto-prefill if the customer is logged in.
    //
    // Waits on ready(), which resolves once the server has answered
    // /api/auth/me. The old code read a synchronous localStorage snapshot, so
    // the fields it filled reflected whatever was cached rather than who the
    // server says is signed in -- and on a cold load, with the cache empty,
    // they were simply not filled at all.
    if (window.ZFB_AUTH && window.ZFB_AUTH.ready) {
      window.ZFB_AUTH.ready().then((user) => {
        if (!user || !user.id) return;
        const fill = (id, value) => {
          const field = getInput(id);
          if (value && field && !field.value) field.value = value;
        };
        fill("first-name", user.firstName);
        fill("last-name", user.lastName);
        fill("phone", user.phone);
        fill("email", user.email);
        fill("city", user.city);
        fill("district", user.district);
        fill("address-detail", user.addressDetail);
      });
    }

    ["first-name", "last-name", "phone", "email", "city", "district", "address-detail", "notes", "payment-method"].forEach((id) => {
      const field = getInput(id);
      if (field && !field.name) field.name = id.replace(/-/g, "_");
      field?.addEventListener("input", () => clearInvalid(field));
      field?.addEventListener("change", () => clearInvalid(field));
    });
    const placeOrder = document.querySelector(".btn-place-order");
    if (!placeOrder) return;
    placeOrder.setAttribute("data-order", "submit");
    placeOrder.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!validateCheckout()) {
        document.querySelector("[aria-invalid='true']")?.focus();
        return;
      }
      const order = buildOrderObject();
      const original = placeOrder.innerHTML;
      placeOrder.disabled = true;
      placeOrder.setAttribute("aria-busy", "true");
      placeOrder.innerHTML = "جارٍ إنشاء الطلب...";
      try {
        const currentCurrency = window.ZFB_CURRENCY ? window.ZFB_CURRENCY.getCurrency() : (localStorage.getItem('zfb_currency') || 'SAR');
        const currentGuestId = localStorage.getItem('zfb.guest_id') || localStorage.getItem('zfb_guest_id') || '';
        
        const loc = window.ZFB_CHECKOUT_LOCATION || {};
        const lat = (loc.latitude !== undefined && loc.latitude !== null && !isNaN(loc.latitude))
          ? Number(loc.latitude)
          : (getInput("address-latitude")?.value ? parseFloat(getInput("address-latitude").value) : null);
        const lng = (loc.longitude !== undefined && loc.longitude !== null && !isNaN(loc.longitude))
          ? Number(loc.longitude)
          : (getInput("address-longitude")?.value ? parseFloat(getInput("address-longitude").value) : null);
        const city = getInput("city")?.value || loc.city || "صنعاء";
        const district = getInput("district")?.value.trim() || loc.district || "";
        const addressDetail = getInput("address-detail")?.value.trim() || loc.address_line || "";
        const formattedAddr = loc.formatted_address || getInput("formatted-address")?.value || [city, district, addressDetail].filter(Boolean).join(' - ');
        const prov = loc.province || getInput("province")?.value || city || "صنعاء";

        const payload = {
          currency: currentCurrency,
          guestId: currentGuestId,
          couponCode: order.couponCode || order.coupon?.code || "",
          addressId: order.address?.id || null,
          latitude: lat,
          longitude: lng,
          formatted_address: formattedAddr,
          province: prov,
          city: city,
          district: district,
          address_line: addressDetail,
          address: {
            id: order.address?.id || null,
            country: 'اليمن',
            province: prov,
            city: city,
            district: district,
            address_line: addressDetail,
            formatted_address: formattedAddr,
            latitude: lat,
            longitude: lng,
          },
          customer: {
            firstName: order.customer.firstName,
            lastName: order.customer.lastName,
            phone: order.customer.phone,
            email: order.customer.email,
            city: city,
            district: district,
            addressDetail: addressDetail,
          },
          items: order.products.map((item) => ({
            id: item.id || item.product_id || item.sku,
            quantity: item.quantity || 1,
            selected_color: item.selected_color || item.color || item.selectedColor || null,
            /* The chosen size travelled from the product page into the cart and
               then stopped here: the order was created from the product's base
               price and the admin never saw which size was bought. The server
               re-prices from product_sizes, so this only names the size. */
            selected_size: item.selected_size || item.selectedSize || item.size || null,
            image: item.image || item.image_url || item.main_image || null,
          })),
          paymentMethod: order.paymentMethod?.id || order.paymentMethod?.label || "cash-on-delivery",
          deliveryMethod: order.delivery?.method || "",
          notes: order.customerNotes || order.notes || "",
        };
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-currency": currentCurrency,
            "x-guest-id": currentGuestId
          },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(getApiError(data));
        order.orderId = data.orderId || data.data?.orderId || order.orderId;
        order.status = data.status || data.data?.status || order.status;
        order.backendSynced = true;
        write(ORDER_KEY, order);
        if (order.customer?.phone) {
          localStorage.setItem("zfb_customer_phone", order.customer.phone);
        }
        if (order.customer?.firstName) {
          localStorage.setItem("zfb_customer_name", (order.customer.firstName + " " + (order.customer.lastName || "")).trim());
        }
        localStorage.removeItem(CART_KEY);
        window.dispatchEvent(new CustomEvent("zfb-state-change", { detail: { key: CART_KEY, value: [] } }));
        window.location.href = `confirmation.html?order=${encodeURIComponent(order.orderId)}`;
      } catch (error) {
        setInvalid(getInput("phone") || placeOrder, error.message || "تعذر إنشاء الطلب في قاعدة البيانات");
      } finally {
        placeOrder.disabled = false;
        placeOrder.removeAttribute("aria-busy");
        placeOrder.innerHTML = original;
      }
    });
  }

  async function setupConfirmation() {
    if (!document.querySelector(".confirmation-page")) return;
    
    // 1. Get Order ID from URL query param or Storage
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get('order') || params.get('order_id') || params.get('id');
    const localOrder = read(ORDER_KEY, null);
    const orderId = orderIdParam || localOrder?.orderId || localOrder?.order_id;
    
    const orderRefEl = document.querySelector(".order-ref strong");
    const countEl = document.querySelector(".confirm-order-head span");
    const totalEl = document.querySelector(".confirm-order-total strong");
    const itemsContainer = document.querySelector(".confirm-order-items");
    
    if (orderId && orderRefEl) {
      orderRefEl.textContent = `#${orderId.replace(/^#/, '')}`;
    }

    let orderData = null;

    // 2. Fetch authoritative order details from backend
    if (orderId) {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        const json = await res.json();
        if (json.success && json.data) {
          orderData = json.data;
        }
      } catch (_) {}
    }

    // Fallback to local storage if API is offline
    if (!orderData && localOrder && (String(localOrder.orderId) === String(orderId) || String(localOrder.order_id) === String(orderId))) {
      orderData = {
        order_id: localOrder.orderId || localOrder.order_id,
        items: localOrder.products || localOrder.items || [],
        total: localOrder.total,
        currency: localOrder.currency || 'YER',
        status: localOrder.status || 'pending'
      };
    }

    // 3. Render actual ordered items
    if (orderData && Array.isArray(orderData.items) && orderData.items.length > 0) {
      const items = orderData.items;
      const currency = orderData.currency || 'YER';
      const formatCurrencyFn = (amount) => {
        if (window.ZFB_CURRENCY && typeof window.ZFB_CURRENCY.format === 'function') {
          return window.ZFB_CURRENCY.format(amount);
        }
        const num = Math.round(Number(amount) || 0).toLocaleString('ar-YE');
        return currency === 'SAR' ? `${num} ر.س` : `${num} ر.ي`;
      };

      if (itemsContainer) {
        itemsContainer.innerHTML = items.map(item => {
          const itemImg = item.image || (item.gallery && item.gallery[0]) || 'assets/images/categories/cat-majlis.webp';
          const itemTitle = item.title || item.product_title || item.name || 'منتج من زياد ستور';
          const itemQty = Number(item.quantity) || 1;
          const itemPrice = Number(item.unit_price || item.price || 0);
          const itemTotal = Number(item.total) || (itemPrice * itemQty);
          
          const itemColor = item.selected_color || item.color || item.selectedColor || '';
          return `
            <div class="confirm-item" style="display:flex; align-items:center; gap:14px; padding:12px 0; border-bottom:1px solid var(--line, rgba(214,168,79,0.15));">
              <div class="confirm-item-img" style="width:60px; height:60px; border-radius:10px; overflow:hidden; flex-shrink:0; background:var(--surface-alt, #f8f9fa); border:1px solid var(--line, #e2e8f0);">
                <img src="${itemImg}" alt="${itemTitle}" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.src='/assets/placeholder.svg'">
              </div>
              <div class="confirm-item-info" style="flex:1;">
                <h4 style="margin:0 0 4px; font-size:0.95rem; font-weight:700; color:var(--ink, #f8f2e8);">${itemTitle}</h4>
                ${itemColor ? `<span style="display:inline-block; font-size:0.75rem; color:var(--gold,#c79a52); background:rgba(199,154,82,0.12); padding:1px 6px; border-radius:4px; margin-bottom:2px; font-weight:600;">اللون: ${itemColor}</span>` : ''}
                <span style="font-size:0.8rem; color:var(--muted, #96a89c); display:block;">الكمية: ${itemQty} ${item.brand ? ' · ' + item.brand : ''} ${item.warranty ? ' · ضمان ' + item.warranty : ''}</span>
              </div>
              <div class="confirm-item-price" style="font-weight:800; font-size:0.95rem; color:var(--gold, #d6a84f);">${formatCurrencyFn(itemTotal > 0 ? itemTotal : itemPrice)}</div>
            </div>
          `;
        }).join('');
      }

      const totalItemsCount = items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
      if (countEl) {
        countEl.textContent = `${totalItemsCount} ${totalItemsCount === 1 ? 'منتج' : totalItemsCount === 2 ? 'منتجان' : 'منتجات'}`;
      }

      if (totalEl) {
        totalEl.textContent = formatCurrencyFn(orderData.total || orderData.total_amount || 0);
      }
    } else if (!orderId && itemsContainer) {
      itemsContainer.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted);">لا توجد تفاصيل طلب مسجلة حالياً. يمكنك متابعة طلبك عبر صفحة تتبع الطلبات.</div>';
      if (countEl) countEl.textContent = '0 منتجات';
      if (totalEl) totalEl.textContent = '0 ر.ي';
    }
  }

  function setupTrackOrder() {
    const form = document.getElementById("trackForm");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const phoneField = form.querySelector("input[type='tel'], input[name='phone'], #phone");
      const orderField = form.querySelector("input[name='orderNumber'], input[name='order'], #order-number, #orderNumber");
      const phone = normalizePhone(phoneField?.value || "");
      const orderNumber = String(orderField?.value || "").trim().replace(/^#/, "");

      form.querySelector(".form-success, .form-error, .track-result-card")?.remove();
      
      const submitBtn = form.querySelector("button[type='submit']");
      const origBtnHtml = submitBtn ? submitBtn.innerHTML : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = "<span>جاري البحث عن الطلب...</span>";
      }

      const result = document.createElement("div");
      result.className = "track-result-card";
      result.setAttribute("role", "status");

      try {
        if (!phone && !orderNumber) throw new Error("أدخل رقم الطلب أو رقم الهاتف المستخدم.");
        
        const url = `/api/orders/track?phone=${encodeURIComponent(phone)}&orderNumber=${encodeURIComponent(orderNumber)}`;
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        const data = await response.json().catch(() => ({}));
        
        if (!response.ok || data.success === false) {
          throw new Error(data.error || "لم نجد طلباً مطابقاً لهذا الرقم. تأكد من صحة رقم الطلب ورقم الهاتف.");
        }

        const orders = Array.isArray(data.orders) ? data.orders : (Array.isArray(data.data) ? data.data : []);
        if (orders.length === 0) {
          throw new Error("لم نجد طلباً مطابقاً لهذا الرقم. تأكد من البيانات أو تواصل معنا.");
        }

        const ord = orders[0];
        const statusMap = {
          'pending': { label: 'قيد المراجعة والتحقق', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },
          'confirmed': { label: 'تم تأكيد الطلب', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
          'processing': { label: 'قيد التجهيز في المستودع', color: '#c79a52', bg: 'rgba(199, 154, 82, 0.15)' },
          'shipped': { label: 'جاري التوصيل مع المندوب', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
          'delivered': { label: 'تم التوصيل والتركيب بنجاح', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.15)' },
          'cancelled': { label: 'تم إلغاء الطلب', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' }
        };

        const currentStatus = statusMap[ord.status] || { label: ord.status, color: '#c79a52', bg: 'rgba(199, 154, 82, 0.15)' };

        result.innerHTML = `
          <div style="padding: 20px; border-radius: 12px; background: var(--surface-alt, rgba(255,255,255,0.03)); border: 1px solid var(--border-color, rgba(255,255,255,0.12)); margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08)); padding-bottom: 14px; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
              <div>
                <span style="font-size: 0.85rem; color: var(--muted, #9ca3af); display: block;">رقم الطلب</span>
                <strong style="font-size: 1.15rem; color: var(--primary-gold, #c79a52); font-family: monospace;">#${ord.order_id}</strong>
              </div>
              <span style="padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 0.88rem; background: ${currentStatus.bg}; color: ${currentStatus.color}; border: 1px solid ${currentStatus.color};">
                ${currentStatus.label}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.92rem;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted, #9ca3af);">الاسم:</span>
                <strong>${ord.first_name || ''} ${ord.last_name || ''}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted, #9ca3af);">المدينة والعنوان:</span>
                <span>${ord.city || 'صنعاء'} - ${ord.formatted_address || ord.district || ord.address_detail || ''}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--muted, #9ca3af);">طريقة التوصيل:</span>
                <span>${ord.delivery_method || 'توصيل منزلي'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color, rgba(255,255,255,0.08)); padding-top: 10px;">
                <span style="color: var(--muted, #9ca3af);">إجمالي الطلب:</span>
                <strong style="color: var(--primary-gold, #c79a52); font-size: 1.05rem;">${ord.total || ord.total_sar} ${ord.currency || 'SAR'}</strong>
              </div>
            </div>

            ${Array.isArray(ord.items) && ord.items.length > 0 ? `
              <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border-color, rgba(255,255,255,0.1));">
                <span style="font-size: 0.82rem; color: var(--muted, #9ca3af); display: block; margin-bottom: 8px;">المنتجات المطلوبة:</span>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${ord.items.map(it => `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.88rem; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);">
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${it.image_url || '/assets/placeholder.svg'}" alt="${it.product_title || ''}" style="width: 38px; height: 38px; border-radius: 6px; object-fit: cover;" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
                        <div>
                          <strong style="display: block; font-size: 0.85rem;">${it.product_title || 'منتج'}</strong>
                          ${it.selected_color ? `<span style="display: inline-block; font-size: 0.75rem; color: var(--primary-gold, #c79a52); background: rgba(199,154,82,0.15); padding: 1px 6px; border-radius: 4px; margin-top: 2px;">اللون: ${it.selected_color}</span>` : ''}
                        </div>
                      </div>
                      <span style="font-size: 0.85rem; font-weight: 600;">${it.quantity} × ${it.price || it.unit_price || ''}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <div style="margin-top: 16px;">
              <a href="https://wa.me/967775010726?text=${encodeURIComponent('مرحباً، أود الاستفسار عن حالة طلبي رقم #' + ord.order_id)}" target="_blank" rel="noopener noreferrer" 
                 style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; border-radius: 8px; background: #25D366; color: white; text-decoration: none; font-weight: 700; font-size: 0.92rem; box-sizing: border-box;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                <span>متابعة مع خدمة العملاء عبر واتساب</span>
              </a>
            </div>
          </div>
        `;
      } catch (error) {
        result.innerHTML = `
          <div style="padding: 14px 18px; border-radius: 10px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-weight: 600; font-size: 0.92rem; margin-top: 16px; text-align: center;">
            ${error.message || "تعذر التحقق من حالة الطلب الآن."}
          </div>
        `;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
      form.appendChild(result);
    });
  }

  function validateField(field) {
    clearInvalid(field);
    if (field.required && !String(field.value || "").trim()) {
      setInvalid(field, "هذا الحقل مطلوب");
      return false;
    }
    if (field.type === "email" && field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) {
      setInvalid(field, "أدخل بريد إلكتروني صحيح");
      return false;
    }
    if (field.type === "tel" && field.value && !isYemeniPhone(field.value)) {
      setInvalid(field, "أدخل رقم هاتف يمني صحيح");
      return false;
    }
    if (field.type === "number" && Number(field.value) < Number(field.min || 1)) {
      setInvalid(field, "أدخل كمية صحيحة");
      return false;
    }
    return true;
  }

  function validateForm(form) {
    const fields = Array.from(form.querySelectorAll("input, select, textarea"));
    const valid = fields.map((field) => validateField(field)).every(Boolean);
    if (!valid) fields.find((field) => field.getAttribute("aria-invalid") === "true")?.focus();
    return valid;
  }

  function setupForms() {
    document.querySelectorAll("form.subscribe-row").forEach((form) => {
      form.removeAttribute("onsubmit");
      form.action = "/api/newsletter";
      form.method = "POST";
      form.name = form.name || "newsletter-form";
      const email = form.querySelector("input[type='email']");
      if (email) {
        email.name = "email";
        email.required = true;
      }
    });

    document.querySelectorAll("form").forEach((form) => {
      form.querySelectorAll("input, select, textarea").forEach((field) => {
        field.addEventListener("input", () => clearInvalid(field));
        field.addEventListener("change", () => clearInvalid(field));
      });
    });

    document.querySelectorAll("form[action^='/api/']").forEach((form) => {
      if (form.id === "trackForm") return;
      if ((form.getAttribute("action") || "").includes("/api/calculate-")) return;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!validateForm(form) || !form.checkValidity()) {
          form.reportValidity();
          return;
        }
        const submitter = form.querySelector("button[type='submit'], input[type='submit']");
        const original = submitter?.tagName === "BUTTON" ? submitter.innerHTML : submitter?.value;
        let message = form.querySelector(".form-success");
        if (!message) {
          message = document.createElement("p");
          message.className = "form-success";
          message.setAttribute("role", "status");
          form.appendChild(message);
        }
        try {
          if (submitter) {
            submitter.disabled = true;
            submitter.setAttribute("aria-busy", "true");
            if (submitter.tagName === "BUTTON") submitter.innerHTML = "جارٍ الإرسال...";
            else submitter.value = "جارٍ الإرسال...";
          }
          const data = await submitApiForm(form);
          message.className = "form-success";
          message.textContent = data.message || "تم إرسال الطلب بنجاح.";
          form.reset();
        } catch (error) {
          message.className = "form-error";
          message.textContent = error.message || "تعذر إرسال الطلب. حاول مرة أخرى.";
        } finally {
          if (submitter) {
            submitter.disabled = false;
            submitter.removeAttribute("aria-busy");
            if (submitter.tagName === "BUTTON") submitter.innerHTML = original;
            else submitter.value = original;
          }
        }
      });
    });
  }

  function showToast(message) {
    let toast = document.querySelector(".zfb-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "zfb-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function setupUtilityActions() {
    document.querySelectorAll("[data-action='share-product']").forEach((button) => {
      button.addEventListener("click", async () => {
        const title = document.querySelector("h1")?.textContent.trim() || document.title;
        const url = window.location.href;
        if (navigator.share) {
          await navigator.share({ title, url }).catch(() => {});
        } else {
          await navigator.clipboard?.writeText(url).catch(() => {});
          showToast("تم نسخ رابط المنتج");
        }
      });
    });

    document.querySelectorAll("[data-action='zoom-product']").forEach((button) => {
      button.addEventListener("click", () => {
        const source = document.querySelector(".gallery-main .photo, .gallery-main img");
        if (!source) return;
        const overlay = document.createElement("div");
        overlay.className = "zfb-lightbox";
        overlay.tabIndex = -1;
        overlay.innerHTML = `<button type="button" aria-label="إغلاق">×</button><div class="zfb-lightbox-media">${source.outerHTML}</div>`;
        overlay.querySelector("button").addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (event) => {
          if (event.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
        overlay.focus();
      });
    });

    document.querySelectorAll("[data-action='product-360']").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelector(".gallery-thumbnails")?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.querySelectorAll(".thumb").forEach((thumb, index) => {
          setTimeout(() => thumb.classList.toggle("active", index === 0), index * 60);
        });
        showToast("يمكنك استعراض زوايا المنتج من الصور المصغرة");
      });
    });

    document.querySelectorAll("[data-action='product-video']").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelector(".premium-details-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
        showToast("تفاصيل المنتج تعرض الحجم والخامة والاستخدام بوضوح");
      });
    });

    document.querySelectorAll("[data-action='voice-search'], [data-action='image-search']").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.querySelector(".large-search-input, form.search input[type='search']");
        input?.focus();
        showToast(button.dataset.action === "voice-search" ? "اكتب ما تبحث عنه وسنقترح النتائج فوراً" : "صف المنتج أو اكتب اسمه للبحث عنه");
      });
    });

    document.querySelectorAll(".thumb:not([data-action])").forEach((button) => {
      button.addEventListener("click", () => {
        const main = document.querySelector(".gallery-main .photo");
        const thumbPhoto = button.querySelector(".photo");
        if (main && thumbPhoto) main.setAttribute("style", thumbPhoto.getAttribute("style") || "");
        button.parentElement.querySelectorAll(".thumb").forEach((thumb) => thumb.classList.remove("active"));
        button.classList.add("active");
      });
    });

    document.querySelectorAll(".thumb-nav").forEach((button) => {
      button.addEventListener("click", () => {
        const thumbs = button.closest(".gallery-thumbnails");
        thumbs?.scrollBy({ top: button.classList.contains("up") ? -80 : 80, behavior: "smooth" });
      });
    });

    document.querySelectorAll(".tabs button, .chip-row button, .filter-chip, .filter-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const group = button.parentElement;
        group?.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");
      });
    });

    document.querySelectorAll("button").forEach((button) => {
      const hasInlineAction = button.getAttribute("onclick") || button.type === "submit" || button.type === "reset";
      const hasKnownAction =
        hasInlineAction ||
        button.dataset.action ||
        button.matches(".wish, .btn-wishlist, .btn-add-cart, .btn-add-cart-mini, .btn-remove-item, .btn-save-later, .delivery-card, .payment-card, .thumb, .thumb-nav, .tabs button, .chip-row button, .filter-chip, .filter-btn");
      if (hasKnownAction || button.dataset.boundFallback) return;
      button.dataset.boundFallback = "true";
      button.addEventListener("click", () => {
        button.setAttribute("aria-pressed", button.getAttribute("aria-pressed") === "true" ? "false" : "true");
        showToast("تم تحديث الاختيار");
      });
    });
  }

  function setupProductActions() {
    document.querySelectorAll(".product-card").forEach((card, index) => {
      if (!card.dataset.productId) card.dataset.productId = `zfb-product-${index + 1}`;
      if (!card.dataset.price) card.dataset.price = String(numberFromText(card.querySelector(".price strong")?.textContent));
      if (!card.dataset.stock) card.dataset.stock = card.querySelector(".stock span")?.textContent.trim() || "available";
      if (!card.dataset.category) card.dataset.category = document.body.dataset.category || "store";
    });
    document.querySelectorAll(".wish, .btn-wishlist").forEach((button) => {
      button.setAttribute("aria-pressed", "false");
    });
    document.querySelectorAll(".btn-add-cart").forEach((button) => {
      if (button.dataset.boundAdd) return;
      button.dataset.boundAdd = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        addItem(button);
        window.location.href = button.classList.contains("btn-buy-now") ? "checkout.html" : "cart.html";
      });
    });
  }

  function setupQuantityButtons() {
    document.querySelectorAll(".qty-controls, .cart-qty").forEach((box) => {
      const input = box.querySelector("input");
      const valueNode = box.querySelector("span");
      box.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          const current = parseInt(input?.value || valueNode?.textContent || "1", 10) || 1;
          const next = button.textContent.trim() === "+" ? current + 1 : Math.max(1, current - 1);
          if (input) input.value = next;
          if (valueNode) valueNode.textContent = next;
        });
      });
    });
    document.querySelectorAll(".btn-remove-item").forEach((button) => {
      button.addEventListener("click", () => {
        button.closest(".cart-item")?.remove();
        if (!document.querySelector(".cart-item")) {
          document.querySelector(".cart-empty").style.display = "";
          document.querySelector(".cart-layout").style.display = "none";
        }
      });
    });
  }

  async function initSuperDealsMarquee() {
    const track = document.getElementById('superdealsMarqueeTrack');
    if (!track) return;
    const container = track.closest('.superdeals-marquee-container') || track.parentElement;
    if (!container) return;

    let products = [];
    try {
      const res = await fetch(`/api/products/frame-deals?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        products = data.data;
      }
    } catch (e) {}

    // Fallback if local/offline
    if (!products || products.length === 0) {
      if (window.PRODUCTS_DB && Array.isArray(window.PRODUCTS_DB)) {
        products = window.PRODUCTS_DB.slice(0, 20);
      }
    }

    if (!products || products.length === 0) return;

    const renderItems = (list) => {
      return list.map(p => {
        const title = p.title || p.name || 'منتج مميز';
        const price = p.price ? (typeof p.price === 'number' ? p.price.toLocaleString('ar-YE') : p.price) : '0';
        const img = window.ZFB && window.ZFB.normalizeImagePath 
          ? window.ZFB.normalizeImagePath(p.main_image || p.image || (p.images && p.images[0]))
          : (p.main_image || p.image || (p.images && p.images[0]) || '/assets/placeholder.svg');
        const link = `product.html?id=${p.product_id || p.id}`;
        const discount = p.discount_percentage ? `خصم ${p.discount_percentage}%` : 'خصم 50%';

        return `
          <a href="${link}" class="superdeals-item" draggable="false">
            <img src="${img}" alt="${title}" class="superdeals-item-img" loading="lazy" draggable="false" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
            <h4 class="superdeals-item-title">${title}</h4>
            <div class="superdeals-item-price">${price} ر.ي</div>
            <span class="superdeals-item-badge">${discount}</span>
          </a>
        `;
      }).join('');
    };

    const baseHtml = renderItems(products);
    // Render 4 identical copies for infinite continuous canvas
    track.innerHTML = baseHtml + baseHtml + baseHtml + baseHtml;

    track.style.display = 'flex';
    track.style.width = 'max-content';
    track.style.willChange = 'transform';
    container.style.overflow = 'hidden';
    container.style.cursor = 'grab';

    const count = products.length;
    let loopWidth = count * 142; // Fallback: 130px card + 12px gap
    let currentX = -loopWidth;
    let isInteracting = false;
    let isDragging = false;
    let lastPointerX = 0;
    let dragDistance = 0;
    let animationFrameId = null;
    let resumeTimer = null;
    const autoSpeed = 0.55; // Silky steady drift speed

    function updateLoopWidth() {
      const items = track.querySelectorAll('.superdeals-item');
      if (items && items.length >= count * 2) {
        const item0 = items[0].getBoundingClientRect();
        const itemN = items[count].getBoundingClientRect();
        const dist = Math.abs(itemN.left - item0.left);
        if (dist > 50) {
          loopWidth = dist;
        }
      }
    }

    function applyWrap(delta) {
      currentX += delta;
      if (loopWidth > 0) {
        while (currentX <= -loopWidth * 2) {
          currentX += loopWidth;
        }
        while (currentX >= -loopWidth) {
          currentX -= loopWidth;
        }
      }
      track.style.transform = `translate3d(${currentX}px, 0, 0)`;
    }

    function step() {
      if (!isInteracting && !isDragging) {
        applyWrap(-autoSpeed);
      }
      animationFrameId = requestAnimationFrame(step);
    }

    // Pointer Drag Events for Mobile Touch & Desktop Mouse
    container.addEventListener('pointerdown', (e) => {
      isInteracting = true;
      isDragging = true;
      lastPointerX = e.clientX;
      dragDistance = 0;
      container.style.cursor = 'grabbing';
      if (resumeTimer) clearTimeout(resumeTimer);
      updateLoopWidth();
    }, { passive: true });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      dragDistance += Math.abs(deltaX);
      applyWrap(deltaX);
    }, { passive: true });

    const handlePointerEnd = () => {
      isDragging = false;
      container.style.cursor = 'grab';
      if (resumeTimer) clearTimeout(resumeTimer);
      // Immediately resume auto-drift after a calm 800ms moment
      resumeTimer = setTimeout(() => {
        isInteracting = false;
      }, 800);
    };

    window.addEventListener('pointerup', handlePointerEnd, { passive: true });
    window.addEventListener('pointercancel', handlePointerEnd, { passive: true });

    // Desktop hover only (never locks mobile touch)
    container.addEventListener('mouseenter', (e) => {
      if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        isInteracting = true;
      }
    }, { passive: true });

    container.addEventListener('mouseleave', () => {
      if (resumeTimer) clearTimeout(resumeTimer);
      isInteracting = false;
    }, { passive: true });

    // Prevent accidental link clicking only when the user intentionally dragged/swiped
    track.addEventListener('click', (e) => {
      if (dragDistance > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Initial positioning in middle copy and start animation
    setTimeout(() => {
      updateLoopWidth();
      currentX = -loopWidth;
      applyWrap(0);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(step);
    }, 100);
  }

  function setupCouponEngine() {
    function getGuestId() {
      let gid = localStorage.getItem("zfb.guest_id") || localStorage.getItem("zfb_guest_id");
      if (!gid) {
        gid = "guest_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
        localStorage.setItem("zfb.guest_id", gid);
        localStorage.setItem("zfb_guest_id", gid);
      }
      return gid;
    }

    function formatNative(amount, cur = 'SAR') {
      const num = Math.round(Number(amount) || 0);
      const formatted = num.toLocaleString('ar-YE');
      return cur === 'SAR' ? `${formatted} ر.س` : `${formatted} ر.ي`;
    }

    async function syncCouponUI() {
      const guestId = getGuestId();
      const currentCurrency = window.ZFB_CURRENCY ? window.ZFB_CURRENCY.getCurrency() : (localStorage.getItem('zfb_currency') || 'SAR');

      // Cart elements
      const cartInputGroup = document.getElementById("coupon-input-group");
      const cartBadge = document.getElementById("applied-coupon-badge");
      const cartBadgeLabel = document.getElementById("applied-coupon-label");
      const cartSubtotal = document.querySelector(".cart-items ~ aside .subtotal-amount, .order-summary .subtotal-amount");
      const cartDiscountLine = document.querySelector(".cart-items ~ aside .discount-line, .order-summary .discount-line");
      const cartDiscountAmount = document.querySelector(".cart-items ~ aside .discount-amount, .order-summary .discount-amount");
      const cartShippingAmount = document.querySelector(".cart-items ~ aside .shipping-amount, .order-summary .shipping-amount");
      const cartTotalAmount = document.querySelector(".cart-items ~ aside .total-amount, .order-summary .total-amount");

      // Checkout elements
      const checkoutInputGroup = document.getElementById("checkout-coupon-input-group");
      const checkoutBadge = document.getElementById("checkout-applied-coupon-badge");
      const checkoutBadgeLabel = document.getElementById("checkout-applied-coupon-label");

      try {
        const res = await fetch(`/api/cart?currency=${currentCurrency}&guestId=${guestId}&_t=${Date.now()}`, {
          headers: { "x-guest-id": guestId, "x-currency": currentCurrency }
        });
        const data = await res.json();
        if (data && data.success) {
          const cur = data.currency || currentCurrency;

          if (cartSubtotal) cartSubtotal.textContent = formatNative(data.subtotal, cur);
          if (cartTotalAmount) cartTotalAmount.textContent = formatNative(data.total, cur);

          if (data.coupon) {
            const labelText = `${data.coupon.code} (${data.coupon.discount_label})`;
            if (cartInputGroup) cartInputGroup.style.display = "none";
            if (cartBadge) cartBadge.style.display = "flex";
            if (cartBadgeLabel) cartBadgeLabel.textContent = labelText;

            if (checkoutInputGroup) checkoutInputGroup.style.display = "none";
            if (checkoutBadge) checkoutBadge.style.display = "flex";
            if (checkoutBadgeLabel) checkoutBadgeLabel.textContent = labelText;

            if (cartDiscountLine && data.discount > 0) {
              cartDiscountLine.style.display = "flex";
              if (cartDiscountAmount) cartDiscountAmount.textContent = `- ${formatNative(data.discount, cur)}`;
            } else if (cartDiscountLine) {
              cartDiscountLine.style.display = "none";
            }

            localStorage.setItem("zfb_applied_coupon", data.coupon.code);
          } else {
            if (cartInputGroup) cartInputGroup.style.display = "flex";
            if (cartBadge) cartBadge.style.display = "none";
            if (cartDiscountLine) cartDiscountLine.style.display = "none";

            if (checkoutInputGroup) checkoutInputGroup.style.display = "flex";
            if (checkoutBadge) checkoutBadge.style.display = "none";

            localStorage.removeItem("zfb_applied_coupon");
          }

          if (cartShippingAmount) {
            if (data.free_shipping || data.delivery?.free_shipping) {
              cartShippingAmount.textContent = data.coupon?.discount_type === 'free_shipping' ? "مجاناً (عرض كوبون)" : "مجاناً";
              cartShippingAmount.style.color = "#16a34a";
            } else {
              cartShippingAmount.textContent = "يحدد من قبل الإدارة بعد تأكيد الطلب";
              cartShippingAmount.style.color = "inherit";
            }
          }
        }
      } catch (_) {}
    }

    async function handleApply(code, feedbackEl, btnEl) {
      if (!code) {
        if (feedbackEl) {
          feedbackEl.style.display = "block";
          feedbackEl.style.color = "#ef4444";
          feedbackEl.textContent = "يرجى إدخال كود الكوبون";
        }
        return;
      }
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = "جارٍ التحقق...";
      }
      if (feedbackEl) {
        feedbackEl.style.display = "none";
        feedbackEl.textContent = "";
      }
      try {
        const guestId = getGuestId();
        const currentCurrency = window.ZFB_CURRENCY ? window.ZFB_CURRENCY.getCurrency() : (localStorage.getItem('zfb_currency') || 'SAR');
        const res = await fetch("/api/cart/coupon", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-currency": currentCurrency, "x-guest-id": guestId },
          body: JSON.stringify({ code, guestId })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (feedbackEl) {
            feedbackEl.style.display = "block";
            feedbackEl.style.color = "#ef4444";
            feedbackEl.textContent = data.error || "كود الكوبون غير صالح";
          }
        } else {
          if (feedbackEl) {
            feedbackEl.style.display = "block";
            feedbackEl.style.color = "#16a34a";
            feedbackEl.textContent = data.message || "تم تطبيق الكوبون بنجاح!";
          }
          localStorage.setItem("zfb_applied_coupon", code);
          await syncCouponUI();
          if (typeof window.renderCheckoutSummary === 'function') window.renderCheckoutSummary();
          window.dispatchEvent(new CustomEvent("zfb-cart-updated"));
          window.dispatchEvent(new CustomEvent("cartUpdated"));
        }
      } catch (err) {
        if (feedbackEl) {
          feedbackEl.style.display = "block";
          feedbackEl.style.color = "#ef4444";
          feedbackEl.textContent = err.message || "تعذر الاتصال بالخادم";
        }
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = "تطبيق";
        }
      }
    }

    async function handleRemove(feedbackEl, btnEl) {
      if (btnEl) btnEl.disabled = true;
      try {
        const guestId = getGuestId();
        const res = await fetch("/api/cart/coupon", {
          method: "DELETE",
          headers: { "x-guest-id": guestId }
        });
        const data = await res.json();
        if (data.success) {
          localStorage.removeItem("zfb_applied_coupon");
          const cartInput = document.getElementById("cart-coupon-code");
          if (cartInput) cartInput.value = "";
          const checkoutInput = document.getElementById("checkout-coupon-code");
          if (checkoutInput) checkoutInput.value = "";
          if (feedbackEl) {
            feedbackEl.style.display = "block";
            feedbackEl.style.color = "#16a34a";
            feedbackEl.textContent = "تمت إزالة الكوبون بنجاح";
          }
          await syncCouponUI();
          if (typeof window.renderCheckoutSummary === 'function') window.renderCheckoutSummary();
          window.dispatchEvent(new CustomEvent("zfb-cart-updated"));
          window.dispatchEvent(new CustomEvent("cartUpdated"));
        }
      } catch (err) {
        if (feedbackEl) {
          feedbackEl.style.display = "block";
          feedbackEl.style.color = "#ef4444";
          feedbackEl.textContent = err.message || "تعذر إزالة الكوبون";
        }
      } finally {
        if (btnEl) btnEl.disabled = false;
      }
    }

    // Attach Cart Coupon Listeners
    const cartApplyBtn = document.getElementById("btn-apply-cart-coupon");
    const cartRemoveBtn = document.getElementById("btn-remove-cart-coupon");
    const cartInput = document.getElementById("cart-coupon-code");
    const cartFeedback = document.getElementById("cart-coupon-feedback");

    cartApplyBtn?.addEventListener("click", () => handleApply((cartInput?.value || "").trim(), cartFeedback, cartApplyBtn));
    cartRemoveBtn?.addEventListener("click", () => handleRemove(cartFeedback, cartRemoveBtn));
    cartInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); cartApplyBtn?.click(); } });

    // Attach Checkout Coupon Listeners
    const checkoutApplyBtn = document.getElementById("btn-apply-checkout-coupon");
    const checkoutRemoveBtn = document.getElementById("btn-remove-checkout-coupon");
    const checkoutInput = document.getElementById("checkout-coupon-code");
    const checkoutFeedback = document.getElementById("checkout-coupon-feedback");

    checkoutApplyBtn?.addEventListener("click", () => handleApply((checkoutInput?.value || "").trim(), checkoutFeedback, checkoutApplyBtn));
    checkoutRemoveBtn?.addEventListener("click", () => handleRemove(checkoutFeedback, checkoutRemoveBtn));
    checkoutInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); checkoutApplyBtn?.click(); } });

    // Initial sync
    syncCouponUI();
    window.addEventListener("zfb-cart-updated", syncCouponUI);
    window.addEventListener("zfb-currency-change", syncCouponUI);
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupSearch();
    setupProductActions();
    setupQuantityButtons();
    setupCouponEngine();
    setupCheckout();
    setupConfirmation();
    setupTrackOrder();
    setupForms();
    setupUtilityActions();
    updateCartBadges();
    initSuperDealsMarquee();
  });
})();
