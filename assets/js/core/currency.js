/**
 * ZFB Core Currency System
 * Handles Global Currency conversion (1 SAR = 140 YER) and rendering safely.
 */
(function() {
  const CURRENCY_KEY = 'zfb_currency';
  const FIXED_EXCHANGE_RATE = 140; // Fixed Rule: 1 SAR = 140 YER
  let currentCurrency = localStorage.getItem(CURRENCY_KEY) || 'YER';

  window.ZFB_CONFIG = window.ZFB_CONFIG || {};
  window.ZFB_CONFIG.exchangeRate = FIXED_EXCHANGE_RATE;

  function getExchangeRate() {
    return Number(window.ZFB_CONFIG.exchangeRate) || FIXED_EXCHANGE_RATE;
  }

  function parseArabicNumber(str) {
    if (!str) return 0;
    const arabicNumbers = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
    let numStr = String(str);
    for (let i = 0; i < 10; i++) {
      numStr = numStr.replace(arabicNumbers[i], i);
    }
    const parsed = parseFloat(numStr.replace(/[^\d.]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }

  function formatCurrency(amount, currency) {
    const rounded = Math.round(Number(amount) || 0);
    const formattedNum = rounded.toLocaleString('ar-YE');
    return currency === 'SAR' ? `${formattedNum} ر.س` : `${formattedNum} ر.ي`;
  }

  function convertPrice(baseSarValue, targetCurrency) {
    const val = Number(baseSarValue) || 0;
    if (targetCurrency === 'SAR') return val;
    return val * getExchangeRate();
  }

  function tagPrices(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (text && (text.includes('ر.س') || text.includes('ر.ي'))) {
        const parent = node.parentElement;
        // ONLY tag parent if it is a leaf element (no HTML element children)
        if (parent && parent.children.length === 0 && !parent.hasAttribute('data-base-sar')) {
          const value = parseArabicNumber(text);
          if (value > 0) {
            const baseSar = text.includes('ر.ي') ? (value / getExchangeRate()) : value;
            parent.setAttribute('data-base-sar', baseSar);
          }
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
      
      // If container has data-price attribute, tag its specific price child, NEVER the whole container
      if (node.dataset && node.dataset.price) {
        const pVal = parseFloat(node.dataset.price);
        if (!isNaN(pVal) && pVal > 0) {
          const priceDisplay = node.querySelector('[data-field="price"], .price strong, .current, .price-amount');
          if (priceDisplay && priceDisplay.children.length === 0 && !priceDisplay.hasAttribute('data-base-sar')) {
            priceDisplay.setAttribute('data-base-sar', pVal);
          } else if (node.children.length === 0 && !node.hasAttribute('data-base-sar')) {
            node.setAttribute('data-base-sar', pVal);
          }
        }
      }

      /* The struck-through old price is printed as a bare number with no
         currency symbol, so neither branch above ever saw it: the card ended up
         showing a converted current price beside an unconverted old one --
         "٥٢٬٦٤٠ ر.ي" struck through with "6,260". Prices are stored in SAR, so
         a bare number here is a SAR amount and converts like any other. */
      if (node.tagName === 'DEL' && node.children.length === 0 && !node.hasAttribute('data-base-sar')) {
        const oldText = node.textContent || '';
        /* A del that already carries a symbol is handled by the text-node
           branch below, which knows which currency it is written in. */
        if (!oldText.includes('ر.س') && !oldText.includes('ر.ي')) {
          const oldVal = parseArabicNumber(oldText);
          if (oldVal > 0) node.setAttribute('data-base-sar', oldVal);
        }
      }

      node.childNodes.forEach(tagPrices);
    }
  }

  function renderPrices(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // ONLY replace textContent of leaf elements
      if (node.hasAttribute('data-base-sar') && node.children.length === 0) {
        const baseSar = parseFloat(node.getAttribute('data-base-sar'));
        if (!isNaN(baseSar)) {
          const newPrice = convertPrice(baseSar, currentCurrency);
          node.textContent = formatCurrency(newPrice, currentCurrency);
        }
      }
      node.childNodes.forEach(renderPrices);
    }
  }

  function applyCurrency() {
    tagPrices(document.body);
    renderPrices(document.body);
  }

  function setCurrency(currency) {
    if (currency !== 'YER' && currency !== 'SAR') return;
    currentCurrency = currency;
    localStorage.setItem(CURRENCY_KEY, currency);
    applyCurrency();
    window.dispatchEvent(new CustomEvent('zfb-currency-change', {
      detail: { currency: currentCurrency, exchangeRate: getExchangeRate() }
    }));
  }

  window.ZFB_CURRENCY = {
    getCurrency: () => currentCurrency,
    getExchangeRate,
    setCurrency,
    convertPrice: (baseSarValue) => convertPrice(baseSarValue, currentCurrency),
    format: (baseSarValue) => formatCurrency(convertPrice(baseSarValue, currentCurrency), currentCurrency),
    applyCurrency
  };

  document.addEventListener('DOMContentLoaded', () => {
    applyCurrency();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            tagPrices(node);
            renderPrices(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });

})();
