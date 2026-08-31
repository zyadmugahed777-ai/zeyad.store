/**
 * ZFB Core Theme System
 * Handles Global Dark Mode and persistent preferences.
 */
(function() {
  const THEME_KEY = 'zfb_theme';

  function ensureProductionPolishStylesheet() {

    // ------------------------------------------------------------------
    // Only add the stylesheet if the page genuinely lacks it.
    //
    // The old guard looked exclusively for this function's own marker
    // attribute, so it never noticed the <link> every one of the 71 pages
    // already carries in its <head> -- and appended a second copy on every
    // single page load. Three consequences, all of them real:
    //
    //   - a wasted request and a second 90KB parse of the same rules, on
    //     every page view;
    //   - the injected href is pinned to a hand-written July stamp, so
    //     bump-cache.js could never refresh it -- edits to that stylesheet
    //     did not reach anyone through this copy;
    //   - it is appended last, so it WINS the cascade. A stale July copy
    //     sitting in a browser cache silently overrode the fresh stylesheet
    //     loaded from <head>, which is exactly how "the CSS fix works on my
    //     machine and not on theirs" happens.
    //
    // Matching on the href is what the guard should always have done: the
    // question is "is this stylesheet on the page", not "did I put it there".
    // ------------------------------------------------------------------
    if (document.querySelector('link[rel="stylesheet"][href*="production-polish.css"]')) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // No version stamp: this path is now only reached by a page that omits the
    // stylesheet entirely, and a hardcoded stamp here is what went stale last
    // time. The server's Cache-Control still applies.
    link.href = 'production-polish.css';
    link.dataset.zfbProductionPolish = 'true';
    document.head.appendChild(link);
  }

  function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      // Theme switching must still work when browser storage is unavailable.
    }
  }

  function applyTheme(theme) {
    ensureProductionPolishStylesheet();
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    
    if (document.body) {
      if (isDark) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
      } else {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
      }
    }

    // Sync all theme toggle icons across page
    const toggles = document.querySelectorAll('.theme-toggle-btn, [data-mobile-theme-toggle]');
    toggles.forEach(btn => {
      const iconWrap = btn.querySelector('[data-mobile-theme-icon]');
      const sunSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
      const moonSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      if (iconWrap) {
        iconWrap.innerHTML = isDark ? sunSvg : moonSvg;
      } else if (btn.classList.contains('theme-toggle-btn') || btn.classList.contains('icon-link')) {
        btn.innerHTML = isDark ? sunSvg : moonSvg;
      }
    });

    // Broadcast theme change event site-wide
    window.dispatchEvent(new CustomEvent('zfb-theme-change', { detail: { theme: isDark ? 'dark' : 'light' } }));
  }

  // Force Light Mode as original default theme
  let currentTheme = readStoredTheme();
  if (!currentTheme) {
    currentTheme = 'light';
    saveTheme('light');
  }

  // Clear any dark theme cache override
  try {
    localStorage.removeItem('zfb_theme_css');
  } catch(e) {}

  // Apply immediately to ensure original light brand theme renders
  applyTheme(currentTheme);

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(currentTheme);
  });

  function setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    currentTheme = theme;
    saveTheme(theme);
    applyTheme(theme);
    
    // Update toggle UI if exists
    const toggles = document.querySelectorAll('.theme-toggle-btn');
    toggles.forEach(btn => {
      btn.innerHTML = theme === 'dark' 
        ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    });
  }

  window.ZFB_THEME = {
    getTheme: () => currentTheme,
    setTheme,
    toggle: () => setTheme(currentTheme === 'dark' ? 'light' : 'dark')
  };

  // Listen for system changes
  const themeMediaQuery = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (themeMediaQuery && themeMediaQuery.addEventListener) {
    themeMediaQuery.addEventListener('change', e => {
      if (!readStoredTheme()) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

})();
