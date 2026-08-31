/**
 * Zeyad For Business - Visual Editor Client
 * Injected into the iframe preview to allow point-and-click editing with live bidirectional updates.
 */

/**
 * getComputedStyle reports colours as "rgb(r, g, b)" / "rgba(r, g, b, a)".
 * <input type="color"> only accepts #rrggbb and quietly shows black for
 * anything else, so convert before sending the value to the panel.
 */
function toHex(cssColor) {
  if (!cssColor) return '';
  const m = String(cssColor).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return /^#[0-9a-f]{6}$/i.test(cssColor) ? cssColor : '';
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
}

/** A fully transparent background has no meaningful colour to show. */
function isTransparent(cssColor) {
  if (!cssColor) return true;
  if (cssColor === 'transparent') return true;
  const m = String(cssColor).match(/rgba\(\s*\d+[,\s]+\d+[,\s]+\d+[,\s]+([\d.]+)\s*\)/i);
  return !!(m && Number(m[1]) === 0);
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('[ZFB Visual CMS] Client initialized in preview iframe.');

  // Disable default link navigation inside editor so clicks select elements
  document.querySelectorAll('a').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
    });
  });

  const editableElements = document.querySelectorAll('[data-vid]');

  editableElements.forEach(el => {
    el.classList.add('visual-cms-element');

    el.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.visual-cms-hover').forEach(h => h.classList.remove('visual-cms-hover'));
      el.classList.add('visual-cms-hover');
    });

    el.addEventListener('mouseleave', () => {
      el.classList.remove('visual-cms-hover');
    });

    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      document.querySelectorAll('.visual-cms-active').forEach(a => a.classList.remove('visual-cms-active'));
      el.classList.add('visual-cms-active');

      const computed = window.getComputedStyle(el);
      const tag = el.tagName.toUpperCase();
      let elementType = 'text';

      if (tag === 'IMG') {
        elementType = 'image';
      } else if (tag === 'BUTTON' || (tag === 'A' && el.classList.contains('btn'))) {
        elementType = 'button';
      } else if (tag === 'SECTION' || el.classList.contains('section') || el.classList.contains('hero')) {
        elementType = 'section';
      } else if (el.style.backgroundImage || computed.backgroundImage !== 'none') {
        elementType = 'background';
      } else if (tag === 'A') {
        elementType = 'link';
      }

      const payload = {
        vid: el.getAttribute('data-vid'),
        tagName: tag,
        elementType: elementType,
        text: el.innerText ? el.innerText.trim() : '',
        html: el.innerHTML ? el.innerHTML.trim() : '',
        src: el.src || el.getAttribute('src') || '',
        alt: el.alt || el.getAttribute('alt') || '',
        href: el.href || el.getAttribute('href') || '',
        styles: {
          // Colours are handed over as #rrggbb as well as raw, because
          // <input type="color"> silently falls back to #000000 when given the
          // rgb() string getComputedStyle returns -- which made every colour
          // picker in the panel open on black regardless of the real colour.
          color: computed.color,
          colorHex: toHex(computed.color),
          backgroundColor: computed.backgroundColor,
          backgroundColorHex: toHex(computed.backgroundColor),
          backgroundIsTransparent: isTransparent(computed.backgroundColor),
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          textAlign: computed.textAlign,
          lineHeight: computed.lineHeight,
          padding: computed.padding,
          margin: computed.margin,
          borderRadius: computed.borderRadius
        }
      };

      window.parent.postMessage({ type: 'ELEMENT_SELECTED', payload }, '*');
    });
  });

  // Listen for live updates from parent editor
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || !data.type) return;

    if (data.type === 'UPDATE_ELEMENT') {
      const { vid, prop, value, styles, device } = data.payload;
      const el = document.querySelector(`[data-vid="${vid}"]`);
      if (!el) return;

      if (prop === 'text') {
        el.innerText = value;
      } else if (prop === 'html') {
        el.innerHTML = value;
      } else if (prop === 'src') {
        el.src = value;
      } else if (prop === 'alt') {
        el.alt = value;
      } else if (prop === 'href') {
        el.href = value;
      } else if (prop === 'bg-image') {
        el.style.backgroundImage = value ? `url('${value}')` : 'none';
      }

      if (styles) {
        for (const [k, v] of Object.entries(styles)) {
          if (v !== undefined && v !== null && v !== '') {
            el.style[k] = v;
          }
        }
      }
    }
  });
});
