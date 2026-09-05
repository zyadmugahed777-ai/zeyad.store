
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

/**
 * What the installation line should say.
 *
 * products.installation is a TEXT column doing three jobs at once: a yes/no
 * flag written by the admin checkbox, a NUMERIC round-trip from an older
 * import ('0.0' / '1.0'), and free prose an operator may have typed. The old
 * one-liner here asked `raw.installation ? ...`, and since '0.0' is a true
 * string in JavaScript, 21 products told their customers that installation
 * was, literally, "0.0".
 *
 * Numbers are read as numbers, the recognised words are read as words, and
 * anything else is the operator's own sentence and is shown as written.
 */
function installationText(value) {
  if (value === true || value === 1) return 'متوفر';
  if (value === false || value === 0 || value == null) return 'غير متوفر';

  const s = String(value).trim();
  if (s === '') return 'غير متوفر';

  if (/^[0-9]+(\.[0-9]+)?$/.test(s)) return Number(s) === 0 ? 'غير متوفر' : 'متوفر';

  const word = s.toLowerCase();
  if (['false', 'no', 'off', 'null', 'none', 'لا', 'لا يوجد'].indexOf(word) >= 0) return 'غير متوفر';
  if (['true', 'yes', 'on', 'نعم'].indexOf(word) >= 0) return 'متوفر';

  return s;
}

/**
 * Clean rich text that is MEANT to contain markup.
 *
 * The product description is written in the admin's rich-text editor, so it
 * legitimately holds <h3>, <br>, <strong>, lists and so on. Escaping it -- which
 * is what happened before -- turned an operator's formatted description into a
 * wall of literal "<h3>...<br>" on the product page. Every product looked broken.
 *
 * Escaping was the wrong tool, not the wrong instinct: the text is operator
 * input and must still not be able to run script. So the markup is kept and the
 * dangerous parts are removed instead.
 *
 * Removed: script/style/iframe/object/embed/form/input and their contents; every
 * on* event attribute; javascript: and data: URLs; and any tag not on the list
 * below. What survives is formatting, and formatting cannot execute.
 */
function sanitizeRichText(value) {
  const html = String(value == null ? '' : value);
  if (!html) return '';

  const ALLOWED = new Set([
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'hr',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'
  ]);

  // Parsing rather than pattern-matching: the browser's own parser decides what
  // a tag is, so there is no regex to slip past with a malformed attribute.
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');

  doc.body.querySelectorAll('script, style, iframe, object, embed, form, input, textarea, link, meta')
    .forEach((el) => el.remove());

  doc.body.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED.has(tag)) {
      // Keep the words, drop the tag -- an unknown wrapper should not delete
      // the sentence inside it.
      el.replaceWith(...el.childNodes);
      return;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = String(attr.value || '');
      const isSafeHref = tag === 'a' && name === 'href' &&
        /^(https?:|mailto:|tel:|\/|#)/i.test(val.trim());
      if (name.startsWith('on') || (!isSafeHref && (name === 'href' || name === 'src'))) {
        el.removeAttribute(attr.name);
      } else if (!['href', 'title', 'dir', 'lang'].includes(name)) {
        // No style, no class, no data-*: the page's own stylesheet decides how
        // a description looks, not whatever the editor pasted in.
        el.removeAttribute(attr.name);
      }
    }

    if (tag === 'a') {
      el.setAttribute('rel', 'nofollow noopener');
      el.setAttribute('target', '_blank');
    }
  });

  return doc.body.innerHTML;
}

/**
 * NAJM & ZFB PRODUCT ENGINE — V2.0 PRO MAX
 * Mobile-First, Authoritative Cart & Currency Synchronized
 */
