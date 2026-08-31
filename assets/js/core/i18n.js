/**
 * ZFB Core i18n System
 * Centralized translation manager.
 */
(function() {
  const LANG_KEY = 'zfb_lang';
  let currentLang = localStorage.getItem(LANG_KEY) || 'ar'; // Default to Arabic

  const dict = window.ZFB_TRANSLATIONS || {};
  
  // Create reverse dictionary for English -> Arabic fallback if needed
  const reverseDict = {};
  for (const [ar, en] of Object.entries(dict)) {
    reverseDict[en] = ar;
  }

  function getTranslation(text, toLang) {
    const trimmed = text.trim();
    if (!trimmed) return text;
    
    if (toLang === 'en') {
      if (dict[trimmed]) return text.replace(trimmed, dict[trimmed]);
    } else {
      if (reverseDict[trimmed]) return text.replace(trimmed, reverseDict[trimmed]);
    }
    return text;
  }

  // Translates text nodes within an element
  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE') return;
      
      const originalText = node.nodeValue;
      if (!originalText.trim()) return;

      // Store original Arabic text on the parent element if not already stored
      if (!node.parentElement.hasAttribute('data-original-ar')) {
        // Only store if we are currently translating to English and the text is Arabic
        if (currentLang === 'en' && dict[originalText.trim()]) {
           node.parentElement.setAttribute('data-original-ar', originalText.trim());
        }
      }

      const translated = getTranslation(originalText, currentLang);
      if (translated !== originalText) {
        node.nodeValue = translated;
      } else if (currentLang === 'ar' && node.parentElement.hasAttribute('data-original-ar')) {
        // Restore Arabic if we stored it
        const arText = node.parentElement.getAttribute('data-original-ar');
        if (arText) {
           node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), arText);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Translate attributes
      if (node.hasAttribute('placeholder')) {
        const p = node.getAttribute('placeholder');
        const tp = getTranslation(p, currentLang);
        if (tp !== p) node.setAttribute('placeholder', tp);
      }
      
      node.childNodes.forEach(translateNode);
    }
  }

  function applyTranslations() {
    // Update HTML dir and lang
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

    translateNode(document.body);
  }

  function setLanguage(lang) {
    if (lang !== 'ar' && lang !== 'en') return;
    currentLang = lang;
    localStorage.setItem(LANG_KEY, lang);
    applyTranslations();
  }

  // Expose API
  window.ZFB_I18N = {
    getLang: () => currentLang,
    setLang: setLanguage,
    translate: (text) => getTranslation(text, currentLang)
  };

  // Run on DOM Content Loaded
  document.addEventListener('DOMContentLoaded', () => {
    if (currentLang === 'en') {
      applyTranslations();
    }

    // Setup Mutation Observer for dynamically added elements (like cart updates)
    const observer = new MutationObserver((mutations) => {
      let shouldTranslate = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
               translateNode(node);
            }
          });
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });

})();
