/**
 * Admin panel CSRF-aware fetch wrapper.
 *
 * Why this exists
 * ---------------
 * Every admin route below `router.use(csrfProtection)` rejects a write that
 * carries no CSRF token. The rejection used to be an HTTP redirect to an HTML
 * page, which the browser transparently followed -- so a caller doing
 * `await res.json()` got a chunk of HTML and threw:
 *
 *     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 *
 * The visual editor (save draft / publish / undo / rollback), the theme
 * builder's save, the media library's delete and the page builder's writes all
 * sent no token, so all of them failed with that same misleading message and
 * looked to the operator like "the editor is simply broken".
 *
 * Rather than thread a token through every call site by hand -- and rely on
 * whoever adds the next call site remembering -- this wraps `window.fetch`
 * once. It attaches the token to same-origin, state-changing requests that
 * don't already carry one, and leaves everything else untouched:
 *   - GET/HEAD/OPTIONS pass through unchanged
 *   - cross-origin requests pass through unchanged (never leak the token)
 *   - a call that already sets x-csrf-token keeps its own value
 *   - FormData bodies are left alone; the header carries the token
 *
 * It also turns the two server refusals that mean "your session is stale"
 * (401 AUTH_REQUIRED, 403 CSRF_TOKEN_INVALID) into a plain Arabic message
 * instead of a parse error, so the cause is legible the next time it happens.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (window.__ZFB_CSRF_FETCH_INSTALLED__) return;
  window.__ZFB_CSRF_FETCH_INSTALLED__ = true;

  var SAFE_METHODS = { GET: 1, HEAD: 1, OPTIONS: 1 };
  var nativeFetch = window.fetch.bind(window);

  function token() {
    return window.ZFB_ADMIN_CSRF || '';
  }

  function isSameOrigin(input) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!url) return true;
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch (e) {
      // An unparseable URL is almost certainly a relative path.
      return true;
    }
  }

  function headerAlreadySet(headers) {
    if (!headers) return false;
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return headers.has('x-csrf-token') || headers.has('x-xsrf-token');
    }
    if (Array.isArray(headers)) {
      return headers.some(function (pair) {
        var k = String(pair && pair[0] || '').toLowerCase();
        return k === 'x-csrf-token' || k === 'x-xsrf-token';
      });
    }
    return Object.keys(headers).some(function (k) {
      var lower = k.toLowerCase();
      return lower === 'x-csrf-token' || lower === 'x-xsrf-token';
    });
  }

  function withToken(headers, value) {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      headers.set('x-csrf-token', value);
      return headers;
    }
    if (Array.isArray(headers)) {
      return headers.concat([['x-csrf-token', value]]);
    }
    var out = Object.assign({}, headers || {});
    out['x-csrf-token'] = value;
    return out;
  }

  window.fetch = function (input, init) {
    init = init || {};

    var method = String(
      init.method || (input && typeof input !== 'string' && input.method) || 'GET'
    ).toUpperCase();

    var value = token();

    if (
      value &&
      !SAFE_METHODS[method] &&
      isSameOrigin(input) &&
      !headerAlreadySet(init.headers)
    ) {
      init = Object.assign({}, init, { headers: withToken(init.headers, value) });
      // Same-origin already sends cookies by default, but being explicit means
      // a future caller copying this pattern doesn't lose the session.
      if (!init.credentials) init.credentials = 'same-origin';
    }

    return nativeFetch(input, init).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        // Peek at the body without consuming the caller's copy.
        var clone = res.clone();
        clone
          .json()
          .then(function (data) {
            if (!data) return;
            if (data.code === 'CSRF_TOKEN_INVALID' || data.code === 'AUTH_REQUIRED') {
              if (typeof window.ZFB_ON_SESSION_EXPIRED === 'function') {
                window.ZFB_ON_SESSION_EXPIRED(data);
              } else {
                window.alert(data.message || 'انتهت صلاحية الجلسة. حدّث الصفحة ثم أعد المحاولة.');
              }
            }
          })
          .catch(function () { /* not a JSON body; leave it to the caller */ });
      }
      return res;
    });
  };
})();
