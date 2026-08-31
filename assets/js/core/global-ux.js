/**
 * ZFB Global UX Orchestrator
 * Comprehensive Desktop & Mobile UX System: 3-Lines Drawer, 3-Dots Options Dropdown, Bottom Bar, Dual Floating Buttons & Auth Sync.
 */
(function() {
  if (!window.ZFB_AUTH) {
    const s = document.createElement('script');
    s.src = 'assets/js/core/auth.js?v=20260829-v1';
    document.head.appendChild(s);
  }

  // Ensure persistent guest ID in browser
  try {
    let gid = localStorage.getItem('zfb.guest_id') || localStorage.getItem('zfb_guest_id');
    if (!gid) {
      gid = 'guest_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('zfb.guest_id', gid);
      localStorage.setItem('zfb_guest_id', gid);
    }
    window.ZFB_GUEST_ID = gid;
  } catch (_) {}

  function isMobileViewport() {
    return window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : window.innerWidth <= 768;
  }

  function removeMobileChrome() {
    document.querySelector('.zfb-mobile-header')?.remove();
    document.querySelector('.mobile-app-bottom-bar')?.remove();
    document.body.classList.remove('has-zfb-mobile-header', 'zfb-mobile-header-compact', 'has-zfb-mobile-bottom-bar');
    document.documentElement.style.removeProperty('--zfb-mobile-header-height');
  }

  function toggleMobileDrawer(forceState) {
    const drawerOverlay = document.getElementById('zfb-mobile-drawer');
    if (!drawerOverlay) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !drawerOverlay.classList.contains('active');
    
    if (shouldOpen) {
      drawerOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      drawerOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }
  window.toggleMobileDrawer = toggleMobileDrawer;

  // Global Options Dropdown (Three Vertical Dots ⋮ Menu)
  function toggleOptionsMenu(e) {
    if (e) e.stopPropagation();
    let optionsModal = document.getElementById('zfb-options-dropdown-modal');
    if (!optionsModal) {
      optionsModal = document.createElement('div');
      optionsModal.id = 'zfb-options-dropdown-modal';
      optionsModal.className = 'zfb-options-modal-backdrop';
      optionsModal.innerHTML = `
        <div class="zfb-options-card">
          <div class="zfb-options-head">
            <span>خيارات المنصة المتقدمة</span>
            <button class="zfb-options-close" type="button" aria-label="إغلاق">&times;</button>
          </div>
          <div class="zfb-options-list">
            <button type="button" class="zfb-opt-item" onclick="if(window.ZFB_THEME){window.ZFB_THEME.toggle(); document.getElementById('zfb-options-dropdown-modal').classList.remove('show');}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              <span>تغيير نمط الإضاءة (داكن / نهاري)</span>
            </button>
            <a href="account.html" class="zfb-opt-item">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>حسابي وتتبع الطلبات</span>
            </a>
            <a href="compare.html" class="zfb-opt-item">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 21v-7M20 8l-7 7M4 14l7-7M4 3h5v5M20 21v-7"/></svg>
              <span>مقارنة المنتجات</span>
            </a>
            <a href="track-order.html" class="zfb-opt-item">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>تتبع حالة الشحن</span>
            </a>
            <a href="contact.html" class="zfb-opt-item" style="color:#25D366; font-weight:700;">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-1.002 3.66 3.745-.993z"/></svg>
              <span>الدعم الفني والواتساب</span>
            </a>
          </div>
        </div>
      `;
      document.body.appendChild(optionsModal);

      // Inject modal styles if missing
      if (!document.getElementById('zfb-options-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'zfb-options-modal-styles';
        style.textContent = `
          .zfb-options-modal-backdrop {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            z-index: 99999; opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
          }
          .zfb-options-modal-backdrop.show { opacity: 1; pointer-events: auto; }
          .zfb-options-card {
            background: var(--surface, #ffffff); color: var(--ink, #111111);
            width: 90%; max-width: 360px; border-radius: 18px; padding: 18px;
            box-shadow: 0 16px 36px rgba(0,0,0,0.25); border: 1px solid var(--line, #e2e8f0);
          }
          [data-theme="dark"] .zfb-options-card, body.dark-mode .zfb-options-card {
            background: #18201b; color: #ffffff; border-color: rgba(255,255,255,0.1);
          }
          .zfb-options-head {
            display: flex; justify-content: space-between; align-items: center;
            padding-bottom: 12px; border-bottom: 1px solid var(--line, #eee); font-weight: 700; font-size: 0.95rem;
          }
          .zfb-options-close { background: none; border: none; font-size: 22px; cursor: pointer; color: inherit; }
          .zfb-options-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
          .zfb-opt-item {
            display: flex; align-items: center; gap: 12px; padding: 12px 14px;
            border-radius: 12px; text-decoration: none; color: inherit; background: var(--surface-alt, #f8fafc);
            border: 1px solid var(--line, #e2e8f0); font-weight: 600; font-size: 0.88rem; cursor: pointer; text-align: right; width: 100%;
          }
          [data-theme="dark"] .zfb-opt-item, body.dark-mode .zfb-opt-item {
            background: #202b24; border-color: rgba(255,255,255,0.08); color: #fff;
          }
          .zfb-opt-item:hover { background: var(--gold, #c79a52); color: #ffffff; }
        `;
        document.head.appendChild(style);
      }

      optionsModal.querySelector('.zfb-options-close').addEventListener('click', () => optionsModal.classList.remove('show'));
      optionsModal.addEventListener('click', (e) => {
        if (e.target === optionsModal) optionsModal.classList.remove('show');
      });
    }

    optionsModal.classList.toggle('show');
  }
  window.toggleOptionsMenu = toggleOptionsMenu;

  function iconSvg(name) {
    const icons = {
      menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="12" cy="19" r="1.7"></circle></svg>',
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
      cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h15l-1.8 8.4a2 2 0 0 1-2 1.6H9a2 2 0 0 1-2-1.7L5.6 4H3"></path><circle cx="9" cy="21" r="1"></circle><circle cx="18" cy="21" r="1"></circle></svg>',
      user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"></path></svg>',
      grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
      moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path></svg>',
      sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>',
      spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.9 5.8L20 10l-6.1 2.2L12 18l-1.9-5.8L4 10l6.1-2.2L12 2Z"></path></svg>',
      truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3z"></path><path d="M14 9h4l3 3v4h-7z"></path><circle cx="7" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle></svg>',
      shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="m9 12 2 2 4-4"></path></svg>',
      globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"></path></svg>',
      wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v13H3z"></path><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"></path><path d="M3 7l14-4v4"></path></svg>'
    };
    return icons[name] || icons.menu;
  }

  function getCartCount() {
    if (window.ZFB && window.ZFB.Cart && typeof window.ZFB.Cart.count === 'function') {
      return window.ZFB.Cart.count();
    }
    try {
      const cart = JSON.parse(localStorage.getItem('zfb.cart') || '[]');
      const items = Array.isArray(cart) ? cart : (cart.items || []);
      return items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    } catch (_) {
      return 0;
    }
  }

  function syncMobileHeaderState(header) {
    if (!header) return;
    const cartBadge = header.querySelector('.zfb-mobile-cart-count');
    const currencyLabels = header.querySelectorAll('[data-mobile-currency-label]');
    const themeLabels = header.querySelectorAll('[data-mobile-theme-label]');
    const themeIcons = header.querySelectorAll('[data-mobile-theme-icon]');
    const langLabels = header.querySelectorAll('[data-mobile-lang-label]');
    const count = getCartCount();

    if (cartBadge) {
      cartBadge.textContent = count;
      cartBadge.hidden = count <= 0;
    }

    if (currencyLabels.length && window.ZFB_CURRENCY) {
      const label = window.ZFB_CURRENCY.getCurrency() === 'SAR' ? 'ر.س' : 'ر.ي';
      currencyLabels.forEach((currencyLabel) => {
        currencyLabel.textContent = label;
      });
    }

    if (window.ZFB_THEME) {
      const isDark = window.ZFB_THEME.getTheme() === 'dark';
      themeLabels.forEach((themeLabel) => {
        themeLabel.textContent = isDark ? 'الوضع النهاري' : 'الوضع الليلي';
      });
      themeIcons.forEach((themeIcon) => {
        themeIcon.innerHTML = iconSvg(isDark ? 'sun' : 'moon');
      });
    }

    if (langLabels.length && window.ZFB_I18N) {
      const label = window.ZFB_I18N.getLang() === 'en' ? 'EN' : 'AR';
      langLabels.forEach((langLabel) => {
        langLabel.textContent = label;
      });
    }
  }

  function buildMobileAppHeader() {
    if (document.body.classList.contains('admin-page')) return;
    if (!isMobileViewport()) {
      removeMobileChrome();
      return;
    }
    if (document.querySelector('.zfb-mobile-header')) return;

    const shell = document.querySelector('.shop-shell') || document.body;
    const sourceSearch = document.querySelector('.main-nav .search input[type="search"]');
    const placeholder = sourceSearch?.getAttribute('placeholder') || 'ابحث عن منتج، قسم، عرض، أو خدمة...';
    const mobileSearchPlaceholder = placeholder.length <= 40 ? placeholder : 'ابحث عن أثاث، أجهزة، طاقة شمسية...';

    const header = document.createElement('header');
    header.className = 'zfb-mobile-header';
    header.setAttribute('aria-label', 'هيدر المتجر للموبايل');
    header.innerHTML = `
      <div class="zfb-mobile-main-row">
        <div class="zfb-mobile-brand-group">
          <a class="zfb-mobile-brand" href="index.html" aria-label="زياد للتجارة">
            <span class="zfb-mobile-brand-mark">Z</span>
            <span class="zfb-mobile-brand-text">
              <strong>زياد للتجارة</strong>
              <small>ZEYAD STORE</small>
            </span>
          </a>
          <button class="zfb-mobile-icon-btn zfb-mobile-menu-btn" type="button" aria-label="القائمة وخريطة الموقع" onclick="window.toggleMobileDrawer(true)">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>

        <form class="zfb-mobile-search" role="search" aria-label="البحث في المتجر" action="search.html" method="get">
          <label class="zfb-mobile-search-field">
            <input name="q" type="search" autocomplete="off" maxlength="120" placeholder="${mobileSearchPlaceholder}">
          </label>
          <button class="zfb-mobile-search-icon" type="submit" aria-label="بحث">${iconSvg('search')}</button>
        </form>

        <div class="zfb-mobile-actions" aria-label="إجراءات المتجر">
          <button class="zfb-mobile-icon-btn zfb-mobile-theme-btn" type="button" data-mobile-theme-toggle aria-label="تغيير الوضع النهاري والليلي">
            <span data-mobile-theme-icon>${iconSvg('moon')}</span>
          </button>
          <button class="zfb-mobile-icon-btn zfb-mobile-curr-btn" type="button" data-mobile-currency-toggle aria-label="تغيير العملة">
            <span data-mobile-currency-label style="font-size:0.74rem; font-weight:800; font-family:inherit;">ر.ي</span>
          </button>
          <a class="zfb-mobile-icon-btn zfb-mobile-cart-btn" href="cart.html" aria-label="سلة التسوق">
            ${iconSvg('cart')}
            <b class="zfb-mobile-cart-count" hidden>0</b>
          </a>
          <button class="zfb-mobile-icon-btn zfb-mobile-more-btn" type="button" aria-expanded="false" aria-controls="zfb-mobile-more-panel" aria-label="المزيد">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>
          </button>
        </div>
      </div>


      <div class="zfb-mobile-more-panel" id="zfb-mobile-more-panel" hidden>
        <div class="zfb-mobile-panel-grid">
          <a href="category.html">${iconSvg('grid')}<span>الأقسام</span></a>
          <a href="wishlist.html">${iconSvg('heart')}<span>المفضلة</span></a>
          <a href="account.html">${iconSvg('user')}<span>الحساب</span></a>
          <a href="compare.html">${iconSvg('grid')}<span>المقارنة</span></a>
          <a href="track-order.html">${iconSvg('truck')}<span>تتبع الطلب</span></a>
          <a href="platforms.html">${iconSvg('globe')}<span>منصاتنا</span></a>
        </div>
        <div class="zfb-mobile-controls">
          <button type="button" class="zfb-mobile-control" data-mobile-lang-toggle>${iconSvg('globe')}<span data-mobile-lang-label>AR</span></button>
          <button type="button" class="zfb-mobile-control" data-mobile-currency-toggle>${iconSvg('wallet')}<span data-mobile-currency-label>ر.ي</span></button>
          <button type="button" class="zfb-mobile-control" data-mobile-theme-toggle><span data-mobile-theme-icon>${iconSvg('moon')}</span><span data-mobile-theme-label>الوضع الليلي</span></button>
        </div>
      </div>
    `;

    shell.insertBefore(header, shell.firstChild);
    document.body.classList.add('has-zfb-mobile-header');

    const moreBtn = header.querySelector('.zfb-mobile-more-btn');
    const panel = header.querySelector('.zfb-mobile-more-panel');

    const updateHeaderOffset = () => {
      if (window.innerWidth <= 768) {
        const panelWasHidden = panel ? panel.hidden : true;
        if (panel) panel.hidden = true;
        document.documentElement.style.setProperty('--zfb-mobile-header-height', `${Math.ceil(header.offsetHeight)}px`);
        if (panel) panel.hidden = panelWasHidden;
      } else {
        document.documentElement.style.removeProperty('--zfb-mobile-header-height');
      }
    };

    if (moreBtn && panel) {
      moreBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = panel.hidden;
        panel.hidden = !isOpen;
        moreBtn.setAttribute('aria-expanded', String(isOpen));
        header.classList.toggle('is-more-open', isOpen);
      });
      document.addEventListener('click', (event) => {
        if (!panel.hidden && !header.contains(event.target)) {
          panel.hidden = true;
          moreBtn.setAttribute('aria-expanded', 'false');
          header.classList.remove('is-more-open');
        }
      });
    }

    header.querySelectorAll('[data-mobile-theme-toggle]').forEach(themeBtn => {
      themeBtn.addEventListener('click', () => {
        if (window.ZFB_THEME) window.ZFB_THEME.toggle();
        syncMobileHeaderState(header);
      });
    });

    header.querySelectorAll('[data-mobile-currency-toggle]').forEach(currencyBtn => {
      currencyBtn.addEventListener('click', () => {
        if (window.ZFB_CURRENCY) {
          const next = window.ZFB_CURRENCY.getCurrency() === 'SAR' ? 'YER' : 'SAR';
          window.ZFB_CURRENCY.setCurrency(next);
        }
        syncMobileHeaderState(header);
      });
    });

    header.querySelectorAll('[data-mobile-lang-toggle]').forEach(langBtn => {
      langBtn.addEventListener('click', () => {
        if (window.ZFB_I18N) {
          const next = window.ZFB_I18N.getLang() === 'en' ? 'ar' : 'en';
          window.ZFB_I18N.setLang(next);
        }
        syncMobileHeaderState(header);
      });
    });

    const updateCompactState = () => {
      if (window.innerWidth <= 768 && window.scrollY > 72) {
        document.body.classList.add('zfb-mobile-header-compact');
      } else {
        document.body.classList.remove('zfb-mobile-header-compact');
      }
      requestAnimationFrame(updateHeaderOffset);
    };

    window.addEventListener('scroll', updateCompactState, { passive: true });
    window.addEventListener('resize', updateCompactState);
    window.addEventListener('zfb-state-change', () => syncMobileHeaderState(header));
    window.addEventListener('zfb-currency-change', () => syncMobileHeaderState(header));
    window.addEventListener('zfb-theme-change', () => syncMobileHeaderState(header));

    syncMobileHeaderState(header);
    updateCompactState();
    updateHeaderOffset();
    setTimeout(() => syncMobileHeaderState(header), 500);
    setTimeout(updateHeaderOffset, 500);
  }

  // ---------------------------------------------
  // Site-Wide Floating Controls (WhatsApp + AI Assistant)
  // ---------------------------------------------
  function ensureDualFloatingButtons() {
    if (document.body.classList.contains('admin-page')) return;

    const isNajmPage = window.location.pathname.includes('najm.html') || 
                        document.body.classList.contains('najm-body') || 
                        document.querySelector('.najm-page');

    if (!document.getElementById('zfb-ai-store-launcher-styles')) {
      const style = document.createElement('style');
      style.id = 'zfb-ai-store-launcher-styles';
      style.textContent = `
        .zfb-ai-store-launcher {
          position: fixed;
          left: 22px;
          bottom: 102px;
          z-index: 9998;
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          text-decoration: none;
          color: #07131f;
          background: linear-gradient(135deg, #10261c 0%, #1e3d2f 45%, #d6a84f 100%);
          border: 2px solid #d6a84f;
          box-shadow: 0 14px 34px rgba(7,19,31,0.32), 0 0 0 6px rgba(214,168,79,0.12);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .zfb-ai-store-launcher:hover {
          transform: translateY(-3px) scale(1.05);
          box-shadow: 0 20px 44px rgba(7,19,31,0.38), 0 0 0 8px rgba(214,168,79,0.2);
        }
        .zfb-ai-category-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 15px;
          border-radius: 999px;
          color: #07131f;
          background: linear-gradient(135deg, #0f6b4f, #d6a84f);
          border: 1px solid rgba(214,168,79,0.42);
          text-decoration: none;
          font-weight: 800;
          box-shadow: 0 10px 24px rgba(15,107,79,0.16);
        }
        .zfb-ai-category-cta svg {
          width: 20px;
          height: 20px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        @media (max-width: 768px) {
          .zfb-ai-store-launcher {
            left: 14px;
            bottom: 84px;
            width: 54px;
            height: 54px;
          }
          .zfb-ai-category-cta {
            width: 100%;
            justify-content: center;
            margin-top: 0;
            font-size: 0.8rem;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let aiBtn = document.getElementById('zfb-ai-store-launcher');
    if (isNajmPage) {
      // Hide AI launcher on Najm page itself to prevent collision
      if (aiBtn) aiBtn.style.display = 'none';
    } else {
      if (!aiBtn) {
        aiBtn = document.createElement('a');
        aiBtn.id = 'zfb-ai-store-launcher';
        aiBtn.className = 'zfb-ai-store-launcher';
        aiBtn.href = 'najm.html';
        aiBtn.setAttribute('aria-label', 'تحدث مع نجم — المساعد الذكي');
        aiBtn.title = 'نجم — المساعد الذكي';
        aiBtn.innerHTML = `
          <div style="position: relative; width: 100%; height: 100%; border-radius: 50%; overflow: hidden;">
            <img src="assets/images/najm-avatar.webp" alt="نجم" style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%;">
            <span style="position: absolute; bottom: 2px; right: 2px; width: 12px; height: 12px; border-radius: 50%; background: #22c55e; border: 2px solid #ffffff; box-shadow: 0 0 6px rgba(34, 197, 94, 0.8);"></span>
          </div>
        `;
        document.body.appendChild(aiBtn);
      } else {
        aiBtn.style.display = 'grid';
      }
    }

    // 1. WhatsApp Float Button (Right Side)
    let wa = document.querySelector('.whatsapp-float');
    if (!wa) {
      wa = document.createElement('a');
      wa.className = 'whatsapp-float';
      wa.href = 'contact.html';
      wa.setAttribute('aria-label', 'تواصل عبر الواتساب');
      wa.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" stroke="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a5.8 5.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.81 11.81 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413Z"></path></svg>';
      document.body.appendChild(wa);
    }
  }

  // ---------------------------------------------
  // Mobile Navigation Drawer (Full Site Map)
  // ---------------------------------------------
  function buildMobileDrawer() {
    if (document.getElementById('zfb-mobile-drawer')) return;

    const drawerOverlay = document.createElement('div');
    drawerOverlay.className = 'mobile-drawer-overlay';
    drawerOverlay.id = 'zfb-mobile-drawer';
    drawerOverlay.innerHTML = `
      <div class="mobile-drawer" role="dialog" aria-modal="true" aria-label="القائمة الجانبية وخريطة الموقع">
        <div class="mobile-drawer-header">
          <a href="index.html" class="mobile-drawer-brand">
            <span class="brand-mark">ز</span>
            <div style="display:flex; flex-direction:column; line-height:1.2;">
              <strong style="font-size:1.05rem;">زياد للتجارة</strong>
              <small style="font-size:0.72rem; color:var(--gold, #c79a52); font-weight:600;">خريطة الموقع والأقسام</small>
            </div>
          </a>
          <button class="mobile-drawer-close" aria-label="إغلاق القائمة">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div class="mobile-drawer-body">
          <div class="mobile-drawer-section-title">التنقل السريع</div>
          <nav class="mobile-drawer-nav">
            <a href="index.html"><span class="item-title">${iconSvg('spark')} الصفحة الرئيسية</span></a>
            <a href="category.html"><span class="item-title">${iconSvg('grid')} جميع الأقسام والمعارض</span> <span class="badge-tag">الرئيسية</span></a>
          </nav>

          <div class="mobile-drawer-section-title">صالات المعارض والأقسام (خريطة الموقع)</div>
          <div class="mobile-drawer-accordion-group" data-zs-drawer-departments>
            <!-- Filled from window.ZFB_DATA. What was here was a hand-written
                 sitemap: seven departments, each with six sub-links pointing at
                 ?cat=<english-slug>. The site filters on ?category=<arabic-slug>,
                 so all forty of those links landed on the department page and
                 filtered nothing -- and the panel they lived in was long enough
                 to make opening the drawer feel like it had hung.

                 A department now links straight to its page, where the category
                 rail does the filtering for real. -->
          </div>

          <div class="mobile-drawer-section-title">الخدمات وتتبع الطلبات</div>
          <nav class="mobile-drawer-nav">
            <a href="najm.html" style="color:var(--gold, #c79a52); font-weight:800;"><span class="item-title">🤖 مساعد الذكاء الاصطناعي (نجم)</span> <span class="badge-tag" style="background:#22c55e; color:#fff;">متصل</span></a>
            <a href="report-issue.html" style="color:var(--gold, #c79a52); font-weight:800;"><span class="item-title">🛡️ الإبلاغ عن مشكلة ومكافآت</span> <span class="badge-tag" style="background:rgba(199,154,82,0.15); color:var(--gold,#c79a52); border:1px solid rgba(199,154,82,0.3);">مكافأة 🎁</span></a>
            <a href="offers.html"><span class="item-title">${iconSvg('spark')} عروض وتخفيضات اليوم</span> <span class="badge-tag">توفير</span></a>
            <a href="track-order.html"><span class="item-title">${iconSvg('truck')} تتبع حالة الطلب</span></a>
            <a href="wishlist.html"><span class="item-title">${iconSvg('heart')} قائمة المفضلة</span></a>
            <a href="compare.html"><span class="item-title">${iconSvg('grid')} مقارنة المواصفات</span></a>
            <a href="branches.html"><span class="item-title">${iconSvg('globe')} الفروع وصالات العرض</span></a>
            <a href="platforms.html"><span class="item-title">${iconSvg('globe')} منصاتنا الرقمية</span></a>
            <a href="account.html"><span class="item-title">${iconSvg('user')} حسابي وإعدادات الطلبات</span></a>
          </nav>
        </div>

        <div class="mobile-drawer-footer">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
            <button type="button" class="btn-drawer-theme" onclick="if(window.ZFB_THEME)window.ZFB_THEME.toggle();" style="flex:1; height:38px; border-radius:10px; border:1px solid var(--line); background:var(--surface); cursor:pointer; font-weight:700; font-size:0.82rem; color:var(--ink); display:flex; align-items:center; justify-content:center; gap:6px;">
              <span>🌓</span>
              <span>تبديل الوضع</span>
            </button>
            <select class="ux-select drawer-curr-select" onchange="if(window.ZFB_CURRENCY)window.ZFB_CURRENCY.setCurrency(this.value);" style="flex:1; height:38px; border-radius:10px; border:1px solid var(--line); background:var(--surface); font-size:0.82rem; font-weight:700; color:var(--ink); padding:0 8px;">
              <option value="YER" ${window.ZFB_CURRENCY && window.ZFB_CURRENCY.getCurrency() === 'YER' ? 'selected' : ''}>ر.ي (يمني)</option>
              <option value="SAR" ${window.ZFB_CURRENCY && window.ZFB_CURRENCY.getCurrency() === 'SAR' ? 'selected' : ''}>ر.س (سعودي)</option>
            </select>
          </div>
          <a href="contact.html" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; height:38px; border-radius:10px; background:#25D366; color:#fff; font-weight:700; font-size:0.85rem; text-decoration:none;">
            ${iconSvg('globe')}
            <span>تواصل مباشرة عبر واتساب</span>
          </a>
        </div>
      </div>
    `;

    document.body.appendChild(drawerOverlay);

    /* The department list comes from the database (window.ZFB_DATA, injected on
       every page), so it is whatever the admin actually has -- add a department
       and it appears here without anyone editing this file. Each entry links to
       the department page; the category rail there does the filtering. */
    (function fillDrawerDepartments() {
      const mount = drawerOverlay.querySelector('[data-zs-drawer-departments]');
      if (!mount) return;

      const data = window.ZFB_DATA || {};
      const departments = Array.isArray(data.departments) ? data.departments : [];
      if (!departments.length) {
        // No data injected (a page served without the middleware, or an older
        // cache). One honest link beats an empty panel.
        mount.innerHTML = '<a class="drawer-dept" href="category.html">' +
          '<span>جميع الأقسام</span></a>';
        return;
      }

      const counts = {};
      (Array.isArray(data.categories) ? data.categories : []).forEach((c) => {
        if (c && c.departmentId != null) {
          counts[c.departmentId] = (counts[c.departmentId] || 0) + 1;
        }
      });

      const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      mount.innerHTML = departments.map((d) => {
        const n = counts[d.id] || 0;
        const sub = n ? (n === 1 ? 'فئة واحدة' : n === 2 ? 'فئتان' : n + ' فئات') : '';
        return '<a class="drawer-dept" href="' + esc(d.page || (d.slug + '.html')) + '">' +
          (d.image ? '<img src="' + esc(d.image) + '" alt="" loading="lazy">' : '<i aria-hidden="true"></i>') +
          '<span><strong>' + esc(d.name) + '</strong>' +
          (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></a>';
      }).join('');
    })();

    // Wire Accordion toggles
    drawerOverlay.querySelectorAll('.drawer-acc-btn, .drawer-acc-head').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('drawer-acc-link')) return; // Allow direct link navigation
        const item = el.closest('.drawer-acc-item');
        if (!item) return;
        const sub = item.querySelector('.drawer-acc-sub');
        const btn = item.querySelector('.drawer-acc-btn');
        if (sub) {
          const isHidden = sub.hidden;
          sub.hidden = !isHidden;
          item.classList.toggle('is-expanded', isHidden);
          if (btn) btn.textContent = isHidden ? '▴' : '▾';
        }
      });
    });

    const closeBtn = drawerOverlay.querySelector('.mobile-drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', () => toggleMobileDrawer(false));
    drawerOverlay.addEventListener('click', (e) => {
      if (e.target === drawerOverlay) toggleMobileDrawer(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerOverlay.classList.contains('active')) {
        toggleMobileDrawer(false);
      }
    });
  }

  // ---------------------------------------------
  // Desktop header actions
  //
  // The mobile header is built here, in one place, for every page. The desktop
  // one was hand-written into each HTML file instead -- and had drifted into
  // 31 different versions across 68 pages. Eleven of them had no cart at all,
  // and not one had a currency switcher or a dark-mode toggle, even though
  // both exist on mobile and both are wired to site-wide APIs.
  //
  // So the desktop actions are built the same way the mobile header is: from
  // one definition, at runtime. Editing 71 files would have produced a 32nd
  // variant the first time a page was touched.
  //
  // Scope is deliberately narrow. Only .nav-actions is replaced -- never the
  // brand block or the search form, which are the two header elements the
  // visual editor actually stores overrides for (v-ecc6fbe6, v-0c41daec).
  // Nothing here runs on mobile.
  // ---------------------------------------------
  const DESKTOP_NAV_MARKER = 'data-zfb-desktop-nav';

  function moonIcon() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  }
  function sunIcon() {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  }

  function currencyLabel() {
    if (!window.ZFB_CURRENCY) return 'ر.ي';
    return window.ZFB_CURRENCY.getCurrency() === 'SAR' ? 'ر.س' : 'ر.ي';
  }

  function cartTotalLabel() {
    try {
      if (window.ZFB && window.ZFB.Cart && typeof window.ZFB.Cart.total === 'function') {
        const total = window.ZFB.Cart.total();
        if (!total) return '';
        if (window.ZFB_CURRENCY && typeof window.ZFB_CURRENCY.format === 'function') {
          return window.ZFB_CURRENCY.format(total);
        }
        return String(Math.round(total));
      }
    } catch (_) { /* cart not ready yet; the sync below fills it in later */ }
    return '';
  }

  /**
   * Keep the injected controls showing the truth. Called on first build and
   * again whenever the cart, the currency or the theme changes, so the header
   * never displays a stale total or the wrong currency after a soft update.
   */
  function syncDesktopNavState() {
    const nav = document.querySelector('.nav-actions[' + DESKTOP_NAV_MARKER + ']');
    if (!nav) return;

    const count = getCartCount();
    const countEl = nav.querySelector('.cart b');
    if (countEl) countEl.textContent = count;

    const totalEl = nav.querySelector('[data-desktop-cart-total]');
    if (totalEl) {
      const label = cartTotalLabel();
      totalEl.textContent = label;
      // An empty basket should not leave a stray separator hanging in the bar.
      totalEl.hidden = !label;
    }

    const currEl = nav.querySelector('[data-desktop-currency-label]');
    if (currEl) currEl.textContent = currencyLabel();

    // theme.js owns the icon inside .theme-toggle-btn -- it rewrites the
    // innerHTML of every such button on each theme change. We only set the
    // correct starting icon, because this button is created after theme.js has
    // already done its initial pass.
    const themeBtn = nav.querySelector('[data-desktop-theme-toggle]');
    if (themeBtn && !themeBtn.dataset.iconReady) {
      const isDark = window.ZFB_THEME ? window.ZFB_THEME.getTheme() === 'dark' : false;
      themeBtn.innerHTML = isDark ? sunIcon() : moonIcon();
      themeBtn.dataset.iconReady = '1';
    }
  }

  function buildDesktopNavActions() {
    if (isMobileViewport()) return;
    if (document.body.classList.contains('admin-page')) return;

    const nav = document.querySelector('nav.main-nav');
    if (!nav) return;

    let actions = nav.querySelector('.nav-actions');
    if (actions && actions.hasAttribute(DESKTOP_NAV_MARKER)) {
      syncDesktopNavState();
      return;
    }

    // Three pages (couches, furniture, furniture-catalog) ship a main-nav with
    // no .nav-actions at all, so there is nothing to replace -- create it.
    if (!actions) {
      actions = document.createElement('div');
      nav.appendChild(actions);
    }

    actions.className = 'nav-actions';
    actions.setAttribute(DESKTOP_NAV_MARKER, '');
    actions.innerHTML = `
      <a href="offers.html">العروض</a>
      <a href="best-sellers.html">الأكثر مبيعا</a>

      <a class="nav-icon-btn" href="account.html" aria-label="حسابي" title="حسابي">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
      </a>

      <a class="nav-icon-btn" href="wishlist.html" aria-label="المفضلة" title="المفضلة">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"></path></svg>
      </a>

      <button type="button" class="nav-icon-btn zfb-desktop-currency" data-desktop-currency-toggle
              aria-label="تغيير العملة" title="تبديل العملة بين الريال اليمني والسعودي">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path></svg>
        <span data-desktop-currency-label>${currencyLabel()}</span>
      </button>

      <button type="button" class="nav-icon-btn theme-toggle-btn" data-desktop-theme-toggle
              aria-label="تغيير الوضع النهاري والليلي" title="تغيير الوضع النهاري والليلي"></button>

      <div class="dropdown-wrapper">
        <button type="button" class="nav-icon-btn more-menu-btn" aria-expanded="false" aria-label="المزيد" title="المزيد">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
        </button>
        <div class="more-dropdown">
          <a href="category.html">الأقسام</a>
          <a href="compare.html">المقارنة</a>
          <a href="search.html?q=%D8%A7%D9%84%D8%AC%D8%AF%D9%8A%D8%AF">الجديد</a>
          <a href="track-order.html">تتبع الطلب</a>
          <a href="delivery.html">سياسة وأسعار التوصيل</a>
          <a href="branches.html">الفروع</a>
          <a href="contact.html">تواصل معنا</a>
          <a href="faq.html">الأسئلة الشائعة</a>
          <a href="returns.html">سياسة الإرجاع</a>
          <a href="terms.html">الشروط والأحكام</a>
          <a href="privacy.html">سياسة الخصوصية</a>
          <a href="about.html">من نحن</a>
        </div>
      </div>

      <a class="cart" href="cart.html" aria-label="السلة" title="السلة">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h14l-1.6 8.1a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.7L5.7 4H3"></path><path d="M9 21h.1M18 21h.1"></path></svg>
        <b>0</b>
        <span class="zfb-cart-total" data-desktop-cart-total hidden></span>
      </a>
    `;

    // The currency control has no site-wide handler to inherit, so wire it.
    actions.querySelector('[data-desktop-currency-toggle]')?.addEventListener('click', () => {
      if (!window.ZFB_CURRENCY) return;
      const next = window.ZFB_CURRENCY.getCurrency() === 'SAR' ? 'YER' : 'SAR';
      window.ZFB_CURRENCY.setCurrency(next);
      syncDesktopNavState();
    });

    // theme.js keeps the icon in step but attaches no click handler of its own
    // -- it only ever syncs. Without this the button would be inert.
    actions.querySelector('[data-desktop-theme-toggle]')?.addEventListener('click', () => {
      if (window.ZFB_THEME) window.ZFB_THEME.toggle();
    });

    // The nav is already position:sticky. Mark the stuck state so the bar gets
    // a shadow once content scrolls beneath it -- the background is
    // translucent with a backdrop blur, so without a boundary the header and
    // the page underneath visually run together. Bound once per page.
    // The scrolled-header state already exists in this codebase: zfb-core.js
    // adds `body.nav-scrolled` past 40px, and production-polish.css styles it
    // (tighter padding, a shadow, a near-opaque background). But zfb-core.js
    // is absent from ten pages -- the homepage among them -- so on those the
    // header stayed in its resting state no matter how far you scrolled.
    //
    // This runs the same toggle, with the same class and the same 40px
    // threshold, from a file every page loads. On the 61 pages that also have
    // zfb-core.js both handlers agree exactly, so the duplicate is harmless.
    if (!document.documentElement.dataset.navScrollWatch) {
      document.documentElement.dataset.navScrollWatch = '1';
      const scrollOffset = () =>
        window.scrollY ||
        document.documentElement.scrollTop ||
        (document.body ? document.body.scrollTop : 0) ||
        0;
      const markScrolled = () => {
        document.body.classList.toggle('nav-scrolled', scrollOffset() > 40);
      };
      window.addEventListener('scroll', markScrolled, { passive: true });
      markScrolled();
    }

    syncDesktopNavState();
  }

  function initGlobalUx() {
    ensureDualFloatingButtons();
    if (isMobileViewport()) {
      buildMobileAppHeader();
      buildMobileDrawer();
      buildMobileBottomBar();
    } else {
      buildDesktopNavActions();
      buildMobileDrawer();
      removeMobileChrome();
    }

    // Keep the injected controls truthful, and rebuild when the viewport
    // crosses the breakpoint (a laptop that gets a window resized, or a tablet
    // rotated, must not be left with the wrong header).
    ['zfb-cart-updated', 'zfb-state-change', 'zfb-currency-change', 'zfb-theme-change']
      .forEach(evt => window.addEventListener(evt, syncDesktopNavState));

    let wasMobile = isMobileViewport();
    window.addEventListener('resize', () => {
      const nowMobile = isMobileViewport();
      if (nowMobile === wasMobile) return;
      wasMobile = nowMobile;
      if (nowMobile) {
        buildMobileAppHeader();
      } else {
        removeMobileChrome();
        buildDesktopNavActions();
      }
    });

    // ---------------------------------------------
    // Mobile Bottom App Navigation Bar
    // ---------------------------------------------
    function buildMobileBottomBar() {
      if (!isMobileViewport()) return;
      if (document.querySelector('.mobile-app-bottom-bar')) return;
      if (document.body.classList.contains('admin-page')) return;

      const rawPath = window.location.pathname.split('/').pop() || 'index.html';
      const pathname = rawPath === '' ? 'index.html' : rawPath;
      const isCheckoutFlow = pathname.includes('checkout') || pathname.includes('confirmation');
      if (isCheckoutFlow) {
        document.body.classList.remove('has-zfb-mobile-bottom-bar');
        return;
      }

      const bar = document.createElement('nav');
      bar.className = 'mobile-app-bottom-bar';
      bar.setAttribute('aria-label', 'شريط التنقل السفلي');

      const isHome = pathname === 'index.html' || pathname === '';
      const isCategories = pathname.includes('collections') || pathname.includes('category');
      const isSearch = pathname.includes('search');
      const isCart = pathname.includes('cart');
      const isAccount = pathname.includes('account');

      bar.innerHTML = `
        <a href="index.html" class="tab-item ${isHome ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>الرئيسية</span>
        </a>
        <a href="category.html" class="tab-item ${isCategories ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span>الأقسام</span>
        </a>
        <a href="search.html" class="tab-item ${isSearch ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>البحث</span>
        </a>
        <a href="cart.html" class="tab-item ${isCart ? 'active' : ''} nav-cart-item">
          <div class="cart-icon-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            <b class="cart-badge-count">0</b>
          </div>
          <span>السلة</span>
        </a>
        <a href="account.html" class="tab-item ${isAccount ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>الحساب</span>
        </a>
      `;

      document.body.appendChild(bar);
      document.body.classList.add('has-zfb-mobile-bottom-bar');

      function updateCartCount() {
        const badge = bar.querySelector('.cart-badge-count');
        if (!badge) return;
        let count = 0;
        if (window.ZFB && window.ZFB.Cart) {
          if (typeof window.ZFB.Cart.count === 'function') {
            count = window.ZFB.Cart.count();
          } else if (typeof window.ZFB.Cart.get === 'function') {
            count = window.ZFB.Cart.get().reduce((sum, i) => sum + (i.quantity || 1), 0);
          }
        }
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }
      window.addEventListener('zfb-state-change', updateCartCount);
      setTimeout(updateCartCount, 100);
      setTimeout(updateCartCount, 500);
    }

    buildMobileBottomBar();

    // ---------------------------------------------
    // Desktop 3-Lines Drawer Button (Sidebar Menu / خريطة الموقع)
    // ---------------------------------------------
    function ensureDesktopDrawerButton() {
      const mainNavs = document.querySelectorAll('.main-nav');
      mainNavs.forEach((nav) => {
        if (nav.querySelector('.zfb-desktop-drawer-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-icon-btn zfb-desktop-drawer-btn';
        btn.setAttribute('aria-label', 'القائمة وخريطة الموقع');
        btn.setAttribute('title', 'خريطة الموقع والأقسام');
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        `;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleMobileDrawer(true);
        });

        const brand = nav.querySelector('.brand');
        if (brand) {
          brand.parentNode.insertBefore(btn, brand);
        } else {
          nav.prepend(btn);
        }
      });
    }

    ensureDesktopDrawerButton();

    // ---------------------------------------------
    // Desktop More Dropdown Menu Toggle (Three Vertical Dots ⋮ Button)
    // ---------------------------------------------
    document.addEventListener('click', (e) => {
      const moreBtn = e.target.closest('.more-menu-btn, [data-toggle="more-menu"], .dropdown-wrapper > button');
      if (moreBtn) {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = moreBtn.closest('.dropdown-wrapper') || moreBtn.parentElement;
        const dropdown = wrapper?.querySelector('.more-dropdown');
        if (dropdown) {
          const isOpen = dropdown.classList.contains('show') || wrapper.classList.contains('open');
          document.querySelectorAll('.more-dropdown.show, .dropdown-wrapper.open').forEach(d => {
            d.classList.remove('show');
            d.classList.remove('open');
            const b = d.closest('.dropdown-wrapper')?.querySelector('.more-menu-btn');
            if (b) b.setAttribute('aria-expanded', 'false');
          });
          if (!isOpen) {
            dropdown.classList.add('show');
            if (wrapper) wrapper.classList.add('open');
            moreBtn.setAttribute('aria-expanded', 'true');
          }
        } else {
          toggleOptionsMenu(e);
        }
        return;
      }

      if (!e.target.closest('.dropdown-wrapper') && !e.target.closest('.more-dropdown')) {
        document.querySelectorAll('.more-dropdown.show, .dropdown-wrapper.open').forEach(d => {
          d.classList.remove('show');
          d.classList.remove('open');
          const btn = d.closest('.dropdown-wrapper')?.querySelector('.more-menu-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.more-dropdown.show, .dropdown-wrapper.open').forEach(d => {
          d.classList.remove('show');
          d.classList.remove('open');
          const btn = d.closest('.dropdown-wrapper')?.querySelector('.more-menu-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('.bottom-nav-categories-btn, a[href="collections.html"].bottom-nav-link')) {
        if (window.innerWidth <= 768) {
          e.preventDefault();
          toggleMobileDrawer(true);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalUx);
  } else {
    initGlobalUx();
  }
  window.addEventListener('load', initGlobalUx);
})();

// ==============================================================
// PHASE 6: PREMIUM WISHLIST SYSTEM SYNC
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
    function updateWishlistBadge() {
        if (!window.ZFB || !window.ZFB.Wishlist) return;
        const count = window.ZFB.Wishlist.get().length;
        const wlLinks = document.querySelectorAll('a[href="wishlist.html"], a[href*="wishlist.html"]');
        wlLinks.forEach(link => {
            let badge = link.querySelector('.wishlist-badge');
            if(count > 0) {
                if(!badge) {
                    badge = document.createElement('span');
                    badge.className = 'wishlist-badge badge-pulse';
                    link.style.position = 'relative';
                    link.appendChild(badge);
                }
                badge.textContent = count;
                badge.classList.remove('badge-pulse');
                void badge.offsetWidth;
                badge.classList.add('badge-pulse');
            } else {
                if(badge) badge.remove();
            }
        });
        
        const grid = document.querySelector('.wishlist-grid');
        if(grid && count === 0) {
            grid.innerHTML = '<div class="empty-state"><h3>قائمتك فارغة!</h3><p>يبدو أنك لم تقم بإضافة أي منتجات للمفضلة بعد.</p><a href="index.html" class="btn-primary" style="margin-top:20px; display:inline-block; padding:12px 24px; border-radius:12px;">تصفح المنتجات</a></div>';
            const headerP = document.querySelector('.wishlist-header p');
            if(headerP) headerP.textContent = '0 منتجات في المفضلة';
        }
    }
    
    window.addEventListener('zfb-state-change', updateWishlistBadge);
    setTimeout(updateWishlistBadge, 200);

    document.addEventListener('click', (e) => {
        if(e.target.closest('.wish, .btn-wishlist')) {
            setTimeout(updateWishlistBadge, 50);
        }
    });
});
