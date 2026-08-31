
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


// ZFB Unified Central Engine
(function() {
  const CART_KEY = "zfb.cart";
  const WISHLIST_KEY = "zfb.wishlist";
  const COMPARE_KEY = "zfb.compare";
  const ORDER_KEY = "zfb.lastOrder";

  // Guest Session Management
  function getGuestId() {
    let gid = localStorage.getItem('zfb.guest_id');
    if (!gid) {
      gid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'guest_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('zfb.guest_id', gid);
    }
    return gid;
  }
  const GUEST_ID = getGuestId();

  // Unified API Fetcher
  async function apiFetch(url, options = {}) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-guest-id': GUEST_ID,
        ...(options.headers || {})
      };
      const res = await fetch(url, { ...options, headers });
      return await res.json();
    } catch (e) {
      console.error('API Error:', e);
      return { success: false, error: e.message };
    }
  }

  // Local State Store (For Optimistic UI & Synchronous Getters)
  const Store = {
    cart: { items: getStore(CART_KEY, []), total: 0, totalOld: 0, count: 0 },
    wishlist: { items: getStore(WISHLIST_KEY, []), count: 0 },
    compare: getStore(COMPARE_KEY, [])
  };

  function getStore(key, def) {
    try {
      let val = localStorage.getItem(key);
      if (!val) return def;
      let parsed = JSON.parse(val);
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      return Array.isArray(parsed) ? parsed : def;
    } catch(e) {
      return def;
    }
  }
  
  function setStore(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      window.dispatchEvent(new CustomEvent('zfb-state-change', { detail: { key, value: val } }));
    } catch(e) {}
  }

  function triggerStateChange(key, val) {
    window.dispatchEvent(new CustomEvent('zfb-state-change', { detail: { key, value: val } }));
  }

  function read(key) {
    if (key === CART_KEY) return Store.cart.items;
    if (key === WISHLIST_KEY) return Store.wishlist.items;
    if (key === COMPARE_KEY) return Store.compare;
    return getStore(key, null);
  }

  function write(key, val) {
    if (key === COMPARE_KEY) {
      Store.compare = val;
      setStore(key, val);
    }
  }

  function numberFromText(text) {
    const western = String(text || '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
    const value = parseFloat((western.match(/[\d,.]+/) || ['0'])[0].replace(/,/g, ''));
    return Number.isFinite(value) ? value : 0;
  }

  function productFromElement(source) {
    const node = source && source.closest ? source : document.body;
    const card = node.closest('[data-product-id], .product-card, .premium-product-page, .cart-item, .summary-product') || document.body;
    const id = card.dataset.productId || new URLSearchParams(window.location.search).get('id') || card.dataset.sku || 'zfb-product';
    const title = card.querySelector('h1, h2, h3, h4, [data-field="title"]')?.textContent.trim() || 'منتج من زياد ستور';
    const priceText = card.dataset.price || card.querySelector('[data-field="price"], .price strong, .current, .cart-item-price strong, .summary-product-price')?.textContent || '0';
    const image = card.querySelector('img')?.getAttribute('src') || card.querySelector('.photo')?.style.backgroundImage?.replace(/^url\(["']?/, '').replace(/["']?\)$/, '') || '';
    return {
      id,
      sku: card.dataset.sku || id,
      title,
      name: title,
      price: numberFromText(priceText),
      oldPrice: numberFromText(card.dataset.oldPrice || card.querySelector('.old, del')?.textContent || priceText),
      image,
      gallery: image ? [image] : [],
      quantity: Math.max(1, parseInt(card.querySelector('input[type="number"]')?.value || '1', 10) || 1),
      category: card.dataset.category || document.body.dataset.category || '',
      brand: card.dataset.brand || card.querySelector('[data-field="brand"]')?.textContent.trim() || '',
      warranty: card.dataset.warranty || card.querySelector('[data-field="warranty"]')?.textContent.trim() || '',
      rating: numberFromText(card.dataset.rating || card.querySelector('.rating, .stars')?.textContent || '0')
    };
  }

  const IMAGE_FALLBACK = "/assets/placeholder.svg";
  window.ZFB_IMAGE_FALLBACK = IMAGE_FALLBACK;

  window.ZFB = window.ZFB || {};
  window.ZFB.normalizeImagePath = function(src) {
    if (!src || typeof src !== 'string') return IMAGE_FALLBACK;
    src = src.trim().replace(/\\/g, '/');
    if (!src) return IMAGE_FALLBACK;
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:')) {
      return src;
    }
    if (!src.startsWith('/')) {
      src = '/' + src;
    }
    return src;
  };

  document.addEventListener("error", function(event) {
    const img = event.target;
    if (!img || img.tagName !== "IMG") return;
    
    // ARCHITECTURAL GUARD: Leaflet map tiles & controls must NEVER be modified by site image fallbacks
    if (img.classList && (img.classList.contains('leaflet-tile') || img.classList.contains('leaflet-marker-icon') || img.classList.contains('leaflet-image-layer'))) return;
    if (img.closest && (img.closest('.leaflet-container') || img.closest('.zfb-map-wrapper') || img.closest('.leaflet-pane') || img.closest('#zfb-checkout-map-container') || img.closest('.admin-order-map-container'))) return;
    
    const src = (img.currentSrc || img.src || '').toLowerCase();
    if (src.includes('tile.openstreetmap.org') || src.includes('cartocdn.com') || src.includes('google.com/vt') || src.includes('leaflet')) return;

    if (img.dataset.fallbackApplied === "true") return;
    img.dataset.fallbackApplied = "true";
    img.src = window.ZFB_IMAGE_FALLBACK || "/assets/placeholder.svg";
  }, true);

  window.productFromElement = window.productFromElement || productFromElement;

  function getCartItemId(item) {
    return String(item?.id || item?.product_id || item?.productId || item?.sku || '');
  }

  function numericPrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price > 0 ? price : 0;
  }

  function findProductForCartItem(item) {
    const itemId = getCartItemId(item);
    if (!itemId || !Array.isArray(window.PRODUCTS_DB)) return null;
    return window.PRODUCTS_DB.find((product) => (
      String(product.id) === itemId ||
      String(product.product_id || '') === itemId ||
      String(product.sku || '') === itemId
    )) || null;
  }

  function enrichCartItem(item, localItems = []) {
    const itemId = getCartItemId(item);
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    const product = findProductForCartItem(item);
    const local = localItems.find((entry) => getCartItemId(entry) === itemId);
    const source = product || local || item || {};

    /* A size carries its own full price. Without this the catalogue's base
       price -- read from PRODUCTS_DB, which knows nothing about the size the
       customer picked -- overwrote it, and the cart showed the wrong money. */
    const selectedSize = item?.selected_size || item?.selectedSize || local?.selected_size || null;
    const selectedSizePrice = numericPrice(
      item?.selected_size_price || item?.selectedSizePrice || local?.selected_size_price
    );

    const price = selectedSize && selectedSizePrice
      ? selectedSizePrice
      : numericPrice(source.price || source.currentPrice || source.unitPrice || item?.price || item?.currentPrice || item?.unitPrice);
    const oldPrice = numericPrice(source.oldPrice || source.old_price || source.previousPrice || item?.oldPrice || item?.old_price) || price;
    let defaultColor = null;
    if (source.colors) {
      if (Array.isArray(source.colors) && source.colors.length > 0) {
        const first = source.colors[0];
        defaultColor = (typeof first === 'object' && first !== null) ? (first.name || first.title) : String(first);
      } else if (typeof source.colors === 'string') {
        try {
          const parsed = JSON.parse(source.colors);
          if (Array.isArray(parsed) && parsed.length > 0) {
            defaultColor = (typeof parsed[0] === 'object' && parsed[0] !== null) ? (parsed[0].name || parsed[0].title) : String(parsed[0]);
          }
        } catch (_) {
          defaultColor = source.colors.split(/[,،]+/)[0]?.trim() || null;
        }
      }
    }

    const selectedColor = item.selected_color || item.selectedColor || item.color || local?.selected_color || local?.selectedColor || local?.color || defaultColor || null;
    const imageUrl = item.image || item.image_url || item.main_image || local?.image || local?.image_url || source.image || source.image_url || source.main_image || null;

    return {
      ...source,
      id: itemId || source.id,
      product_id: source.product_id || item?.product_id || itemId,
      selected_color: selectedColor,
      selectedColor: selectedColor,
      color: selectedColor,
      selected_size: selectedSize,
      selectedSize: selectedSize,
      selected_size_price: selectedSize ? price : null,
      image: imageUrl,
      image_url: imageUrl,
      price,
      oldPrice,
      quantity
    };
  }

  function recalcCartTotals() {
    Store.cart.count = Store.cart.items.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0);
    Store.cart.total = Store.cart.items.reduce((sum, p) => sum + (numericPrice(p.price) * (Number(p.quantity) || 1)), 0);
    Store.cart.totalOld = Store.cart.items.reduce((sum, p) => sum + ((numericPrice(p.oldPrice) || numericPrice(p.price)) * (Number(p.quantity) || 1)), 0);
  }

  window.ZFB.Cart = {
    init: async () => {
      try {
        const res = await apiFetch('/api/cart');
        if (res && res.success && Array.isArray(res.items)) {
          Store.cart.items = res.items;
          Store.cart.count = res.count !== undefined ? res.count : res.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0);
          Store.cart.total = res.total !== undefined ? res.total : res.items.reduce((s, i) => s + (numericPrice(i.price) * (Number(i.quantity) || 1)), 0);
          Store.cart.totalOld = res.totalOld !== undefined ? res.totalOld : res.items.reduce((s, i) => s + ((numericPrice(i.oldPrice) || numericPrice(i.price)) * (Number(i.quantity) || 1)), 0);
        } else {
          const localStoreItems = getStore(CART_KEY, []);
          Store.cart.items = localStoreItems.map((item) => enrichCartItem(item, localStoreItems));
          recalcCartTotals();
        }
      } catch (e) {
        const localStoreItems = getStore(CART_KEY, []);
        Store.cart.items = localStoreItems.map((item) => enrichCartItem(item, localStoreItems));
        recalcCartTotals();
      }

      setStore(CART_KEY, Store.cart.items);
      triggerStateChange(CART_KEY, Store.cart.items);
      window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: Store.cart.items, count: Store.cart.count, total: Store.cart.total } }));
    },
    merge: async () => {
      const res = await apiFetch('/api/cart/merge', { method: 'POST', body: JSON.stringify({ guestId: GUEST_ID }) });
      if (res && res.success) await window.ZFB.Cart.init();
    },
    get: () => Store.cart.items,
    add: async (product, qty = 1) => {
      const pid = getCartItemId(product);
      const cartProduct = enrichCartItem({ ...product, quantity: qty }, Store.cart.items);
      /* Two sizes of the same product are two lines, not one: they cost
         different money. Matching on the id alone merged "6 كيلو" into
         "7 كيلو" and charged whichever landed in the cart first. */
      const sameSize = (p) => (p.selected_size || null) === (cartProduct.selected_size || null);
      const sameColor = (p) => !cartProduct.selected_color || p.selected_color === cartProduct.selected_color;
      let existing = Store.cart.items.find(p => getCartItemId(p) === pid && sameColor(p) && sameSize(p));
      if (existing) { existing.quantity = (existing.quantity || 1) + qty; }
      else { Store.cart.items.push(cartProduct); }

      recalcCartTotals();
      setStore(CART_KEY, Store.cart.items);
      triggerStateChange(CART_KEY, Store.cart.items);
      window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: Store.cart.items, count: Store.cart.count, total: Store.cart.total } }));

      try {
        const selectedColor = product.selected_color || product.selectedColor || product.color || null;
        const imageUrl = product.image || product.image_url || null;
        const res = await apiFetch('/api/cart/add', { 
          method: 'POST', 
          body: JSON.stringify({ 
            productId: pid,
            quantity: qty,
            selected_color: selectedColor,
            selected_size: cartProduct.selected_size || null,
            image_url: imageUrl
          })
        });
        if (res && res.success && Array.isArray(res.items)) {
          Store.cart.items = res.items;
          Store.cart.count = res.count !== undefined ? res.count : Store.cart.count;
          Store.cart.total = res.total !== undefined ? res.total : Store.cart.total;
          Store.cart.totalOld = res.totalOld !== undefined ? res.totalOld : Store.cart.totalOld;
          setStore(CART_KEY, Store.cart.items);
          triggerStateChange(CART_KEY, Store.cart.items);
          window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: Store.cart.items, count: Store.cart.count, total: Store.cart.total } }));
        }
        return res;
      } catch (err) {
        console.error('Cart add error:', err);
        return { success: false, error: err.message };
      }
    },
    updateQty: async (id, qty) => {
      const pid = String(id);
      let existing = Store.cart.items.find(p => getCartItemId(p) === pid);
      if (existing) {
        if (qty <= 0) {
          Store.cart.items = Store.cart.items.filter(p => getCartItemId(p) !== pid);
        } else {
          existing.quantity = qty;
        }

        recalcCartTotals();
        setStore(CART_KEY, Store.cart.items);
        triggerStateChange(CART_KEY, Store.cart.items);
        window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: Store.cart.items, count: Store.cart.count, total: Store.cart.total } }));

        try {
          const res = await apiFetch('/api/cart/update', { method: 'PUT', body: JSON.stringify({ productId: pid, quantity: qty }) });
          if (res && res.success && Array.isArray(res.items)) {
            Store.cart.items = res.items;
            Store.cart.count = res.count;
            Store.cart.total = res.total;
            Store.cart.totalOld = res.totalOld;
            setStore(CART_KEY, Store.cart.items);
            triggerStateChange(CART_KEY, Store.cart.items);
            window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: Store.cart.items, count: Store.cart.count, total: Store.cart.total } }));
          }
        } catch (_) {}
      }
    },
    remove: async (id) => {
      const pid = String(id);
      Store.cart.items = Store.cart.items.filter(p => getCartItemId(p) !== pid);

      recalcCartTotals();
      setStore(CART_KEY, Store.cart.items);
      triggerStateChange(CART_KEY, Store.cart.items);
      window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: Store.cart.items, count: Store.cart.count, total: Store.cart.total } }));

      try {
        const res = await apiFetch('/api/cart/remove', { method: 'DELETE', body: JSON.stringify({ productId: pid }) });
        if (res && res.success && Array.isArray(res.items)) {
          Store.cart.items = res.items;
          Store.cart.count = res.count;
          Store.cart.total = res.total;
          Store.cart.totalOld = res.totalOld;
          setStore(CART_KEY, Store.cart.items);
          triggerStateChange(CART_KEY, Store.cart.items);
          window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: Store.cart.items, count: Store.cart.count, total: Store.cart.total } }));
        }
      } catch (_) {}
    },
    clear: async () => {
      Store.cart.items = [];
      Store.cart.count = 0;
      Store.cart.total = 0;
      Store.cart.totalOld = 0;
      setStore(CART_KEY, []);
      triggerStateChange(CART_KEY, []);
      window.dispatchEvent(new CustomEvent('zfb-cart-updated', { detail: { items: [], count: 0, total: 0 } }));
      try {
        await apiFetch('/api/cart/clear', { method: 'DELETE' });
      } catch (_) {}
    },
    count: () => Store.cart.items.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0),
    total: () => Store.cart.items.reduce((sum, p) => sum + (numericPrice(p.price) * (Number(p.quantity) || 1)), 0),
    totalOld: () => Store.cart.items.reduce((sum, p) => sum + ((numericPrice(p.oldPrice) || numericPrice(p.price)) * (Number(p.quantity) || 1)), 0)
  };

  window.ZFB.Wishlist = {
    init: async () => {
      const res = await apiFetch('/api/wishlist');
      const localStoreItems = getStore(WISHLIST_KEY, []);
      
      if (res.success) {
        let enrichedItems = [];
        if (res.items) {
           res.items.forEach(dbItem => {
               const p = (window.PRODUCTS_DB || []).find(x => x.id === dbItem.id);
               if (p) {
                   enrichedItems.push(p);
               } else {
                   const local = localStoreItems.find(x => x.id === dbItem.id);
                   if (local) enrichedItems.push(local);
                   else enrichedItems.push(dbItem);
               }
           });
        }
        Store.wishlist = { items: enrichedItems, count: enrichedItems.length };
      } else {
        // Fallback to local storage if API fails
        Store.wishlist = { items: localStoreItems, count: localStoreItems.length };
      }
      
      setStore(WISHLIST_KEY, Store.wishlist.items);
      triggerStateChange(WISHLIST_KEY, Store.wishlist.items);
    },
    merge: async () => {
      const res = await apiFetch('/api/wishlist/merge', { method: 'POST', body: JSON.stringify({ guestId: GUEST_ID }) });
      if (res.success) window.ZFB.Wishlist.init();
    },
    get: () => Store.wishlist.items,
    toggle: async (product) => {
      let exists = Store.wishlist.items.find(p => String(p.id) === String(product.id));
      if (exists) Store.wishlist.items = Store.wishlist.items.filter(p => String(p.id) !== String(product.id));
      else Store.wishlist.items.push(product);
      
      Store.wishlist.count = Store.wishlist.items.length;
      
      setStore(WISHLIST_KEY, Store.wishlist.items);
      triggerStateChange(WISHLIST_KEY, Store.wishlist.items);

      apiFetch('/api/wishlist/toggle', { method: 'POST', body: JSON.stringify({ productId: product.id }) });
      return !exists;
    },
    has: (id) => !!Store.wishlist.items.find(p => String(p.id) === String(id))
  };

  // Cart and Wishlist initialization is done inside init() after PRODUCTS_DB is loaded
  // Do NOT call Cart.init() or Wishlist.init() here - they need PRODUCTS_DB first

  window.ZFB.Compare = {
    get: () => read(COMPARE_KEY),
    toggle: (product) => {
      let cmp = read(COMPARE_KEY);
      let exists = cmp.find(p => p.id === product.id);
      if(exists) {
        cmp = cmp.filter(p => p.id !== product.id);
      } else {
        if(cmp.length > 0 && cmp[0].category && product.category && cmp[0].category !== product.category) {
           alert("لا يمكن مقارنة منتجات من أقسام مختلفة. قم بإفراغ القائمة أولاً.");
           return false;
        }
        if(cmp.length >= 4) {
           alert("لا يمكن مقارنة أكثر من 4 منتجات.");
           return false;
        }
        cmp.push(product);
      }
      write(COMPARE_KEY, cmp);
      return !exists;
    },
    has: (id) => !!read(COMPARE_KEY).find(p => p.id === id)
  };

  // Replace old global window.addToCart with unified engine
  window.addToCart = function(btn, event) {
      if(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      const card = btn.closest('[data-product-id], .product-card, .premium-product-page, .cart-item');
      if(!card) return;
      const id = card.dataset.productId || new URLSearchParams(window.location.search).get('id');
      const qtyInput = card.querySelector('input[type="number"]');
      const qty = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
      
      let p = window.PRODUCTS_DB ? window.PRODUCTS_DB.find(x => x.id === id) : null;
      if(!p) {
         // Fallback build from DOM
         p = {
            id: id || 'gen-000',
            title: card.querySelector('h1, h3')?.textContent.trim() || 'منتج',
            price: parseFloat((card.dataset.price || card.querySelector('.price strong, .current')?.textContent || '0').replace(/[^\d.]/g, '')),
            image: card.querySelector('img')?.src || '',
            gallery: [card.querySelector('img')?.src || '']
         };
      }
      window.ZFB.Cart.add(p, qty);
      showToast('تمت إضافة المنتج للسلة');
      
      const original = btn.innerHTML;
      btn.innerHTML = 'تمت الإضافة';
      btn.style.backgroundColor = '#16a34a';
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.backgroundColor = '';
      }, 1200);
      return false;
  };

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

  // UI Syncer
  function updateGlobalUI() {
    // Cart counts
    const count = window.ZFB.Cart.count();
    document.querySelectorAll('.cart b, #floating-cart-count, .cart-count-badge').forEach(el => {
      el.textContent = el.classList.contains('cart-count-badge') ? count + ' منتجات' : count;
    });

    // Wishlist counts
    const wlCount = window.ZFB.Wishlist.get().length;
    document.querySelectorAll('.main-nav a[href="wishlist.html"], .icon-link[href="wishlist.html"]').forEach(el => {
      let badge = el.querySelector('.wishlist-badge');
      if (wlCount > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'wishlist-badge';
          el.appendChild(badge);
        }
        badge.textContent = wlCount;
      } else {
        if (badge) badge.remove();
      }
    });

    // Wishlist buttons active state
    const wl = window.ZFB.Wishlist.get().map(p=>p.id);
    document.querySelectorAll('.wish, .btn-wishlist, [data-action="wishlist"]').forEach(btn => {
       const card = btn.closest('[data-product-id], .premium-product-page, .cart-item');
       const id = card ? (card.dataset.productId || new URLSearchParams(window.location.search).get('id')) : null;
       if(id && wl.includes(id)) {
          btn.classList.add('is-active');
          btn.setAttribute('aria-pressed', 'true');
       } else {
          btn.classList.remove('is-active');
          btn.setAttribute('aria-pressed', 'false');
       }
    });

    // Compare buttons active state
    const cmp = window.ZFB.Compare.get().map(p=>p.id);
    document.querySelectorAll('.btn-compare, [data-action="compare"]').forEach(btn => {
       const card = btn.closest('[data-product-id], .premium-product-page, .cart-item');
       const id = card ? (card.dataset.productId || new URLSearchParams(window.location.search).get('id')) : null;
       if(id && cmp.includes(id)) {
          btn.classList.add('is-active');
          btn.setAttribute('aria-pressed', 'true');
       } else {
          btn.classList.remove('is-active');
          btn.setAttribute('aria-pressed', 'false');
       }
    });
  }

  window.addEventListener('zfb-state-change', updateGlobalUI);

  // Auto setup interactive elements
  function setupGlobalInteractions() {
    document.addEventListener('click', (e) => {
       // Wishlist toggle
       const wlBtn = e.target.closest('.wish, .btn-wishlist, [data-action="wishlist"]');
       if(wlBtn && wlBtn.tagName !== 'A') { 
          const href = wlBtn.getAttribute('href');
          if(href && href.includes('wishlist.html') && wlBtn.closest('.nav-actions')) return; 
          e.preventDefault();
          const card = wlBtn.closest('[data-product-id], .premium-product-page, .cart-item');
          let id = card ? (card.dataset.productId || new URLSearchParams(window.location.search).get('id')) : null;
          
          if (!id && card && card.classList.contains('cart-item')) {
              // extract from link
              const a = card.querySelector('a[href*="product.html?id="]');
              if (a) {
                  id = new URLSearchParams(a.search).get('id');
              }
          }

          if(id && window.PRODUCTS_DB) {
             const p = window.PRODUCTS_DB.find(x=>x.id===id);
             if(p) {
                let added = window.ZFB.Wishlist.toggle(p);
                showToast(added ? 'تمت الإضافة للمفضلة' : 'تم الحذف من المفضلة');
             }
          } else if (id) {
             let added = window.ZFB.Wishlist.toggle({id: id, title: 'منتج مجهول', price: 0});
             showToast(added ? 'تمت الإضافة للمفضلة' : 'تم الحذف من المفضلة');
          }
       }

       // Compare toggle
       const cmpBtn = e.target.closest('.btn-compare, [data-action="compare"]');
       if(cmpBtn && cmpBtn.tagName !== 'A') {
          e.preventDefault();
          const card = cmpBtn.closest('[data-product-id], .premium-product-page');
          const id = card ? (card.dataset.productId || new URLSearchParams(window.location.search).get('id')) : null;
          if(id && window.PRODUCTS_DB) {
             const p = window.PRODUCTS_DB.find(x=>x.id===id);
             if(p) {
                let added = window.ZFB.Compare.toggle(p);
                if(added !== false) {
                   showToast(added ? 'تمت الإضافة للمقارنة' : 'تم الحذف من المقارنة');
                }
             }
          }
       }
    });
  }

  window.ZFB.Search = {
    query: (val) => {
        val = val.toLowerCase().trim();
        if(!val) return window.PRODUCTS_DB || [];
        
        const intentMap = {
           'غسال': ['غسال', 'اكسسوارات', 'عروض', 'منظف'],
           'ثلاج': ['ثلاج', 'عروض', 'فريزر'],
           'مطبخ': ['مطبخ', 'دواليب', 'أواني', 'عروض'],
           'طاقة': ['شمسي', 'الواح', 'بطاريا', 'منظم', 'عروض'],
           'مجلس': ['مجلس', 'كنب', 'موكيت', 'طاولات', 'عروض'],
           'غرف': ['نوم', 'دولاب', 'سرير', 'مرتب', 'عروض']
        };

        let searchTerms = [val];
        val.split(/\s+/).forEach(word => {
            if (word.length >= 2 && word !== val) {
                searchTerms.push(word);
            }
        });
        for (let key in intentMap) {
            if (val.includes(key)) {
                searchTerms = searchTerms.concat(intentMap[key]);
            }
        }
        
        let results = (window.PRODUCTS_DB||[]).map(p => {
           let score = 0;
           searchTerms.forEach(term => {
               if(p.title && p.title.toLowerCase().includes(term)) score += 10;
               if(p.description && p.description.toLowerCase().includes(term)) score += 5;
               if(p.brand && p.brand.toLowerCase().includes(term)) score += 3;
               if(p.sku && p.sku.toLowerCase().includes(term)) score += 8;
               if(p.category && p.category.toLowerCase().includes(term)) score += 8;
               if(p.subcategory && p.subcategory.toLowerCase().includes(term)) score += 6;
               if(p.tags && p.tags.some(t => t.toLowerCase().includes(term))) score += 4;
           });
           if (score > 0 && p.isOffer) score += 2; // Boost offers for matching intent
           return { product: p, score };
        }).filter(p => p.score > 0).sort((a,b) => b.score - a.score).map(p => p.product);
        
        // Remove duplicates
        return [...new Map(results.map(item => [item.id, item])).values()];
    }
  };

  // Smart Search Engine
  function setupSmartSearch() {
    document.querySelectorAll('form.search input[type="search"]').forEach(input => {
      let wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'stretch';
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      wrapper.className = 'zfb-search-wrapper';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);

      let suggestions = document.createElement('div');
      suggestions.className = 'search-suggestions';
      suggestions.style.cssText = 'position:absolute; top:100%; left:0; right:0; background:var(--surface, #fff); border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:9999; display:none; max-height:400px; overflow-y:auto; margin-top:4px;';
      wrapper.appendChild(suggestions);

      input.addEventListener('input', (e) => {
        let val = e.target.value.toLowerCase().trim();
        if(val.length < 2) { suggestions.style.display = 'none'; return; }
        
        let results = window.ZFB.Search.query(val).slice(0, 5);

        if(results.length > 0) {
          suggestions.innerHTML = results.map(p => `
            <a href="product.html?id=${p.id}" style="display:flex; align-items:center; gap:12px; padding:12px; text-decoration:none; color:inherit; border-bottom:1px solid #eee;">
               <img src="${p.gallery?.[0] || 'assets/zeyad-product-sprite.png'}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
               <div>
                  <div style="font-weight:600; font-size:14px;">${escHtml(p.title)}</div>
                  <div style="color:var(--primary); font-size:13px; font-weight:700;">${p.price} ر.س</div>
               </div>
            </a>
          `).join('') + `<a href="search.html?q=${encodeURIComponent(val)}" style="display:block; padding:12px; text-align:center; color:var(--primary); font-weight:600; text-decoration:none;">عرض كل النتائج</a>`;
          suggestions.style.display = 'block';
        } else {
          let fb = (window.PRODUCTS_DB||[]).filter(p=>p.isBestSeller).slice(0,3);
          if (fb.length === 0) fb = (window.PRODUCTS_DB||[]).filter(p=>p.isOffer).slice(0,3);
          if (fb.length === 0) fb = (window.PRODUCTS_DB||[]).slice(0,3);
          
          suggestions.innerHTML = `<div style="padding:12px; color:#666; font-size:13px;">عذراً، لم نجد نتائج. اقتراحات قد تعجبك:</div>` + fb.map(p => `
            <a href="product.html?id=${p.id}" style="display:flex; align-items:center; gap:12px; padding:12px; text-decoration:none; color:inherit; border-bottom:1px solid #eee;">
               <img src="${p.gallery?.[0] || 'assets/zeyad-product-sprite.png'}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;">
               <div>
                  <div style="font-weight:600; font-size:14px;">${escHtml(p.title)}</div>
                  <div style="color:var(--primary); font-size:13px; font-weight:700;">${p.price} ر.س</div>
               </div>
            </a>
          `).join('');
          suggestions.style.display = 'block';
        }
      });

      document.addEventListener('click', (e) => {
        if(!wrapper.contains(e.target)) suggestions.style.display = 'none';
      });

      const form = input.closest('form');
      if (form) {
          form.addEventListener('submit', (e) => {
             e.preventDefault();
             if (input.value.trim()) {
                 window.location.href = `search.html?q=${encodeURIComponent(input.value.trim())}`;
             }
          });
      }
    });
  }

  // Dynamic WhatsApp integration
  function setupWhatsApp() {
    document.querySelectorAll('a[href*="wa.me"], .btn-whatsapp').forEach(link => {
       link.addEventListener('click', (e) => {
          e.preventDefault();
          let phone = window.ZFB_CONFIG?.contact?.whatsapp || "967775010726";
          let message = "مرحباً زياد ستور، أود الاستفسار.";
          
          if(window.location.pathname.includes('product.html') && window.PRODUCTS_DB) {
              const id = new URLSearchParams(window.location.search).get('id');
              const p = window.PRODUCTS_DB.find(x=>x.id===id);
              if(p) {
                  message = `مرحباً، أود الاستفسار عن المنتج:\n${p.title}\nرمز: ${p.sku || p.id}\nالسعر: ${p.price} ر.س\nالرابط: ${window.location.href}`;
              }
          } else if(window.location.pathname.includes('cart.html')) {
              let cart = window.ZFB.Cart.get();
              if(cart.length > 0) {
                 message = `مرحباً، أود إتمام طلبي. محتويات السلة:\n` + cart.map(item => `- ${item.title || item.name} (${item.quantity}x)`).join('\n') + `\nالإجمالي: ${window.ZFB.Cart.total()} ر.س`;
              }
          }
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
       });
    });
  }

  // Calculators Overrides
  function setupCalculators() {
     const handleCalc = (formId, actionUrl, calcFn) => {
        const form = document.querySelector(`form[action="${actionUrl}"]`) || document.getElementById(formId);
        if(!form) return;
        form.addEventListener('submit', (e) => {
           e.preventDefault();
           let fd = new FormData(form);
           let html = calcFn(fd);
           let res = document.createElement('div');
           res.className = 'calc-result zfb-dynamic-calc';
           res.style.cssText = 'margin-top:20px; padding:20px; background:var(--surface-alt, #f8f9fa); border-radius:8px; border:1px solid #ddd;';
           res.innerHTML = html;
           const existingRes = form.querySelector('.calc-result');
           if(existingRes) existingRes.remove();
           form.appendChild(res);
        });
     };

     handleCalc(null, '/api/calculate-solar', (fd) => {
         let config = window.ZFB_CONFIG?.calculators?.solar || { panel400w: 150, battery200a: 250, inverterBase: 500, conversionRateToLocal: 3.75 };
         let appliances = parseInt(fd.get('appliances')||'0');
         let power = parseInt(fd.get('power')||'0');
         let hours = parseInt(fd.get('hours')||'0');
         let dailyEnergyWh = appliances * power * hours;
         if(dailyEnergyWh === 0) dailyEnergyWh = 5000;
         let panels = Math.ceil(dailyEnergyWh / 400 / 5);
         let batteries = Math.ceil(dailyEnergyWh / 2400);
         let costSAR = (panels * config.panel400w + batteries * config.battery200a + config.inverterBase) * config.conversionRateToLocal;
         let phone = window.ZFB_CONFIG?.contact?.whatsapp || "967775010726";
         return `
            <h3 style="margin-bottom:15px; color:var(--primary);">نتيجة الحساب المبدئية</h3>
            <p>الاستهلاك اليومي التقريبي: <strong>${dailyEnergyWh} واط/ساعة</strong></p>
            <ul style="margin:10px 0; padding-right:20px;">
              <li>تحتاج إلى: <strong>${panels}</strong> ألواح شمسية</li>
              <li>تحتاج إلى: <strong>${batteries}</strong> بطاريات</li>
              <li>تغطية الإنفرتر: <strong>${Math.ceil(appliances * power / 1000) + 1} kW</strong></li>
            </ul>
            <div style="margin-top:15px; font-size:18px;">التكلفة التقديرية: <strong>${costSAR.toLocaleString('ar-SA')} ر.س</strong></div>
            <button type="button" class="btn-primary" style="margin-top:15px; width:100%;" onclick="window.open('https://wa.me/${phone}?text='+encodeURIComponent('أريد استشارة حول نظام طاقة شمسية بتكلفة تقديرية ${costSAR} ر.س'))">طلب استشارة للتركيب</button>
         `;     });

     handleCalc(null, '/api/calculate-majlis', (fd) => {
         let config = window.ZFB_CONFIG?.calculators?.majlis || { fabricStandard: 300, fabricLuxury: 450, fabricRoyal: 600 };
         let length = parseFloat(fd.get('length')||'4');
         let width = parseFloat(fd.get('width')||'4');
         let type = fd.get('type')||'standard';
         let perimeter = (length + width) * 2 - 1;
         let pricePerMeter = type === 'luxury' ? config.fabricLuxury : type === 'royal' ? config.fabricRoyal : config.fabricStandard;
         let totalCost = perimeter * pricePerMeter;
         return `
            <h3 style="margin-bottom:15px; color:var(--primary);">التكلفة التقديرية للمجلس</h3>
            <p>طول التفصيل (تقريبي): <strong>${perimeter.toFixed(1)} متر</strong></p>
            <div style="margin-top:15px; font-size:18px;">إجمالي التكلفة: <strong>${totalCost.toLocaleString('ar-SA')} ر.س</strong></div>
         `;     });

     handleCalc(null, '/api/calculate-kitchen', (fd) => {
         let config = window.ZFB_CONFIG?.calculators?.kitchen || { aluminumStandard: 800, aluminumPremium: 1200, woodMDF: 1500, woodOak: 2200 };
         let length = parseFloat(fd.get('length')||'3');
         let width = parseFloat(fd.get('width')||'3');
         let material = fd.get('material')||'aluminumStandard';
         let perimeter = (length + width) * 2;
         let pricePerMeter = config[material] || config.aluminumStandard;
         let totalCost = perimeter * pricePerMeter;
         return `
            <h3 style="margin-bottom:15px; color:var(--primary);">التكلفة التقديرية للمطبخ</h3>
            <p>المساحة الجدارية للتفصيل: <strong>${perimeter.toFixed(1)} متر</strong></p>
            <div style="margin-top:15px; font-size:18px;">إجمالي التكلفة: <strong>${totalCost.toLocaleString('ar-SA')} ر.س</strong></div>
         `;     });
  }

  // General fixes for dead links
  function fixDeadLinks() {
     document.querySelectorAll('a[href="#"], a[href="javascript:void(0)"]').forEach(a => {
        if(!a.onclick && !a.dataset.action && !a.classList.contains('wish') && !a.classList.contains('btn-wishlist')) {
           a.addEventListener('click', (e) => {
              e.preventDefault();
              showToast("هذه الميزة ستكون متاحة قريباً.");
           });
        }
     });
     
     document.querySelectorAll('a').forEach(a => {
        const text = a.textContent.trim();
        if(text === 'العروض' && a.getAttribute('href') !== 'offers.html') {
          a.setAttribute('href', 'offers.html');
        }
     });
  }

  // --- Dynamic Cart & Wishlist Pages Rendering ---
  function renderDynamicPages() {
     const path = window.location.pathname;

     if(path.includes('cart.html')) {
         const itemsContainer = document.querySelector('.cart-items');
         const summaryContainer = document.querySelector('.order-summary');
         if(itemsContainer && summaryContainer) {
             const renderCart = () => {
                 const cart = window.ZFB.Cart.get();
                 if(cart.length === 0) {
                     document.querySelector('.cart-empty').style.display = 'block';
                     document.querySelector('.cart-layout').style.display = 'none';
                     return;
                 }
                 document.querySelector('.cart-empty').style.display = 'none';
                 document.querySelector('.cart-layout').style.display = 'flex';
                 
                 function formatCartMoney(val) {
                    if (window.ZFB_CURRENCY && typeof window.ZFB_CURRENCY.format === 'function') {
                      return window.ZFB_CURRENCY.format(val);
                    }
                    return `${Number(val || 0).toLocaleString('ar-SA')} ر.س`;
                  }

                 itemsContainer.innerHTML = cart.map(p => {
                    const productId = getCartItemId(p);
                    const itemPrice = numericPrice(p.price);
                    const itemQuantity = Number(p.quantity) || 1;
                    return `
                    <article class="cart-item" data-product-id="${productId}" data-price="${itemPrice}">
                      <a href="product.html?id=${productId}" class="cart-item-img">
                        <img src="${window.ZFB.normalizeImagePath(p.image || p.gallery?.[0])}" style="width:100%; height:100%; object-fit:cover;">
                      </a>
                      <div class="cart-item-body">
                        <h3>${escHtml(p.title || p.name || 'منتج من زياد ستور')}</h3>
                        <div class="cart-item-meta">الماركة: ${p.brand || 'زياد'} · رمز: ${p.sku || productId}</div>
                        <div class="cart-item-price">
                          <strong>${itemPrice > 0 ? formatCartMoney(itemPrice) : 'يحدد عند التأكيد'}</strong>
                        </div>
                        <div class="cart-item-actions">
                          <div class="cart-qty">
                            <button type="button" aria-label="زيادة" onclick="window.ZFB.Cart.updateQty('${productId}', ${itemQuantity + 1})">+</button>
                            <span>${itemQuantity}</span>
                            <button type="button" aria-label="إنقاص" onclick="window.ZFB.Cart.updateQty('${productId}', ${itemQuantity - 1})">-</button>
                          </div>
                          <button class="btn-remove-item" type="button" onclick="window.ZFB.Cart.remove('${productId}')">
                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;margin-left:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                             إزالة
                          </button>
                        </div>
                      </div>
                    </article>
                 `;
                 }).join('');

                 const total = window.ZFB.Cart.total();
                 const totalOld = window.ZFB.Cart.totalOld();
                 const discount = totalOld > total ? totalOld - total : 0;
                 const count = window.ZFB.Cart.count();

                 const subtotalEl = summaryContainer.querySelector('.subtotal-amount');
                 const countTextEl = summaryContainer.querySelector('.cart-items-count-text');
                 const totalEl = summaryContainer.querySelector('.total-amount') || summaryContainer.querySelector('.summary-total strong');
                 const countBadge = document.querySelector('.cart-header .cart-count-badge');
                 const discountLine = summaryContainer.querySelector('.discount-line');
                 const discountAmount = summaryContainer.querySelector('.discount-amount');

                 if (subtotalEl) subtotalEl.textContent = formatCartMoney(totalOld > 0 ? totalOld : total);
                 if (countTextEl) countTextEl.textContent = `${count} ${count === 1 ? 'منتج' : 'منتجات'}`;
                 if (totalEl) totalEl.textContent = formatCartMoney(total);
                 if (countBadge) countBadge.textContent = `${count} منتجات`;

                 if (discountLine && discountAmount) {
                   if (discount > 0) {
                     discountLine.style.display = 'flex';
                     discountAmount.textContent = '- ' + formatCartMoney(discount);
                   } else {
                     discountLine.style.display = 'none';
                   }
                 }
             };
             renderCart();
             window.addEventListener('zfb-state-change', renderCart);
             window.addEventListener('zfb-cart-updated', renderCart);
             window.addEventListener('zfb-currency-change', renderCart);
         }
     }

     if(path.includes('wishlist.html')) {
         const grid = document.querySelector('.wishlist-grid');
         if(grid) {
             const renderWishlist = () => {
                 const wl = window.ZFB.Wishlist.get();
                 if(wl.length === 0) {
                     grid.innerHTML = '<p style="text-align:center; padding:40px; grid-column:1/-1;">المفضلة فارغة.</p>';
                     document.querySelector('.wishlist-header p').textContent = '0 منتجات محفوظة في قائمتك';
                     return;
                 }
                 document.querySelector('.wishlist-header p').textContent = wl.length + ' منتجات محفوظة في قائمتك';
                 grid.innerHTML = wl.map(p => `
                    <article class="product-card" data-product-id="${p.id}">
                      <a href="product.html?id=${p.id}" class="product-photo-link" style="display:block; width:100%; aspect-ratio:4/5; flex-shrink:0; overflow:hidden;">
                        <img src="${window.ZFB.normalizeImagePath(p.gallery?.[0] || p.image)}" alt="${escHtml(p.title)}" style="width:100%; height:100%; object-fit:cover; display:block;">
                      </a>
                      <div class="product-body">
                        <h3>${escHtml(p.title)}</h3>
                        <div class="price">
                          <strong>${p.price} ر.س</strong>
                        </div>
                        <div class="stock" style="margin-top:auto;">
                          <div style="display:flex; gap:8px;">
                            <button type="button" class="wish is-active" aria-label="مفضلة" style="position:static;"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"></path></svg></button>
                            <button type="button" class="btn-primary btn-add-cart-mini" onclick="window.addToCart(this, event)">إضافة للسلة</button>
                          </div>
                        </div>
                      </div>
                    </article>
                 `).join('');             };
             renderWishlist();
             window.addEventListener('zfb-state-change', renderWishlist);
         }
     }

     if(path.includes('compare.html')) {
         const grid = document.querySelector('.compare-grid') || document.querySelector('.product-grid') || document.querySelector('main');
         if(grid) {
             const renderCompare = () => {
                 const cmp = window.ZFB.Compare.get();
                 if(cmp.length === 0) {
                     grid.innerHTML = '<div style="text-align:center; padding:40px; width:100%;">المقارنة فارغة. أضف منتجات للمقارنة.</div>';
                     return;
                 }
                 let html = '<div style="display:flex; gap:20px; overflow-x:auto; padding:20px;">';
                 html += cmp.map(p => `
                    <article class="product-card" data-product-id="${p.id}" style="min-width:250px;">
                      <button class="btn-compare" style="float:left; color:red; font-size:24px; background:none; border:none; cursor:pointer;" aria-label="إزالة">×</button>
                      <a href="product.html?id=${p.id}" class="product-photo-link" style="display:block; width:100%; aspect-ratio:4/5; flex-shrink:0; overflow:hidden;">
                        <img src="${window.ZFB.normalizeImagePath(p.gallery?.[0] || p.image)}" alt="${escHtml(p.title)}" style="width:100%; height:100%; object-fit:cover; display:block;">
                      </a>
                      <div class="product-body" style="padding-top:10px;">
                        <h3>${escHtml(p.title)}</h3>
                        <div class="price"><strong>${p.price} ر.س</strong></div>
                        <ul style="margin-top:10px; font-size:14px; color:#555; padding-right:15px;">
                          <li>الماركة: ${p.brand || '-'}</li>
                          <li>الضمان: ${p.warranty || '-'}</li>
                          <li>التقييم: ${p.rating || '-'}</li>
                        </ul>
                      </div>
                    </article>
                 `).join('');                 html += '</div>';
                 
                 // If there's an existing table or grid, just overwrite it
                 const existingContent = grid.querySelector('.zfb-dynamic-compare');
                 if(existingContent) existingContent.remove();
                 
                 const div = document.createElement('div');
                 div.className = 'zfb-dynamic-compare';
                 div.innerHTML = html;
                 grid.appendChild(div);
             };
             renderCompare();
             window.addEventListener('zfb-state-change', renderCompare);
         }
     }
  }

  // --- Search page rendering ---
  function renderSearchPage() {
     if(!window.location.pathname.includes('search.html')) return;
     const grid = document.querySelector('.search-results-grid') || document.querySelector('.product-grid') || document.querySelector('.horizontal-cards') || document.querySelector('main');
     const heading = document.querySelector('h1');
     const q = new URLSearchParams(window.location.search).get('q');
     
     if(heading && q) heading.textContent = `نتائج البحث عن "${q}"`;

     if(grid && window.PRODUCTS_DB) {
         let results = window.PRODUCTS_DB;
         if(q) {
             results = window.ZFB.Search.query(q);
         }

         if(results.length === 0) {
             grid.innerHTML = '<p style="text-align:center; padding:40px; grid-column:1/-1;">لم نجد نتائج مطابقة لبحثك.</p>';
         } else {
             grid.innerHTML = results.map(p => `
                <article class="product-card" data-product-id="${p.id}">
                  <a href="product.html?id=${p.id}" class="product-photo-link" style="display:block; width:100%; aspect-ratio:4/5; flex-shrink:0; overflow:hidden;">
                     <img src="${window.ZFB.normalizeImagePath(p.gallery?.[0] || p.main_image || p.image)}" alt="${escHtml(p.title)}" style="width:100%; height:100%; object-fit:cover; display:block;">
                  </a>
                  <div class="product-body">
                    <h3>${escHtml(p.title)}</h3>
                    <div class="price">
                      <strong>${p.price} ر.س</strong>
                    </div>
                    <div class="stock" style="margin-top:auto;">
                      <div style="display:flex; gap:8px;">
                        <button type="button" class="wish" aria-label="مفضلة" style="position:static;"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"></path></svg></button>
                        <button type="button" class="btn-primary btn-add-cart-mini" onclick="window.addToCart(this, event)">إضافة للسلة</button>
                      </div>
                    </div>
                  </div>
                </article>
             `).join('');
             updateGlobalUI(); 
         }
     }
  }

  // Apply dynamic configuration from ZFB_CONFIG
  function applyDynamicConfig() {
      const config = window.ZFB_CONFIG;
      if (!config) return;

      // Update emails
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
          a.setAttribute('href', `mailto:${config.contact.email}`);
          if (a.textContent.includes('@')) a.textContent = config.contact.email;
      });

      // Update phones
      document.querySelectorAll('a[href^="tel:"]').forEach(a => {
          a.setAttribute('href', `tel:${config.contact.phone}`);
          if (a.textContent.match(/[\d+]{6,}/)) a.textContent = config.contact.phone;
      });

      // Social Links
      const socialContainer = document.getElementById('zfb-social-links');
      if (socialContainer && config.social) {
          const socialGlyphs = {
            facebook: 'f', instagram: '◎', tiktok: '♪', whatsapp: '◔',
            telegram: '➤', youtube: '▶', x: '𝕏'
          };
          socialContainer.innerHTML = config.social
              .filter(s => s.active)
              .map(s => `<a class="zfb-social-link network-${s.id}" href="${s.url}" target="_blank" rel="noopener noreferrer" aria-label="${escHtml(s.name)}"><span aria-hidden="true">${socialGlyphs[s.id] || '•'}</span></a>`)
              .join('');
      }
  }

  async function loadDynamicData() {
     // 1. Fetch settings from API
     try {
         const res = await fetch('/api/settings');
         if (res.ok) {
             const json = await res.json();
             if (json.success && json.data) {
                 const data = json.data;
                 
                 // Update window.ZFB_CONFIG
                 window.ZFB_CONFIG = window.ZFB_CONFIG || {};
                 if (data.site_name) window.ZFB_CONFIG.storeName = data.site_name;
                 if (data.default_currency) window.ZFB_CONFIG.currency = data.default_currency;
                 window.ZFB_CONFIG.exchangeRate = Number(data.exchange_rate) || 140;
                 
                 window.ZFB_CONFIG.contact = {
                     phone: data.contact_phone || window.ZFB_CONFIG.contact?.phone || '+967775010726',
                     whatsapp: data.contact_whatsapp || window.ZFB_CONFIG.contact?.whatsapp || '967775010726',
                     email: data.contact_email || window.ZFB_CONFIG.contact?.email || 'zeyad775010@gmail.com',
                     address: data.contact_address || window.ZFB_CONFIG.contact?.address || 'صنعاء، اليمن'
                 };
                 
                 // Map social media
                 if (window.ZFB_CONFIG.social) {
                     window.ZFB_CONFIG.social.forEach(s => {
                         const dbKey = 'social_' + s.id;
                         if (data[dbKey]) {
                             s.url = data[dbKey];
                             s.active = true;
                         } else if (s.id === 'whatsapp') {
                             s.url = `https://wa.me/${window.ZFB_CONFIG.contact.whatsapp}`;
                             s.active = true;
                         }
                     });
                 }
                 
                 // Update logo container
                 if (data.site_logo) {
                     window.ZFB_CONFIG.logo = data.site_logo;
                 }
             }
         }
     } catch (e) {
         console.warn('API settings unavailable. Using local fallback ZFB_CONFIG.');
     }

     // 2. Fetch products from API
     try {
         const res = await fetch('/api/products?limit=1000');
         if (res.ok) {
             const json = await res.json();
             if (json.success && Array.isArray(json.data)) {
                 // Map products to frontend shape
                 window.PRODUCTS_DB = json.data.map(p => {
                     const gallery = p.main_image ? [p.main_image] : [];
                     return {
                         id: p.product_id,
                         title: p.title,
                         price: p.price,
                         oldPrice: p.old_price,
                         rating: String(p.rating || '0.0'),
                         reviewsCount: p.reviews_count || 0,
                         brand: p.brand || '',
                         origin: p.origin || '',
                         sku: p.sku || '',
                         warranty: p.warranty || '',
                         shipping: p.shipping || '',
                         deliveryTime: p.delivery_time || '',
                         installation: p.installation ? (p.installation === 1 || p.installation === '1' ? 'متوفر' : p.installation) : 'غير متوفر',
                         weight: p.weight || '',
                         gallery: gallery,
                         video: p.video || '',
                         colors: [],
                         sizes: [],
                         isNew: p.is_new === 1,
                         isBestSeller: p.is_best_seller === 1,
                         description: p.description || '',
                         specs: [],
                         faq: []
                     };
                 });
                 window.dispatchEvent(new CustomEvent('zfb-db-loaded'));
                 return;
             }
         }
     } catch (e) {
         console.warn('API /api/products unavailable. Trying static JSON...');
     }

     // Try static JSON cache fallback
     try {
         const res = await fetch('products_db.json');
         if (res.ok) {
             window.PRODUCTS_DB = await res.json();
             window.dispatchEvent(new CustomEvent('zfb-db-loaded'));
             return;
         }
     } catch (e) {
         console.warn('Static products_db.json unavailable. Relying on products_db.js.');
     }
  }

  async function init() {
     await loadDynamicData();
     
     // Initialize Cart and Wishlist AFTER PRODUCTS_DB is loaded
     await window.ZFB.Cart.init();
     await window.ZFB.Wishlist.init();
     
     applyDynamicConfig();
     updateGlobalUI();
     setupGlobalInteractions();
     setupSmartSearch();
     setupWhatsApp();
     setupCalculators();
     fixDeadLinks();
     renderDynamicPages();
     renderSearchPage();
     updateLogoMarkup();
     setupStickyHeader();
  }

  // Dynamic logo rendering readiness helper
  function updateLogoMarkup() {
      const brandLogo = document.querySelector('.brand');
      if (brandLogo && window.ZFB_CONFIG?.logo) {
          brandLogo.innerHTML = `
              <img class="brand-logo-img" src="${window.ZFB_CONFIG.logo}" alt="${window.ZFB_CONFIG.storeName || 'زياد ستور'}">
              <span class="sr-only">${window.ZFB_CONFIG.storeName || 'زياد ستور'}</span>
          `;
      }
  }

  // Sticky header scroll listener
  function setupStickyHeader() {
      const handleScroll = () => {
          if (window.scrollY > 40) {
              document.body.classList.add('nav-scrolled');
          } else {
              document.body.classList.remove('nav-scrolled');
          }
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll(); // Run initially
  }

  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
  } else {
      init();
  }

  const checkDb = setInterval(() => {
     if(window.PRODUCTS_DB) {
        clearInterval(checkDb);
        // Re-init cart/wishlist with enriched data if needed
        window.ZFB.Cart.init().then(() => {
           window.ZFB.Wishlist.init().then(() => {
              renderDynamicPages();
              renderSearchPage();
              updateGlobalUI();
           });
        });
     }
  }, 200);

  // Global Image normalizer helper
  window.ZFB = window.ZFB || {};
  window.ZFB.normalizeImagePath = function(src) {
    if (!src || typeof src !== 'string') return IMAGE_FALLBACK;
    src = src.trim();
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) return src;
    return src.replace(/^\/+/, '');
  };

})();

