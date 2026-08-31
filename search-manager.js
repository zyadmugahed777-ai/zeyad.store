// Smart Search Manager

// ---------------------------------------------------------------------------
// HTML escaping for the suggestion markup built below.
//
// Product titles came straight from the API into innerHTML -- both as element
// text and inside the img alt="" attribute -- so a title containing markup
// executed as script on every page carrying the search box (56 of them).
// Self-contained on purpose: zfb-core.js is `defer`red on pages where this
// file is not, so a shared helper may not exist yet when this runs.
// ---------------------------------------------------------------------------
function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initSearchAutocomplete() {
  const searchInputs = document.querySelectorAll('.main-nav .search input, .search-bar input, input[type="search"], .mobile-search-input');
  
  searchInputs.forEach(input => {
    if (input.dataset.searchHooked) return;
    input.dataset.searchHooked = 'true';

    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.className = 'search-autocomplete-dropdown';
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(dropdown);

    const formatItemPrice = (sarPrice) => {
      const p = parseFloat(sarPrice) || 0;
      if (window.ZFB_CURRENCY && typeof window.ZFB_CURRENCY.format === 'function') {
        return window.ZFB_CURRENCY.format(p);
      }
      const curr = localStorage.getItem('zfb_currency') || 'YER';
      if (curr === 'SAR') {
        return `${Math.round(p).toLocaleString('ar-SA')} ر.س`;
      }
      const rate = (window.ZFB_CONFIG && window.ZFB_CONFIG.exchangeRate) || 140;
      return `${Math.round(p * rate).toLocaleString('ar-YE')} ر.ي`;
    };

    let debounceTimer;
    input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();
      
      if (query.length < 2) {
        dropdown.classList.remove('active');
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch('/api/products/search/suggestions?q=' + encodeURIComponent(query));
          const data = await res.json();
          
          if (data.success) {
            dropdown.innerHTML = '';
            
            const getCleanImg = (p) => {
              if (window.ZFB && window.ZFB.normalizeImagePath) return window.ZFB.normalizeImagePath(p.main_image);
              let src = (p.main_image || '').trim();
              if (!src) return '/assets/placeholder.svg';
              if (!src.startsWith('/') && !src.startsWith('http')) src = '/' + src;
              return src;
            };

            if (data.data && data.data.length > 0) {
              data.data.forEach(item => {
                dropdown.innerHTML += `<a href="/product.html?id=${encodeURIComponent(item.product_id == null ? '' : item.product_id)}" class="search-suggestion-item">
                  <img src="${escHtml(getCleanImg(item))}" alt="${escHtml(item.title || '')}" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
                  <div style="flex:1">
                    <div style="font-size:0.9rem;font-weight:700">${escHtml(item.title)}</div>
                    <div style="font-size:0.8rem;color:var(--gold,#c79a52)" data-base-sar="${escHtml(item.price)}">${escHtml(formatItemPrice(item.price))}</div>
                  </div>
                </a>`;
              });
            } else if (data.suggestions && data.suggestions.length > 0) {
              dropdown.innerHTML += `<div class="search-smart-notice">لم نجد تطابق تام، هل تقصد:</div>`;
              data.suggestions.forEach(item => {
                dropdown.innerHTML += `<a href="/product.html?id=${encodeURIComponent(item.product_id == null ? '' : item.product_id)}" class="search-suggestion-item">
                  <img src="${escHtml(getCleanImg(item))}" alt="${escHtml(item.title || '')}" onerror="this.onerror=null;this.src='/assets/placeholder.svg';">
                  <div style="flex:1">
                    <div style="font-size:0.9rem;font-weight:700">${escHtml(item.title)}</div>
                    <div style="font-size:0.8rem;color:var(--gold,#c79a52)" data-base-sar="${escHtml(item.price)}">${escHtml(formatItemPrice(item.price))}</div>
                  </div>
                </a>`;
              });
            } else {
              dropdown.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted)">لا توجد نتائج مطابقة</div>`;
            }
            dropdown.classList.add('active');
          }
        } catch(e) { console.error('Search error', e); }
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if (!input.parentNode.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', initSearchAutocomplete);
window.addEventListener('load', initSearchAutocomplete);
window.initSearchAutocomplete = initSearchAutocomplete;
