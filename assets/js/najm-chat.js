
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
 * NAJM AI CLIENT CONTROLLER — V2.0 PRO MAX
 * Full Interactive Digital Sales Employee & Customer Support for Zeyad Store
 */
(function() {
  'use strict';

  // 1. Session & Storage Initialization
  function getCanonicalGuestId() {
    let gid = localStorage.getItem('zfb.guest_id') || localStorage.getItem('zfb_guest_id');
    if (!gid) {
      gid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'guest_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('zfb.guest_id', gid);
    }
    return gid;
  }

  const guestId = getCanonicalGuestId();
  let sessionId = localStorage.getItem('najm_session_id');
  if (!sessionId) {
    sessionId = 'najm-sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('najm_session_id', sessionId);
  }

  let soundEnabled = true;
  const audioCtx = (typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined')
    ? new (window.AudioContext || window.webkitAudioContext)()
    : null;

  function playChime(frequency = 580, duration = 0.12) {
    if (!soundEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  // DOM Elements
  const heroForm = document.getElementById('najmHeroForm');
  const heroInput = document.getElementById('najmHeroInput');
  const chatModal = document.getElementById('najmChatModal');
  const closeChatBtn = document.getElementById('najmCloseChatBtn');
  const chatMessages = document.getElementById('najmChatMessages');
  const chatForm = document.getElementById('najmChatForm');
  const chatInput = document.getElementById('najmChatInput');
  const uploadPillBtn = document.getElementById('najmUploadPillBtn');
  const visionFileInput = document.getElementById('najmVisionFileInput');
  const modalCameraBtn = document.getElementById('najmModalCameraBtn');
  const soundToggleBtn = document.getElementById('najmSoundToggleBtn');
  const recommendationsCarousel = document.getElementById('najmRecommendationsCarousel');
  const pillsRow = document.getElementById('najmPillsRow');

  // Simple Markdown to HTML parser
  function formatMarkdown(text) {
    if (!text) return '';
    let html = text
      // Escape special HTML chars except when allowed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Tables
    const tableRegex = /\|(.+)\|[\r\n]+\|[-:| ]+\|[\r\n]+((?:\|.+[\|\r\n]*)+)/g;
    html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
      const headers = headerRow.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = bodyRows.trim().split('\n').map(row => {
        const cols = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cols}</tr>`;
      }).join('');
      return `<div style="overflow-x:auto;"><table class="najm-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    });

    // Headers
    html = html.replace(/^### (.*$)/gim, '<strong style="display:block; font-size:14.5px; margin:8px 0 4px; color:var(--najm-primary);">$1</strong>');
    html = html.replace(/^## (.*$)/gim, '<strong style="display:block; font-size:15.5px; margin:10px 0 6px; color:var(--najm-primary);">$1</strong>');
    html = html.replace(/^# (.*$)/gim, '<strong style="display:block; font-size:17px; margin:12px 0 6px; color:var(--najm-primary);">$1</strong>');

    // Bold & Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Clean up empty lines around tables and lists
    html = html.replace(/<\/ul><br>/g, '</ul>');
    html = html.replace(/<\/table><\/div><br>/g, '</table></div>');

    return html;
  }

  // Load Featured Recommendations on Landing Page
  async function loadRecommendations() {
    if (!recommendationsCarousel) return;
    try {
      const res = await fetch('/api/ai/featured-recommendations');
      const data = await res.json();
      if (data.success && Array.isArray(data.products)) {
        renderRecommendations(data.products);
      }
    } catch (err) {
      console.warn('Failed to load featured products:', err);
    }
  }

  function renderRecommendations(products) {
    if (!recommendationsCarousel) return;
    recommendationsCarousel.innerHTML = products.map(p => {
      const discountHtml = p.discountPercent ? `<span class="najm-discount-tag">-${p.discountPercent}%</span>` : '';
      const oldPriceHtml = p.oldPriceFormatted ? `<span class="najm-old-price">${p.oldPriceFormatted}</span>` : '';
      const pid = p.product_id || p.id;
      return `
        <div class="najm-product-card" data-id="${pid}">
          <div class="najm-card-thumb-wrap">
            <img src="${window.ZFB && window.ZFB.normalizeImagePath ? window.ZFB.normalizeImagePath(p.main_image || p.mainImage) : (p.main_image || '/assets/placeholder.svg')}" alt="${escHtml(p.title)}" class="najm-card-thumb" loading="lazy" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
            ${discountHtml}
            <span class="najm-stock-badge">${p.stockStatusAr || 'متوفر'}</span>
            <button class="najm-wish-btn" aria-label="أضف للمفضلة" onclick="NajmClient.toggleWishlist('${pid}', this)">❤</button>
          </div>
          <h3 class="najm-card-title" title="${escHtml(p.title)}">${escHtml(p.title)}</h3>
          <p class="najm-card-subtitle">${p.category_name || 'قسم المنتجات'}</p>
          <div class="najm-card-rating">
            <span>★</span> ${p.rating || 4.8} <small>(${p.reviews_count || 18})</small>
          </div>
          <div class="najm-card-pricing">
            <span class="najm-current-price">${p.priceFormatted || p.price + ' ر.ي'}</span>
            ${oldPriceHtml}
          </div>
          <div class="najm-card-actions-row">
            <div class="najm-qty-stepper" data-card-id="${pid}">
              <button type="button" class="najm-qty-btn" onclick="NajmClient.adjustCardQty('${pid}', -1)">-</button>
              <span class="najm-qty-num" id="qty-${pid}">1</span>
              <button type="button" class="najm-qty-btn" onclick="NajmClient.adjustCardQty('${pid}', 1)">+</button>
            </div>
            <button class="najm-add-cart-btn" id="btn-add-${pid}" onclick="NajmClient.addToCart('${pid}')">
              🛒 أضف للسلة
            </button>
            <a href="product.html?id=${pid}" class="najm-card-detail-link">🔍 عرض التفاصيل</a>
          </div>
        </div>
      `;
    }).join('');
  }

  function openChatModal() {
    if (chatModal) {
      chatModal.classList.add('active');
      document.body.style.overflow = 'hidden';
      setTimeout(() => chatInput?.focus(), 250);
    }
  }

  function closeChatModal() {
    if (chatModal) {
      chatModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // Render Product Card / Carousel inside chat messages
  function renderChatProductCards(products = []) {
    if (!products || products.length === 0) return '';

    const cardsHtml = products.map(p => {
      const pid = p.product_id || p.id;
      const discountHtml = p.discountPercent ? `<span class="najm-discount-tag">-${p.discountPercent}%</span>` : '';
      const oldPriceHtml = p.oldPriceFormatted ? `<span class="najm-old-price">${p.oldPriceFormatted}</span>` : '';
      const stockText = p.stockStatusAr || p.stockStatus || (p.stock_status === 'in-stock' ? 'متوفر' : 'طلب مسبق');

      return `
        <div class="najm-product-card" data-id="${pid}">
          <div class="najm-card-thumb-wrap">
            <img src="${window.ZFB && window.ZFB.normalizeImagePath ? window.ZFB.normalizeImagePath(p.main_image || p.mainImage) : (p.main_image || p.mainImage || '/assets/placeholder.svg')}" alt="${escHtml(p.title)}" class="najm-card-thumb" loading="lazy" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
            ${discountHtml}
            <span class="najm-stock-badge">${stockText}</span>
            <button class="najm-wish-btn" aria-label="المفضلة" onclick="NajmClient.toggleWishlist('${pid}', this)">❤</button>
          </div>
          <h4 class="najm-card-title" title="${escHtml(p.title)}">${escHtml(p.title)}</h4>
          <p class="najm-card-subtitle">${escHtml(p.brand || p.category || p.category_name || 'زياد للتجارة')}</p>
          <div class="najm-card-rating">
            <span>★</span> ${p.rating || 4.8} <small>(${p.reviews_count || 12})</small>
          </div>
          <div class="najm-card-pricing">
            <span class="najm-current-price">${p.priceFormatted || p.price + ' ر.ي'}</span>
            ${oldPriceHtml}
          </div>
          <div class="najm-card-actions-row">
            <div class="najm-qty-stepper" data-card-id="${pid}">
              <button type="button" class="najm-qty-btn" onclick="NajmClient.adjustCardQty('${pid}', -1)">-</button>
              <span class="najm-qty-num" id="qty-chat-${pid}">1</span>
              <button type="button" class="najm-qty-btn" onclick="NajmClient.adjustCardQty('${pid}', 1)">+</button>
            </div>
            <button class="najm-add-cart-btn" id="btn-chat-add-${pid}" onclick="NajmClient.addToCart('${pid}')">
              🛒 أضف للسلة
            </button>
            <a href="product.html?id=${pid}" target="_blank" class="najm-card-detail-link">🔍 عرض التفاصيل</a>
          </div>
        </div>
      `;
    }).join('');

    return `<div class="najm-products-carousel" style="margin-top: 8px;">${cardsHtml}</div>`;
  }

  // Render Contextual Quick Action Chips
  function renderQuickActions(actions = []) {
    if (!actions || actions.length === 0) return '';
    const chipsHtml = actions.map(act => {
      return `<button type="button" class="najm-chip-btn" onclick="NajmClient.sendPrompt('${act.prompt.replace(/'/g, "\\'")}')">${act.label}</button>`;
    }).join('');
    return `<div class="najm-chat-quick-actions">${chipsHtml}</div>`;
  }

  function appendMessage(sender, content, extra = {}) {
    if (!chatMessages) return;
    const msgEl = document.createElement('div');
    msgEl.className = 'najm-msg-item ' + sender;

    if (sender === 'user') {
      let imagePreviewHtml = '';
      if (extra.imageUrl) {
        imagePreviewHtml = `<img src="${extra.imageUrl}" alt="صورة مرفقة" style="max-width:180px; border-radius:10px; margin-bottom:6px; display:block;">`;
      }
      msgEl.innerHTML = `
        <div class="najm-msg-bubble">
          ${imagePreviewHtml}
          <div>${content}</div>
        </div>
      `;
    } else {
      let widgetsHtml = '';

      // Product Carousel / Cards
      if (extra.products && extra.products.length > 0) {
        widgetsHtml += renderChatProductCards(extra.products);
      }

      // Draft Order Card
      if (extra.draftOrder) {
        const d = extra.draftOrder;
        widgetsHtml += `
          <div class="najm-chat-order-card">
            <strong style="color: var(--najm-gold); display: block; margin-bottom: 6px; font-size: 14px;">📋 مسودة طلب الشراء</strong>
            <div style="font-size: 13px; line-height: 1.6; color: var(--najm-ink);">
              <div>العميل: <strong>${d.customer?.name || ''}</strong></div>
              <div>الهاتف: <strong>${d.customer?.phone || ''}</strong></div>
              <div>العنوان: <strong>${d.customer?.city || ''} - ${d.customer?.address || ''}</strong></div>
              <div style="margin-top: 6px; border-top: 1px dashed var(--najm-border); padding-top: 6px;">
                الإجمالي: <strong style="color: var(--najm-primary); font-size: 15px;">${d.totalFormatted || ''}</strong>
              </div>
            </div>
            <button class="najm-btn-confirm-order" onclick="NajmClient.confirmOrder('${d.draftToken}')">
              ✓ تأكيد وتثبيت الطلب الآن
            </button>
          </div>
        `;
      }

      // Tracking Card
      if (extra.tracking) {
        const t = extra.tracking;
        widgetsHtml += `
          <div class="najm-chat-order-card">
            <strong style="color: var(--najm-primary); display: block; margin-bottom: 6px; font-size: 14px;">🚚 متابعة الطلب #${t.orderId}</strong>
            <div style="font-size: 13px; line-height: 1.6;">
              <div>الحالة: <strong style="color: var(--najm-gold);">${t.statusAr || t.statusLabel}</strong></div>
              <div>العميل: ${t.customerName || ''}</div>
              <div>المدينة: ${t.city || ''}</div>
              <div>المبلغ: ${t.totalFormatted || ''}</div>
              <div>المنتجات: ${Array.isArray(t.items) ? t.items.join(', ') : ''}</div>
            </div>
          </div>
        `;
      }

      // Quick Actions Chips
      let quickActionsHtml = '';
      if (extra.quickActions && extra.quickActions.length > 0) {
        quickActionsHtml = renderQuickActions(extra.quickActions);
      }

      msgEl.innerHTML = `
        <div class="najm-msg-avatar">
          <img src="assets/images/najm-avatar.webp" alt="نجم">
        </div>
        <div class="najm-msg-body">
          <div class="najm-msg-bubble">
            ${formatMarkdown(content)}
          </div>
          ${widgetsHtml}
          ${quickActionsHtml}
        </div>
      `;
    }

    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    playChime(sender === 'assistant' ? 620 : 440);
  }

  function showTypingIndicator() {
    const ind = document.createElement('div');
    ind.id = 'najmTypingIndicator';
    ind.className = 'najm-msg-item assistant';
    ind.innerHTML = `
      <div class="najm-msg-avatar"><img src="assets/images/najm-avatar.webp" alt="نجم"></div>
      <div class="najm-typing-indicator">
        <span class="najm-typing-dot"></span>
        <span class="najm-typing-dot"></span>
        <span class="najm-typing-dot"></span>
      </div>
    `;
    chatMessages.appendChild(ind);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideTypingIndicator() {
    const ind = document.getElementById('najmTypingIndicator');
    if (ind) ind.remove();
  }

  async function sendMessage(text, imagePayload = null) {
    if (!text && !imagePayload) return;
    openChatModal();
    appendMessage('user', text || '📷 [صورة مرفقة للتحليل]', { imageUrl: imagePayload?.url });

    showTypingIndicator();

    try {
      const res = await fetch('/api/ai/customer-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-id': guestId
        },
        body: JSON.stringify({
          message: text,
          sessionId,
          guestId,
          image: imagePayload
        })
      });

      const data = await res.json();
      hideTypingIndicator();

      if (data.success) {
        appendMessage('assistant', data.answer, {
          products: data.products,
          draftOrder: data.draftOrder,
          tracking: data.tracking,
          quickActions: data.quickActions
        });
      } else {
        appendMessage('assistant', data.error || 'عذراً، حدث خطأ مؤقت. يرجى المحاولة بعد قليل.');
      }
    } catch (err) {
      hideTypingIndicator();
      appendMessage('assistant', 'تعذر الاتصال بالخادم حالياً. يرجى التحقق من اتصالك بالإنترنت.');
    }
  }

  // Global Interactive Controller API
  window.NajmClient = {
    // Stepper Quantity Handler
    adjustCardQty: function(productId, delta) {
      const els = [document.getElementById(`qty-${productId}`), document.getElementById(`qty-chat-${productId}`)].filter(Boolean);
      els.forEach(el => {
        let current = parseInt(el.textContent || '1', 10);
        let next = Math.max(1, Math.min(current + delta, 50));
        el.textContent = next;
      });
    },

    // Add To Cart hooked into Store Cart & Backend
    addToCart: async function(productId) {
      try {
        const qtyEl = document.getElementById(`qty-chat-${productId}`) || document.getElementById(`qty-${productId}`);
        const qty = qtyEl ? parseInt(qtyEl.textContent || '1', 10) : 1;

        let productObj = null;
        if (window.PRODUCTS_DB) {
          productObj = window.PRODUCTS_DB.find(x => String(x.id) === String(productId) || String(x.product_id || '') === String(productId));
        }
        if (!productObj) {
          productObj = { id: productId, product_id: productId };
        }

        // 1. If window.ZFB.Cart exists, use it directly (it syncs local store, sends GUEST_ID, updates SQLite)
        if (window.ZFB && window.ZFB.Cart) {
          await window.ZFB.Cart.add(productObj, qty);
        } else {
          // Direct API fallback
          await fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-guest-id': guestId },
            body: JSON.stringify({ productId, quantity: qty, guestId })
          });
        }

        playChime(780, 0.2);

        // Update Button UI feedback
        const btns = [document.getElementById(`btn-chat-add-${productId}`), document.getElementById(`btn-add-${productId}`)].filter(Boolean);
        btns.forEach(btn => {
          btn.classList.add('added');
          btn.innerHTML = '✓ تمت الإضافة';
          setTimeout(() => {
            btn.classList.remove('added');
            btn.innerHTML = '🛒 أضف للسلة';
          }, 2200);
        });

        // Broadcast state changes across global mobile header & bottom bar
        window.dispatchEvent(new CustomEvent('zfb-state-change'));
        window.dispatchEvent(new CustomEvent('zfb-cart-updated'));

        // Update header cart badges directly
        document.querySelectorAll('.zfb-mobile-cart-count, .cart-badge-count, #najmCartCount, .cart b').forEach(b => {
          const current = parseInt(b.textContent || '0', 10);
          b.textContent = current + qty;
          b.hidden = false;
          b.style.display = 'inline-block';
        });

        if (window.ZFB && window.ZFB.Notification) {
          window.ZFB.Notification.show(`تمت إضافة (${qty}) إلى سلة التسوق بنجاح!`, 'success');
        }
      } catch (err) {
        console.error('Add to cart error:', err);
      }
    },

    toggleWishlist: function(productId, btn) {
      if (btn) btn.classList.toggle('active');
      playChime(640, 0.1);
      if (window.ZFB && window.ZFB.Wishlist) {
        try {
          window.ZFB.Wishlist.toggle({ id: productId });
        } catch (_) {}
      }
    },

    sendPrompt: function(promptText) {
      sendMessage(promptText);
    },

    confirmOrder: async function(draftToken) {
      try {
        const res = await fetch('/api/ai/confirm-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-guest-id': guestId },
          body: JSON.stringify({ draftToken, sessionId, guestId })
        });
        const data = await res.json();
        if (data.success) {
          appendMessage('assistant', `🎉 ${data.message}\nيمكنك متابعة شحنتك عبر: ${data.trackingUrl}`);
        } else {
          appendMessage('assistant', data.error || 'تعذر تأكيد الطلب.');
        }
      } catch (err) {
        appendMessage('assistant', 'حدث خطأ أثناء تأكيد الطلب.');
      }
    }
  };

  // Event Listeners
  if (heroForm) {
    heroForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = heroInput.value.trim();
      if (val) {
        heroInput.value = '';
        sendMessage(val);
      }
    });
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = chatInput.value.trim();
      if (val) {
        chatInput.value = '';
        sendMessage(val);
      }
    });
  }

  if (closeChatBtn) {
    closeChatBtn.addEventListener('click', closeChatModal);
  }

  if (uploadPillBtn && visionFileInput) {
    uploadPillBtn.addEventListener('click', () => visionFileInput.click());
  }
  if (modalCameraBtn && visionFileInput) {
    modalCameraBtn.addEventListener('click', () => visionFileInput.click());
  }

  if (visionFileInput) {
    visionFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('image', file);
      visionFileInput.value = '';

      openChatModal();
      appendMessage('user', '⏳ جاري رفع الصورة وضغطها...');

      try {
        const res = await fetch('/api/ai/upload-image', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          sendMessage('حلل هذه الصورة واقترح منتجات متطابقة من كتالوج المتجر', {
            url: data.imageUrl,
            base64: data.base64,
            mimeType: data.mimeType
          });
        } else {
          appendMessage('assistant', data.error || 'فشل معالجة الصورة.');
        }
      } catch (err) {
        appendMessage('assistant', 'تعذر رفع الصورة حالياً.');
      }
    });
  }

  if (pillsRow) {
    pillsRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.najm-pill-btn');
      if (btn && btn.dataset.prompt) {
        sendMessage(btn.dataset.prompt);
      }
    });
  }

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggleBtn.style.opacity = soundEnabled ? '1' : '0.4';
    });
  }

  // FAQ Accordion
  document.querySelectorAll('.najm-faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.najm-faq-item');
      if (item) item.classList.toggle('active');
    });
  });

  // Init
  loadRecommendations();

  // Initial friendly welcome message inside chat modal on first launch
  setTimeout(() => {
    if (chatMessages && chatMessages.children.length === 0) {
      appendMessage('assistant', 'مرحباً بك! أنا **نجم**، مستشارك الخاص في متجر زياد للتجارة 🌟\nكيف يمكنني مساعدتك اليوم؟ يمكنك سؤالي عن أي منتج، طلب مقارنة، معرفة الأسعار والخصومات، أو إرسال صورة وسأساعدك فوراً.', {
        quickActions: [
          { label: '📦 حالة الطلب', prompt: 'أين طلبي؟ وكيف أعرف حالته؟' },
          { label: '🎁 أفضل العروض', prompt: 'ما هي أفضل العروض والخصومات المتاحة اليوم؟' },
          { label: '🛋️ غرف نوم ومجالس', prompt: 'ما هي خيارات غرف النوم والمجالس المتوفرة؟' },
          { label: '⚡ طاقة شمسية', prompt: 'أريد منظومة طاقة شمسية مناسبة' }
        ]
      });
    }
  }, 100);

})();