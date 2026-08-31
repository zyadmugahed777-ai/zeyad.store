// Universal Wishlist Manager - Canonical Storage Key: zfb.wishlist
(function() {
  const CANONICAL_KEY = 'zfb.wishlist';
  const LEGACY_KEY = 'zfb_wishlist';

  function getWishlistIds() {
    let items = [];
    try {
      // 1. Read canonical key
      const rawCanonical = localStorage.getItem(CANONICAL_KEY);
      if (rawCanonical) {
        const parsed = JSON.parse(rawCanonical);
        if (Array.isArray(parsed)) {
          items = parsed.map(item => typeof item === 'string' ? item : item.id || item.productId).filter(Boolean);
        }
      }

      // 2. Migrate legacy key if present
      const rawLegacy = localStorage.getItem(LEGACY_KEY);
      if (rawLegacy) {
        const legacyParsed = JSON.parse(rawLegacy);
        if (Array.isArray(legacyParsed)) {
          legacyParsed.forEach(legId => {
            const cleanId = typeof legId === 'string' ? legId : legId.id || legId.productId;
            if (cleanId && !items.includes(cleanId)) {
              items.push(cleanId);
            }
          });
        }
        localStorage.removeItem(LEGACY_KEY);
        localStorage.setItem(CANONICAL_KEY, JSON.stringify(items));
      }
    } catch (e) {
      console.warn('Error reading wishlist from localStorage:', e);
      items = [];
    }
    return items;
  }

  function setWishlistIds(list) {
    const cleanList = Array.from(new Set((list || []).map(item => typeof item === 'string' ? item : item.id || item.productId).filter(Boolean)));
    localStorage.setItem(CANONICAL_KEY, JSON.stringify(cleanList));
    // Keep legacy key synced as fallback for older scripts during transition
    localStorage.setItem(LEGACY_KEY, JSON.stringify(cleanList));
    updateBadges();
    syncUI();
    window.dispatchEvent(new CustomEvent('zfb-wishlist-updated', { detail: { count: cleanList.length, items: cleanList } }));
  }

  function updateBadges() {
    const wl = getWishlistIds();
    document.querySelectorAll('.wishlist-badge, #wishlist-count, [data-wishlist-count]').forEach(b => {
      b.textContent = wl.length;
      if (wl.length > 0) b.style.display = 'grid';
      else b.style.display = 'none';
    });
  }

  function syncUI() {
    const wl = getWishlistIds();
    document.querySelectorAll('.wish, .btn-wishlist, #wishlist-btn, #gallery-favorite-btn').forEach(btn => {
      let id = btn.getAttribute('data-product-id') || btn.getAttribute('data-id') || btn.closest('[data-product-id]')?.getAttribute('data-product-id') || btn.closest('[data-id]')?.getAttribute('data-id');
      if (!id && window.location.pathname.includes('product.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        id = urlParams.get('id');
      }
      if (id && wl.includes(id)) {
        btn.classList.add('is-active', 'active');
      } else {
        btn.classList.remove('is-active', 'active');
      }
    });
  }

  function toggleWishlist(id) {
    if (!id) return;
    let wl = getWishlistIds();
    if (wl.includes(id)) {
      wl = wl.filter(item => item !== id);
    } else {
      wl.push(id);
    }
    setWishlistIds(wl);
    return wl.includes(id);
  }

  window.ZFB_WISHLIST = {
    get: getWishlistIds,
    set: setWishlistIds,
    toggle: toggleWishlist,
    updateBadges,
    syncUI
  };

  document.addEventListener('DOMContentLoaded', () => {
    updateBadges();
    syncUI();

    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.wish, .btn-wishlist, #wishlist-btn, #gallery-favorite-btn');
      if (!btn) return;
      
      e.preventDefault();
      let id = btn.getAttribute('data-product-id') || btn.getAttribute('data-id') || btn.closest('[data-product-id]')?.getAttribute('data-product-id') || btn.closest('[data-id]')?.getAttribute('data-id');
      if (!id && window.location.pathname.includes('product.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        id = urlParams.get('id');
      }
      if (!id) return;

      const isNowActive = toggleWishlist(id);
      
      if (window.location.pathname.includes('wishlist.html') && !isNowActive) {
        const card = btn.closest('.product-card');
        if (card) {
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 300);
        }
      }
    });
  });
})();