(function () {
  'use strict';

  const CART_KEY = "zfb.cart";
  const WISHLIST_KEY = "zfb.wishlist";
  const COMPARE_KEY = "zfb.compare";

  let currentProduct = null;
  let currentMedia = [];
  let currentMediaIndex = 0;
  let selectedColor = null;
  let selectedSize = null;

  function qs(id) {
    return document.getElementById(id);
  }

  function getProductIdFromUrl() {
    return new URLSearchParams(window.location.search).get("id");
  }

  function formatPrice(value) {
    if (window.ZFB_CURRENCY && typeof window.ZFB_CURRENCY.format === 'function') {
      return window.ZFB_CURRENCY.format(Number(value || 0));
    }
    return `${Number(value || 0).toLocaleString("ar-SA")} ر.س`;
  }

  function getCategoryCode(product) {
    if (product.category) return product.category;
    return String(product.id || "gen").split("-")[0] || "gen";
  }

  function getCategoryLabel(code) {
    const map = {
      appl: "الأجهزة الكهربائية",
      fur: "الأثاث",
      bed: "غرف النوم",
      maj: "المجالس",
      kit: "المطابخ",
      sol: "الطاقة الشمسية",
      kid: "غرف الأطفال",
      gen: "منتجات مختارة"
    };
    return map[code] || "المنتجات";
  }

  function getCategoryLink(code) {
    const map = {
      appl: "appliances-catalog.html",
      fur: "furniture-catalog.html",
      bed: "bedrooms-catalog.html",
      maj: "majalis-catalog.html",
      kit: "kitchens-catalog.html",
      sol: "solar-catalog.html",
      kid: "kids-rooms.html",
      gen: "collections.html"
    };
    return map[code] || "collections.html";
  }

  function getProductById(id) {
    if (!id) return null;
    const cleanId = String(id).trim();
    return (window.PRODUCTS_DB || []).find((item) => (
      String(item.id) === cleanId ||
      String(item.product_id || '') === cleanId ||
      String(item.sku || '') === cleanId
    )) || null;
  }

  function getFallbackProduct() {
    return getProductById("appl-0017") || (window.PRODUCTS_DB || [])[0] || null;
  }

  function getDiscountPercent(product) {
    if (!product.oldPrice || Number(product.oldPrice) <= Number(product.price)) return 0;
    return Math.round(((Number(product.oldPrice) - Number(product.price)) / Number(product.oldPrice)) * 100);
  }

  function getSavingAmount(product) {
    if (!product.oldPrice || Number(product.oldPrice) <= Number(product.price)) return 0;
    return Number(product.oldPrice) - Number(product.price);
  }

  function normalizeMediaUrl(url) {
    if (!url) return '/assets/placeholder.svg';
    let clean = String(url).trim().replace(/\\/g, '/');
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('data:') || clean.startsWith('blob:')) {
      return clean;
    }
    if (!clean.startsWith('/')) clean = '/' + clean;
    return clean;
  }
  window.normalizeProductImageUrl = normalizeMediaUrl;

  function buildMedia(product) {
    const gallery = Array.isArray(product.gallery) ? product.gallery.filter(Boolean) : [];
    if (gallery.length === 0 && product.main_image) gallery.push(product.main_image);
    if (gallery.length === 0 && product.image) gallery.push(product.image);
    
    const items = gallery.map((src) => ({ type: "image", src: normalizeMediaUrl(src) }));
    if (product.video && (/\.(mp4|webm|mov|ogg)$/i.test(product.video) || product.video.includes('/uploads/videos/'))) {
      items.push({ type: "video", src: normalizeMediaUrl(product.video) });
    }
    return items.length ? items : [{ type: "image", src: "/assets/placeholder.svg" }];
  }

  function showToast(message, type = 'success') {
    if (window.ZFB && window.ZFB.Notification) {
      window.ZFB.Notification.show(message, type);
      return;
    }
    let toast = document.querySelector(".zfb-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "zfb-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  async function addToCart(product, redirectToCheckout) {
    const qtyInput = qs("product-qty-input");
    const qty = Math.max(1, parseInt(qtyInput?.value || "1", 10));
    
    const addBtn = qs("add-to-cart-btn");
    const stickyAddBtn = qs("product-sticky-add-btn");
    
    [addBtn, stickyAddBtn].filter(Boolean).forEach(btn => {
      btn.classList.add("is-loading");
      btn.disabled = true;
    });

    const activeColor = selectedColor || (product.colors && (product.colors[0]?.name || product.colors[0])) || null;

    // The photo that goes into the order is the one for the colour the
    // customer actually picked -- not the product's default image -- so the
    // order shows what they chose. Falls back to the gallery's current frame
    // when the colour has no photo of its own.
    const colorImage = (function () {
      const map = product && product.colorImages;
      if (!map || !activeColor) return null;
      const hit = map[activeColor];
      return Array.isArray(hit) ? hit[0] : hit || null;
    })();
    const activeImage = colorImage
      || (currentMedia && currentMedia[0] && currentMedia[0].src)
      || product.image || product.main_image || '/assets/placeholder.svg';

    // A size sets the price outright. activePrice is written whenever a size
    // chip is clicked; with no sizes it is undefined and the base price stands.
    const activePrice = Number.isFinite(Number(product.activePrice))
      ? Number(product.activePrice)
      : Number(product.price);

    const itemPayload = {
      ...product,
      price: activePrice,
      selected_color: activeColor,
      selectedColor: activeColor,
      color: activeColor,
      selected_size: selectedSize || null,
      selectedSize: selectedSize || null,
      selected_size_price: selectedSize ? activePrice : null,
      image: activeImage,
      image_url: activeImage
    };

    try {
      if (window.ZFB && window.ZFB.Cart) {
        await window.ZFB.Cart.add(itemPayload, qty);
      } else {
        const guestId = localStorage.getItem('zfb.guest_id') || 'guest_' + Date.now();
        await fetch('/api/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-guest-id': guestId },
          body: JSON.stringify({ 
            productId: product.product_id || product.id, 
            quantity: qty,
            selected_color: activeColor,
            image_url: activeImage
          })
        });
      }

      // Visual success confirmation on buttons
      [addBtn, stickyAddBtn].filter(Boolean).forEach(btn => {
        btn.classList.remove("is-loading");
        btn.disabled = false;
        btn.classList.add("is-added");
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ تمت الإضافة';
        setTimeout(() => {
          btn.classList.remove("is-added");
          btn.innerHTML = originalText;
        }, 2000);
      });

      // Update badge counts globally
      document.querySelectorAll("#floating-cart-count, .cart b, .zfb-mobile-cart-count, .cart-badge-count").forEach((b) => {
        const cur = parseInt(b.textContent || "0", 10);
        b.textContent = cur + qty;
        b.style.display = "inline-block";
        b.hidden = false;
      });

      showToast(`تمت إضافة (${qty}) من "${product.title}" إلى سلة التسوق`);

      if (redirectToCheckout) {
        window.location.href = "checkout.html";
      }
    } catch (err) {
      console.error("Add to cart error:", err);
      [addBtn, stickyAddBtn].filter(Boolean).forEach(btn => {
        btn.classList.remove("is-loading");
        btn.disabled = false;
      });
      showToast("تعذر إضافة المنتج إلى السلة حالياً", "error");
    }
  }

  function renderBreadcrumb(product) {
    const code = getCategoryCode(product);
    const label = getCategoryLabel(code);
    const link = getCategoryLink(code);
    const catLink = qs("breadcrumb-category-link");
    if (catLink) {
      catLink.textContent = label;
      catLink.href = link;
    }
    const titleEl = qs("breadcrumb-title");
    if (titleEl) titleEl.textContent = product.title;
    const miniBread = qs("product-summary-breadcrumb-mini");
    if (miniBread) miniBread.textContent = `الرئيسية / ${label}`;
  }

  function renderSummary(product) {
    // Match the title the server already rendered into the HTML, so the
    // browser tab and the search result read the same. The server format is
    // "name | brand | زياد ستور"; rewriting it differently here made the
    // two disagree for no reason.
    document.title = [product.title, product.brand, 'زياد ستور']
      .filter(Boolean).join(' | ');
    const titleEl = qs("product-title");
    if (titleEl) titleEl.textContent = product.title;

    const brand = product.brand || "زياد ستور";
    const brandEl = qs("product-brand");
    if (brandEl) brandEl.textContent = brand;
    const brandInl = qs("product-brand-inline");
    if (brandInl) brandInl.innerHTML = `العلامة: <strong>${brand}</strong>`;

    const skuEl = qs("product-sku");
    if (skuEl) skuEl.textContent = product.sku || product.product_id || product.id || "—";

    const originEl = qs("product-origin");
    if (originEl) originEl.textContent = product.origin || "مستورد أصلي";

    const warrantyEl = qs("product-warranty");
    if (warrantyEl) warrantyEl.textContent = product.warranty || "ضمان الوكيل المعتمد";

    const ratingVal = qs("product-rating-value");
    if (ratingVal) ratingVal.textContent = product.rating || "4.8";

    const revCount = qs("product-reviews-count");
    if (revCount) revCount.textContent = `(${Number(product.reviewsCount || product.reviews_count || 18).toLocaleString("ar-SA")})`;

    const curPriceEl = qs("product-current-price");
    if (curPriceEl) curPriceEl.textContent = formatPrice(product.price);

    const oldPriceEl = qs("product-old-price");
    const savingEl = qs("product-saving");
    const discountBadge = qs("product-discount-badge");
    const discount = getDiscountPercent(product);
    const savingAmount = getSavingAmount(product);

    if (discount > 0) {
      if (oldPriceEl) {
        oldPriceEl.textContent = formatPrice(product.oldPrice);
        oldPriceEl.hidden = false;
      }
      if (savingEl) {
        savingEl.textContent = `وفر ${formatPrice(savingAmount)}`;
        savingEl.hidden = false;
      }
      if (discountBadge) {
        discountBadge.textContent = `-${discount}%`;
        discountBadge.hidden = false;
      }
    } else {
      if (oldPriceEl) oldPriceEl.hidden = true;
      if (savingEl) savingEl.hidden = true;
      if (discountBadge) discountBadge.hidden = true;
    }

    const statusRow = qs("product-status-badges");
    if (statusRow) {
      const badges = [];
      if (product.isNew || product.is_new) badges.push('<span class="product-badge status">جديد</span>');
      if (product.isBestSeller || product.is_best_seller) badges.push('<span class="product-badge status">الأكثر مبيعاً</span>');
      statusRow.innerHTML = badges.join("");
    }

    const stockNote = qs("product-stock-note");
    if (stockNote) {
      stockNote.innerHTML = '<strong>متوفر في المخزون</strong> · جاهز للشحن الفوري';
    }

  /**
   * What to tell the customer about shipping.
   *
   * 394 of 403 products carry "مجاني للمدن الرئيسية" in their shipping column.
   * It is a seeded string, not a policy: the delivery_policies table charges
   * between 7 and 214 SAR depending on category and zone, and the only free
   * option in it is collecting the order from the showroom in person. Until
   * this session there was no field in the admin to change it either, so the
   * shop was promising free delivery that its own pricing contradicts.
   *
   * A value an operator actually typed is shown as typed -- that is their
   * decision to make. The known seeded strings are treated as unset, and the
   * page falls back to the neutral line the static HTML already carried rather
   * than asserting a price the product does not know.
   */
  const SEEDED_SHIPPING = [
    "مجاني للمدن الرئيسية",
    "شحن فوري سريع ومجاني"
  ];

  /*
   * A free-text product field that was saved while the admin form had a
   * duplicated input arrives as a PostgreSQL array literal -- {"2","2"} -- and
   * was printed to customers exactly like that. The form no longer produces
   * these, but rows written before the fix are still in the database, and a
   * customer must never be shown one. Unwrap it to its first real value.
   */
  function cleanText(value) {
    const raw = String(value == null ? "" : value).trim();
    const m = /^\{(.*)\}$/.exec(raw);
    if (!m) return raw;
    const first = m[1]
      .split(",")
      .map((part) => part.trim().replace(/^"(.*)"$/, "$1").trim())
      .find(Boolean);
    return first || "";
  }

  function shippingLine(product) {
    const own = String(product.shipping || "").trim();
    if (own && !SEEDED_SHIPPING.includes(own)) return own;
    return "توصيل حسب المنطقة والفئة";
  }

    const shipTrust = qs("trust-shipping");
    if (shipTrust) shipTrust.innerHTML = `${shippingLine(product)}<br><small>${cleanText(product.deliveryTime) || "24 إلى 48 ساعة"}</small>`;

    const warTrust = qs("trust-warranty");
    if (warTrust) warTrust.innerHTML = `${product.warranty || "ضمان موثق"}<br><small>استبدال وصيانة</small>`;
  }

  /**
   * Give the gallery frame the shape of the photograph in it.
   *
   * The frame was a fixed square with the photo CONTAINed inside and a blurred
   * copy of itself behind, to fill whatever space containment left over. That
   * is right for a wide room shot in a square frame -- and wrong for a square
   * photograph, which leaves no space at all: the backdrop then had nothing to
   * fill and simply sat behind the picture at 50% opacity, greying it, while a
   * 10px pad kept the photo from ever reaching the frame's edge.
   *
   * Sized to the image, the photo fills the frame exactly, so the backdrop is
   * not needed and is switched off (.zs-exact). It stays on only when the ratio
   * had to be clamped -- a panorama or a very tall shot -- which is the one case
   * where there really is leftover space to fill.
   */
  var STAGE_MIN_RATIO = 0.75;   // 3:4
  var STAGE_MAX_RATIO = 1.78;   // 16:9

  function fitStageToImage(stage, src) {
    if (!stage || !src) return;
    var probe = new Image();
    probe.decoding = "async";
    probe.onload = function () {
      var w = probe.naturalWidth, h = probe.naturalHeight;
      if (!w || !h) return;
      var r = w / h;
      var clamped = Math.min(STAGE_MAX_RATIO, Math.max(STAGE_MIN_RATIO, r));
      stage.style.setProperty("--zs-stage-ratio", clamped.toFixed(4));
      // Within a hair of the frame's shape there is nothing left to fill.
      stage.classList.toggle("zs-exact", Math.abs(clamped - r) < 0.02);
    };
    probe.src = src;
  }

  function renderGalleryStage(index) {
    currentMediaIndex = index;
    const stage = qs("product-gallery-stage");
    const item = currentMedia[index];
    if (!item || !stage) return;

    /* The photograph is shown whole (object-fit: contain) so nothing is cropped
       off a sofa or a wardrobe. The space that leaves inside the square stage is
       filled with a blurred copy of the same photograph, so the frame reads as a
       deliberate mount instead of an empty box. See storefront-2026.css. */
    if (item.type === "image" || !item.type) {
      stage.style.setProperty("--card-img", `url("${String(item.src).replace(/"/g, '\\"')}")`);
      fitStageToImage(stage, item.src);
    } else {
      stage.style.removeProperty("--card-img");
      stage.classList.remove("zs-exact");
    }

    if (item.type === "video") {
      stage.innerHTML = `<video controls playsinline webkit-playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain;background:#000;border-radius:inherit;"><source src="${item.src}">متصفحك لا يدعم تشغيل الفيديو</video>`;
    } else {
      // The gallery image is the largest thing on the page and, for a visitor
      // arriving from an ad, the whole reason they clicked. It is the LCP
      // element, so it must not be lazy and should be fetched ahead of the
      // page's other images. decoding="async" keeps the decode off the main
      // thread so it never blocks the first paint.
      const isFirst = index === 0;
      stage.innerHTML = `<img src="${item.src}" alt="${escHtml(currentProduct.title)}" ` +
        `loading="eager" decoding="async"${isFirst ? ' fetchpriority="high"' : ''} ` +
        `style="width:100%;height:100%;object-fit:contain;transition:transform 0.25s ease;" />`;
    }

    document.querySelectorAll(".product-thumb").forEach((thumb, thumbIndex) => {
      thumb.classList.toggle("is-active", thumbIndex === index);
    });
  }

  function renderGallery(product) {
    currentMedia = buildMedia(product);
    const track = qs("product-thumbs-track");
    if (track) {
      track.innerHTML = currentMedia
        .map((item, index) => {
          const isVideo = item.type === "video";
          const thumbSrc = isVideo ? (product.gallery && product.gallery[0]) || "/assets/placeholder.svg" : item.src;
          return `
            <button class="product-thumb ${index === 0 ? "is-active" : ""} ${isVideo ? "is-video" : ""}" type="button" data-media-index="${index}" aria-label="${isVideo ? "فيديو المنتج" : `صورة ${index + 1}`}">
              <img src="${thumbSrc}" alt="${escHtml(product.title)}" />
            </button>
          `;
        })
        .join("");

      track.querySelectorAll(".product-thumb").forEach((thumb) => {
        thumb.addEventListener("click", () => renderGalleryStage(Number(thumb.dataset.mediaIndex)));
      });
    }

    /* A single photograph needs no thumbnail strip and no arrows to scroll it. */
    const thumbsWrap = document.querySelector(".product-gallery-thumbs-wrap");
    if (thumbsWrap) thumbsWrap.hidden = currentMedia.length < 2;

    renderGalleryStage(0);

    // Touch Swipe Support on Main Gallery Stage
    const stage = qs("product-gallery-stage");
    if (stage) {
      let touchStartX = 0;
      let touchEndX = 0;

      stage.addEventListener("touchstart", (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      stage.addEventListener("touchend", (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 45 && currentMedia.length > 1) {
          if (diff > 0) {
            // Next image
            const nextIdx = (currentMediaIndex + 1) % currentMedia.length;
            renderGalleryStage(nextIdx);
          } else {
            // Prev image
            const prevIdx = (currentMediaIndex - 1 + currentMedia.length) % currentMedia.length;
            renderGalleryStage(prevIdx);
          }
        }
      }, { passive: true });
    }
  }

  const COLOR_HEX_MAP = {
    'أبيض': '#FFFFFF',
    'أسود': '#1A1A1A',
    'رمادي': '#808080',
    'فضي': '#C0C0C0',
    'ذهبي': '#D4AF37',
    'خشبي': '#8D6E63',
    'بيج': '#D2B48C',
    'بني': '#5D4037',
    'كحلي': '#0D2B45',
    'أزرق': '#1976D2',
    'أخضر': '#2E7D32',
    'أحمر': '#C62828'
  };

  function normalizeProductColors(raw) {
    if (!raw) return [];
    let list = [];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
        else list = raw.split(/[,،]+/).map(c => c.trim()).filter(Boolean);
      } catch (_) {
        list = raw.split(/[,،]+/).map(c => c.trim()).filter(Boolean);
      }
    } else if (Array.isArray(raw)) {
      list = raw;
    }
    return list.map(item => {
      if (typeof item === 'object' && item !== null) {
        return { name: item.name || '', hex: item.hex || COLOR_HEX_MAP[item.name] || '#808080' };
      }
      const name = String(item).trim();
      return { name, hex: COLOR_HEX_MAP[name] || '#808080' };
    }).filter(c => c.name);
  }

  function renderOptions(product) {
    /**
     * Swap the gallery to the photo tagged with this colour. A colour with no
     * photo of its own leaves the gallery alone rather than blanking it.
     */
    function showColorImage(prod, colorName) {
      const map = prod && prod.colorImages;
      if (!map || !colorName) return;
      const list = map[colorName];
      const src = Array.isArray(list) ? list[0] : list;
      if (!src) return;
      const stage = qs("product-gallery-stage");
      const img = stage && stage.querySelector("img");
      if (img) img.src = src;
      const main = qs("product-main-image");
      if (main && main.tagName === "IMG") main.src = src;
    }

    /**
     * Each size carries its full price, so choosing one sets the price
     * outright. An empty price means the size does not alter it.
     */
    function applySizePrice(prod, rawPrice) {
      const price = Number(rawPrice);
      if (!rawPrice || !Number.isFinite(price)) return;
      prod.activePrice = price;
      const cur = qs("product-current-price");
      if (cur) cur.textContent = formatPrice(price);
      const sticky = qs("sticky-price");
      if (sticky) sticky.textContent = formatPrice(price);
    }

    const colorsGroup = qs("product-colors-group");
    const colorsWrap = qs("product-colors");
    const selectedColorName = qs("selected-color-name");
    const sizesGroup = qs("product-sizes-group");
    const sizesWrap = qs("product-sizes");
    const selectedSizeName = qs("selected-size-name");

    const colors = normalizeProductColors(product.colors);
    // Sizes now arrive as { label, price } so each one can carry its own
    // price. Plain strings are still accepted, in which case the size does not
    // change the price -- that was the old shape and some data may still use it.
    const sizes = (Array.isArray(product.sizes) ? product.sizes : [])
      .filter(Boolean)
      .map((s) => (typeof s === "string" ? { label: s, price: null } : { label: s.label, price: s.price }))
      .filter((s) => s.label);

    if (colorsGroup && colorsWrap) {
      if (colors.length) {
        selectedColor = colors[0].name;
        colorsGroup.hidden = false;
        if (selectedColorName) selectedColorName.textContent = selectedColor;
        colorsWrap.innerHTML = colors
          .map(
            (color, index) => `
              <button
                class="product-color-swatch ${index === 0 ? "is-active" : ""}"
                type="button"
                data-color-name="${color.name}"
                style="background:${color.hex}; ${color.hex.toLowerCase() === '#ffffff' ? 'border: 1px solid #ccc;' : ''}"
                aria-label="${escHtml(color.name)}">
              </button>`
          )
          .join("");

        colorsWrap.querySelectorAll(".product-color-swatch").forEach((btn) => {
          btn.addEventListener("click", () => {
            selectedColor = btn.dataset.colorName;
            if (selectedColorName) selectedColorName.textContent = selectedColor;
            colorsWrap.querySelectorAll(".product-color-swatch").forEach((item) => item.classList.remove("is-active"));
            btn.classList.add("is-active");
            showColorImage(product, selectedColor);
          });
        });

        // Show the first colour's own photo straight away, if it has one.
        showColorImage(product, selectedColor);
      } else {
        colorsGroup.hidden = true;
      }
    }

    if (sizesGroup && sizesWrap) {
      if (sizes.length) {
        selectedSize = sizes[0].label;
        sizesGroup.hidden = false;
        if (selectedSizeName) selectedSizeName.textContent = selectedSize;
        sizesWrap.innerHTML = sizes
          .map(
            (size, index) => `
              <button class="product-size-chip ${index === 0 ? "is-active" : ""}" type="button" data-size-name="${size.label}" data-size-price="${size.price == null ? "" : size.price}"><span class="size-chip-label">${size.label}</span>${size.price != null ? `<span class="size-chip-price">${formatPrice(size.price)}</span>` : ""}</button>
            `
          )
          .join("");

        sizesWrap.querySelectorAll(".product-size-chip").forEach((btn) => {
          btn.addEventListener("click", () => {
            selectedSize = btn.dataset.sizeName;
            if (selectedSizeName) selectedSizeName.textContent = selectedSize;
            sizesWrap.querySelectorAll(".product-size-chip").forEach((item) => item.classList.remove("is-active"));
            btn.classList.add("is-active");
            applySizePrice(product, btn.dataset.sizePrice);
          });
        });

        // The first size is selected on load, so the page must open showing
        // that size's price rather than the product's base price.
        applySizePrice(product, sizes[0].price == null ? "" : sizes[0].price);
      } else {
        sizesGroup.hidden = true;
      }
    }
  }

  function renderQuickSpecs(product) {
    const quickSpecs = qs("product-quick-specs");
    if (!quickSpecs) return;
    const specs = Array.isArray(product.specs) ? product.specs.slice(0, 6) : [];
    quickSpecs.innerHTML = specs
      .map(
        (spec) => `
          <div class="product-quick-meta">
            <dt>${spec.label}</dt>
            <dd>${spec.value}</dd>
          </div>
        `
      )
      .join("");
  }

  function renderTabs(product) {
    const descEl = qs("product-description");
    if (descEl) {
      /* The description is written in the admin's rich-text editor and is meant
         to carry markup. Escaping it printed the operator's tags on the page as
         literal text -- "<h3>...<br>" in front of the customer. It is cleaned
         instead, so the formatting survives and script cannot. */
      const clean = sanitizeRichText(product.description);
      descEl.innerHTML = clean ||
        "<p>أثاث وأجهزة عالية الجودة من متجر زياد ستور، مصنعة وفق أرقى المعايير العالمية مع ضمان موثق.</p>";
    }

    const specsTable = qs("product-specs-table");
    if (specsTable) {
      const specs = Array.isArray(product.specs) ? product.specs : [];
      specsTable.innerHTML = specs
        .map(
          (spec) => `
            <div class="product-spec-row">
              <dt>${spec.label}</dt>
              <dd>${spec.value}</dd>
            </div>
          `
        )
        .join("");
    }

    const revPlace = qs("product-reviews-placeholder");
    if (revPlace) {
      revPlace.innerHTML = `
        <p>تقييم المنتج <strong>${product.rating || "4.8"}</strong> من أصل 5 بناءً على <strong>${Number(product.reviewsCount || 18).toLocaleString("ar-SA")}</strong> تقييم عملاء موثق.</p>
        <p>جميع التقييمات من مشترين حقيقيين داخل اليمن والمملكة العربية السعودية.</p>
      `;
    }

    const faqList = qs("product-faq-list");
    if (faqList) {
      const faq = Array.isArray(product.faq) && product.faq.length ? product.faq : [
        { q: "ما هي مدة الضمان على هذا المنتج؟", a: "يخضع المنتج لضمان شامل وموثق من متجر زياد ستور لمدة عام على الأقل مع توفير قطع الغيار الأصلية." },
        { q: "كيف يتم التوصيل والتركيب في صنعاء والمدن الأخرى؟", a: "نوفر التوصيل بأسعار رمزية داخل المدن الرئيسية والمحافظات خلال 24 إلى 48 ساعة مع خدمة تركيب حسب المنتج من تأكيد الطلب." },
        { q: "ما هي طرق الدفع المتاحة؟", a: "يمكنك الدفع نقداً عند الاستلام، أو عبر بنك الكريمي، محفظة جوالي، كاش، أو التحويل البنكي المباشر." }
      ];

      faqList.innerHTML = faq
        .map(
          (item) => `
            <details class="product-faq-item">
              <summary>${item.q}</summary>
              <p>${item.a}</p>
            </details>
          `
        )
        .join("");
    }

    document.querySelectorAll(".product-tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.tabTarget;
        document.querySelectorAll(".product-tab-btn").forEach((btn) => {
          btn.classList.remove("is-active");
          btn.setAttribute("aria-selected", "false");
        });
        document.querySelectorAll(".product-tab-panel").forEach((panel) => {
          panel.hidden = panel.id !== target;
        });
        button.classList.add("is-active");
        button.setAttribute("aria-selected", "true");
      });
    });
  }

  function createMiniCard(product) {
    const discount = getDiscountPercent(product);
    const pid = product.product_id || product.id;
    const img = (product.gallery && product.gallery[0]) || product.main_image || product.image || "/assets/placeholder.svg";
    return `
      <article class="product-mini-card">
        <a class="product-mini-card-media" href="product.html?id=${encodeURIComponent(pid)}" aria-label="${escHtml(product.title)}">
          ${discount > 0 ? `<span class="product-mini-card-badge">-${discount}%</span>` : ""}
          <img src="${window.ZFB ? window.ZFB.normalizeImagePath(img) : (img.startsWith('/') ? img : '/' + img)}" alt="${escHtml(product.title)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/placeholder.svg';" />
        </a>
        <div class="product-mini-card-body">
          <div class="product-mini-card-meta">${escHtml(product.brand || "زياد ستور")}</div>
          <h3 class="product-mini-card-title"><a href="product.html?id=${encodeURIComponent(pid)}">${escHtml(product.title)}</a></h3>
          <div class="product-mini-card-price">
            <strong>${formatPrice(product.price)}</strong>
            ${discount > 0 ? `<del>${formatPrice(product.oldPrice || product.old_price)}</del>` : ""}
          </div>
          <div class="product-mini-card-foot">
            <span class="product-mini-card-rating">★ ${product.rating || "4.8"}</span>
            <button class="product-mini-card-add" type="button" data-mini-add="${pid}">أضف</button>
          </div>
        </div>
      </article>
    `;
  }

  function getRelatedProducts(product) {
    const db = window.PRODUCTS_DB || [];
    const category = getCategoryCode(product);
    const sameCategory = db.filter((item) => item.id !== product.id && getCategoryCode(item) === category).slice(0, 10);
    const similar = db.filter((item) => item.id !== product.id && item.brand === product.brand).slice(0, 10);
    const mayLike = db.filter((item) => item.id !== product.id && (item.isBestSeller || item.isNew || item.is_best_seller)).slice(0, 10);
    return { sameCategory, similar, mayLike };
  }

  function renderCarousels(product) {
    const related = getRelatedProducts(product);
    const catTrack = qs("same-category-track");
    if (catTrack) catTrack.innerHTML = related.sameCategory.map(createMiniCard).join("");
    const simTrack = qs("similar-products-track");
    if (simTrack) simTrack.innerHTML = related.similar.map(createMiniCard).join("");
    const mayTrack = qs("you-may-like-track");
    if (mayTrack) mayTrack.innerHTML = related.mayLike.map(createMiniCard).join("");

    document.querySelectorAll("[data-mini-add]").forEach((button) => {
      button.addEventListener("click", () => {
        const targetProduct = getProductById(button.dataset.miniAdd);
        if (targetProduct) addToCart(targetProduct, false);
      });
    });

    document.querySelectorAll("[data-carousel-prev], [data-carousel-next]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.carouselPrev || button.dataset.carouselNext;
        const track = qs(`${key}-track`);
        if (!track) return;
        const amount = 240;
        track.scrollBy({ left: button.dataset.carouselPrev ? -amount : amount, behavior: "smooth" });
      });
    });
  }

  function bindQuantity() {
    const input = qs("product-qty-input");
    const stickyVal = qs("sticky-qty-val");

    function setQty(val) {
      const next = Math.max(1, Math.min(99, val));
      if (input) input.value = next;
      if (stickyVal) stickyVal.textContent = next;
    }

    const incBtn = qs("qty-increase-btn");
    if (incBtn) incBtn.addEventListener("click", () => setQty((parseInt(input?.value || "1", 10) || 1) + 1));
    const decBtn = qs("qty-decrease-btn");
    if (decBtn) decBtn.addEventListener("click", () => setQty((parseInt(input?.value || "1", 10) || 1) - 1));

    const stickyPlus = qs("sticky-qty-plus");
    if (stickyPlus) stickyPlus.addEventListener("click", () => setQty((parseInt(input?.value || "1", 10) || 1) + 1));
    const stickyMinus = qs("sticky-qty-minus");
    if (stickyMinus) stickyMinus.addEventListener("click", () => setQty((parseInt(input?.value || "1", 10) || 1) - 1));
  }

  function openLightbox() {
    const item = currentMedia[currentMediaIndex];
    if (!item) return;
    const lightbox = document.createElement("div");
    lightbox.className = "product-lightbox";
    lightbox.innerHTML = `
      <div class="product-lightbox-dialog">
        <button class="product-lightbox-close" type="button" aria-label="إغلاق">×</button>
        ${item.type === "video" ? `<video controls autoplay playsinline><source src="${item.src}"></video>` : `<img src="${item.src}" alt="${currentProduct.title}" />`}
      </div>
    `;
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox || event.target.classList.contains("product-lightbox-close")) {
        lightbox.remove();
      }
    });
    document.body.appendChild(lightbox);
  }

  function bindStickyBar(product) {
    const stickyBar = qs("product-sticky-bar");
    if (!stickyBar) return;

    const stickyThumb = qs("product-sticky-thumb");
    if (stickyThumb) {
      stickyThumb.src = (currentMedia[0] && currentMedia[0].src) || "/assets/placeholder.svg";
      stickyThumb.alt = product.title;
      stickyThumb.onerror = function() { this.onerror = null; this.src = '/assets/placeholder.svg'; };
    }

    const stickyTitle = qs("product-sticky-title");
    if (stickyTitle) stickyTitle.textContent = product.title;

    const stickyPrice = qs("product-sticky-price");
    if (stickyPrice) stickyPrice.textContent = formatPrice(product.price);

    const stickyAdd = qs("product-sticky-add-btn");
    if (stickyAdd) stickyAdd.addEventListener("click", () => addToCart(product, false));

    const stickyBuy = qs("product-sticky-buy-btn");
    if (stickyBuy) stickyBuy.addEventListener("click", () => addToCart(product, true));

    // Observe scroll position to show/hide sticky bar on mobile
    const purchaseRow = document.querySelector(".product-purchase-row");
    if (purchaseRow && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          // If the main purchase block is NOT visible and user has scrolled past it
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            stickyBar.classList.add("is-visible");
          } else {
            stickyBar.classList.remove("is-visible");
          }
        });
      }, { threshold: 0.1 });
      observer.observe(purchaseRow);
    }
  }

  function bindActions(product) {
    const addBtn = qs("add-to-cart-btn");
    if (addBtn) addBtn.addEventListener("click", () => addToCart(product, false));

    const buyBtn = qs("buy-now-btn");
    if (buyBtn) buyBtn.addEventListener("click", () => addToCart(product, true));

    const wishlistButtons = [qs("wishlist-btn"), qs("gallery-favorite-btn")].filter(Boolean);
    if (window.ZFB && window.ZFB.Wishlist && window.ZFB.Wishlist.has(product.id || product.product_id)) {
      wishlistButtons.forEach((btn) => btn.classList.add("is-active"));
    }
    wishlistButtons.forEach((button) => {
      button.addEventListener("click", () => {
        let added = false;
        if (window.ZFB && window.ZFB.Wishlist) {
          added = window.ZFB.Wishlist.toggle(product);
        }
        wishlistButtons.forEach((btn) => btn.classList.toggle("is-active", added));
        showToast(added ? "تمت إضافة المنتج للمفضلة" : "تمت إزالة المنتج من المفضلة");
      });
    });

    const compareButtons = [qs("compare-btn"), qs("gallery-compare-btn")].filter(Boolean);
    if (window.ZFB && window.ZFB.Compare && window.ZFB.Compare.has(product.id || product.product_id)) {
      compareButtons.forEach((btn) => btn.classList.add("is-active"));
    }
    compareButtons.forEach((button) => {
      button.addEventListener("click", () => {
        let added = false;
        if (window.ZFB && window.ZFB.Compare) {
          added = window.ZFB.Compare.toggle(product);
        }
        compareButtons.forEach((btn) => btn.classList.toggle("is-active", added !== false));
        if (added !== false) {
          showToast(added ? "تمت الإضافة للمقارنة" : "تمت الإزالة من المقارنة");
        }
      });
    });

    [qs("share-btn"), qs("gallery-share-btn")].filter(Boolean).forEach((button) => {
      button.addEventListener("click", async () => {
        const url = window.location.href;
        if (navigator.share) {
          try {
            await navigator.share({ title: product.title, url });
          } catch (_) {}
        } else if (navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(url);
            showToast("تم نسخ رابط المنتج بنجاح");
          } catch (_) {
            showToast("تعذر نسخ الرابط حالياً", "error");
          }
        }
      });
    });

    const zoomBtn = qs("gallery-zoom-btn");
    if (zoomBtn) zoomBtn.addEventListener("click", openLightbox);

    const prevThumb = qs("thumbs-prev-btn");
    if (prevThumb) prevThumb.addEventListener("click", () => qs("product-thumbs-track")?.scrollBy({ left: -120, behavior: "smooth" }));

    const nextThumb = qs("thumbs-next-btn");
    if (nextThumb) nextThumb.addEventListener("click", () => qs("product-thumbs-track")?.scrollBy({ left: 120, behavior: "smooth" }));

    bindStickyBar(product);
  }

  function renderProduct(product) {
    currentProduct = product;
    renderBreadcrumb(product);
    renderSummary(product);
    renderGallery(product);
    renderOptions(product);
    renderQuickSpecs(product);
    renderTabs(product);
    renderCarousels(product);
    bindQuantity();
    bindActions(product);
  }

  /** { "أزرق": ["/uploads/a.webp", ...] } from the API's image list. */
  function buildColorImages(images) {
    const map = {};
    for (const img of Array.isArray(images) ? images : []) {
      const key = String((img && img.color_name) || "").trim();
      if (!key) continue;
      const src = img.image_path || img.url;
      if (!src) continue;
      (map[key] || (map[key] = [])).push(src);
    }
    return map;
  }

  async function init() {
    // ------------------------------------------------------------------
    // Only run on the product detail page.
    //
    // index.html loads this script too, and with no ?id= in the URL init()
    // fell through to getFallbackProduct() -- a hardcoded "appl-0017" -- and
    // rendered it. The visible symptom was the home page's browser tab reading
    // "ثلاجة 18 قدم | شارپ | زياد ستور": renderSummary() sets document.title,
    // so the storefront's front door announced itself as a random fridge, over
    // the correct title the server had just rendered.
    //
    // #product-page is the detail page's own container and exists in
    // product.html and nowhere else, which makes it the honest test for "is
    // this a product page" -- rather than guessing from the URL.
    // ------------------------------------------------------------------
    if (!qs("product-page")) return;

    const productId = getProductIdFromUrl();
    let product = null;

    // 1. Always fetch live product data from /api/products/:id first
    if (productId) {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.product || data.data)) {
            const raw = data.product || data.data;
            const gallery = (raw.images && raw.images.length > 0) 
              ? raw.images.map(i => i.image_path || i.url) 
              : (raw.main_image ? [raw.main_image] : ['/assets/placeholder.svg']);

            product = {
              id: raw.product_id || raw.id,
              product_id: raw.product_id || raw.id,
              title: raw.title,
              price: raw.price,
              oldPrice: raw.old_price,
              rating: String(raw.rating || '4.8'),
              reviewsCount: raw.reviews_count || 18,
              brand: raw.brand || '',
              origin: raw.origin || '',
              sku: raw.sku || raw.product_id,
              warranty: raw.warranty || '',
              shipping: raw.shipping || '',
              deliveryTime: raw.delivery_time || '',
              installation: installationText(raw.installation),
              weight: raw.weight || '',
              image: gallery[0],
              main_image: gallery[0],
              gallery: gallery,
              video: raw.video || '',
              colors: raw.colors || [],
              /* This was hardcoded to []. Every size an operator entered in the
                 admin was loaded, sent by the API and then discarded here, one
                 line before it would have been rendered. */
              sizes: Array.isArray(raw.sizes) ? raw.sizes : [],
              /* Images tagged with a colour, so picking a colour swaps the
                 photograph. Built server-side; the fallback keeps working with
                 an older API response that does not carry it. */
              colorImages: raw.colorImages || buildColorImages(raw.images),
              isNew: raw.is_new === 1,
              isBestSeller: raw.is_best_seller === 1,
              description: raw.description || '',
              specs: raw.specs || [],
              faq: raw.faq || []
            };
          }
        }
      } catch (e) {
        console.warn("Live API fetch failed, falling back to local cache:", e);
      }
    }

    // 2. Fallback to local PRODUCTS_DB if offline or API returned null
    if (!product && productId) {
      product = getProductById(productId);
    }

    if (!product) {
      product = getFallbackProduct();
    }

    if (!product) {
      const loadingEl = qs("product-loading");
      if (loadingEl) loadingEl.innerHTML = "<div style='text-align:center; padding: 40px; color: var(--error)'>المنتج غير موجود أو لم يعد متاحاً.</div>";
      return;
    }

    try {
      renderProduct(product);
    } catch (e) {
      console.error("Error rendering product:", e);
    } finally {
      const loadingEl = qs("product-loading");
      if (loadingEl) loadingEl.style.display = 'none';
      const pageEl = qs("product-page");
      if (pageEl) pageEl.hidden = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("zfb-db-loaded", () => {
    if (!currentProduct) init();
  });
  window.addEventListener("zfb-currency-change", () => {
    if (currentProduct) {
      try { renderProduct(currentProduct); } catch (_) {}
    }
  });
})();