/**
 * ZFB Customer Authentication -- browser side.
 *
 * The rule this file exists to enforce: the SERVER decides who you are.
 *
 * The previous version treated localStorage['zfb_user'] as the session. It
 * wrote a made-up id ('CUS-' + Date.now()), it fell back to a purely local
 * "logged in" state when the network call failed, and every page then read
 * that object to decide what to show and whose data to ask for. Anyone could
 * open the console, write a different phone number into it, and the site
 * treated them as that person.
 *
 * Now: the httpOnly session cookie is the credential, /api/auth/me is the only
 * source of truth, and localStorage holds nothing but a display cache used to
 * paint the header before that call returns. Nothing is ever authorized on the
 * strength of what is in the cache -- the server re-checks every request, and
 * the cache is dropped the moment the server says the session is gone.
 */
(function () {
  const CACHE_KEY = 'zfb_user';

  // Resolves to the current customer (or null). Kept as one shared promise so
  // ten widgets calling refresh() on the same page make one request, not ten.
  let inflight = null;
  let current = null;
  let hydrated = false;

  function readCache() {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(user) {
    try {
      if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
      else localStorage.removeItem(CACHE_KEY);
    } catch (_) {
      // Private mode, or storage full. The site must keep working: the cache
      // is an optimisation, never the session.
    }
  }

  function announce(user) {
    current = user;
    writeCache(user);
    const detail = { user };
    window.dispatchEvent(new CustomEvent('zfb-auth-change', { detail }));
    window.dispatchEvent(new CustomEvent('zfb-state-change', { detail: { key: CACHE_KEY, value: user } }));
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON error page */ }

    if (!res.ok || (data && data.success === false)) {
      const err = new Error((data && data.error) || 'تعذر إتمام العملية، حاول مرة أخرى');
      err.status = res.status;
      err.field = data && data.field;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  /**
   * Ask the server who we are. This is the only function that can make
   * someone "logged in".
   */
  async function refresh() {
    if (inflight) return inflight;

    inflight = (async () => {
      try {
        const data = await api('/api/auth/me');
        const user = (data && data.authenticated && data.data) ? data.data : null;
        hydrated = true;
        announce(user);
        return user;
      } catch (_) {
        // A network failure means "unknown", not "logged in". Deliberately
        // NOT falling back to the cache: doing so is exactly how the old code
        // let a hand-edited localStorage entry pass for a session.
        hydrated = true;
        announce(null);
        return null;
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }

  /**
   * The cached customer, for painting the UI immediately on page load.
   *
   * Callers rendering a signed-in view should still await ready(); this is the
   * fast, provisional answer, not an authorization decision.
   */
  function getUser() {
    return hydrated ? current : (current || readCache());
  }

  function isLoggedIn() {
    const user = getUser();
    return Boolean(user && user.id);
  }

  /** Resolves once the server has been asked at least once. */
  function ready() {
    if (hydrated && !inflight) return Promise.resolve(current);
    return refresh();
  }

  async function mergeGuestData() {
    try {
      const guestId = window.ZFB_GUEST_ID
        || (window.localStorage && localStorage.getItem('zfb_guest_id'))
        || null;

      if (window.ZFB && window.ZFB.Cart && window.ZFB.Cart.merge) await window.ZFB.Cart.merge();
      else if (guestId) await api('/api/cart/merge', { method: 'POST', body: JSON.stringify({ guestId }) });

      if (window.ZFB && window.ZFB.Wishlist && window.ZFB.Wishlist.merge) await window.ZFB.Wishlist.merge();
      else if (guestId) await api('/api/wishlist/merge', { method: 'POST', body: JSON.stringify({ guestId }) });
    } catch (_) {
      // A basket that failed to merge is a nuisance, not a reason to fail the
      // sign-in that just succeeded.
    }
  }

  /**
   * Sign in with phone + password. No OTP, no verification step.
   */
  async function login({ phone, password }) {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: String(phone || '').trim(), password: String(password || '') })
    });

    hydrated = true;
    announce(data.data);
    await mergeGuestData();
    return data.data;
  }

  /**
   * Create an account: name, phone, password, confirm password. The server
   * signs the customer in as part of the same request.
   */
  async function register({ name, phone, password, confirmPassword }) {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: String(name || '').trim(),
        phone: String(phone || '').trim(),
        password: String(password || ''),
        confirmPassword: String(confirmPassword || '')
      })
    });

    hydrated = true;
    announce(data.data);
    await mergeGuestData();
    return data.data;
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch (_) {
      // Even if the call fails, drop the local view of the session so the UI
      // never shows a signed-in state the server will not honour.
    }

    hydrated = true;
    announce(null);

    if (window.location.pathname.includes('account')) {
      window.location.href = 'index.html';
    }
  }

  /**
   * Update the signed-in customer's own profile. The phone number is the
   * account identity and is not editable here -- the server ignores it.
   */
  async function updateProfile(profileData) {
    const data = await api('/api/auth/profile', {
      method: 'POST',
      body: JSON.stringify({
        name: profileData.name,
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        email: profileData.email,
        city: profileData.city,
        district: profileData.district,
        addressDetail: profileData.addressDetail
      })
    });

    announce(data.data);
    return data.data;
  }

  /**
   * The sign-in / sign-up modal used from the header and from checkout.
   * Shares its markup and behaviour with the حسابي page card via
   * window.ZFB_AUTH.buildAuthCard().
   */
  function openAuthModal(options = {}) {
    let modal = document.getElementById('zfb-auth-modal');
    if (modal) {
      modal.classList.add('show');
      return;
    }

    injectStyles();

    modal = document.createElement('div');
    modal.id = 'zfb-auth-modal';
    modal.className = 'zfb-auth-backdrop';

    const card = document.createElement('div');
    card.className = 'zfb-auth-card zfb-auth-card--modal';
    card.appendChild(buildAuthCard({
      mode: options.mode || 'login',
      onSuccess: () => {
        modal.classList.remove('show');
        if (typeof options.onSuccess === 'function') options.onSuccess();
      }
    }));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'zfb-auth-close';
    close.setAttribute('aria-label', 'إغلاق');
    close.innerHTML = '&times;';
    close.addEventListener('click', () => modal.classList.remove('show'));
    card.appendChild(close);

    modal.appendChild(card);
    document.body.appendChild(modal);

    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') modal.classList.remove('show');
    });

    requestAnimationFrame(() => modal.classList.add('show'));
  }

  /**
   * Build the two-tab sign-in / sign-up form.
   *
   * Returned as a detached element so the same component serves both the
   * حسابي page and the modal -- one form to keep correct, one set of error
   * messages, one place where the API contract lives.
   *
   * @param {{mode?: 'login'|'register', onSuccess?: Function}} options
   * @returns {HTMLElement}
   */
  function buildAuthCard(options = {}) {
    injectStyles();

    const root = document.createElement('div');
    root.className = 'zfb-auth';
    root.innerHTML = `
      <div class="zfb-auth-head">
        <div class="zfb-auth-mark" aria-hidden="true">ز</div>
        <h2 class="zfb-auth-title">حسابي</h2>
        <p class="zfb-auth-sub">سجّل دخولك لمتابعة طلباتك وحفظ سلتك ومفضلتك</p>
      </div>

      <div class="zfb-auth-tabs" role="tablist">
        <button type="button" class="zfb-auth-tab is-active" role="tab" data-tab="login" aria-selected="true">تسجيل الدخول</button>
        <button type="button" class="zfb-auth-tab" role="tab" data-tab="register" aria-selected="false">إنشاء حساب</button>
      </div>

      <form class="zfb-auth-form" data-form="login" novalidate>
        <div class="zfb-auth-field">
          <label for="zfb-login-phone">رقم الهاتف</label>
          <input type="tel" id="zfb-login-phone" name="phone" inputmode="tel" dir="ltr"
                 autocomplete="tel" placeholder="مثال: 775010726" required>
        </div>
        <div class="zfb-auth-field">
          <label for="zfb-login-password">كلمة المرور</label>
          <input type="password" id="zfb-login-password" name="password"
                 autocomplete="current-password" placeholder="كلمة المرور" required>
        </div>
        <p class="zfb-auth-error" data-error hidden></p>
        <button type="submit" class="zfb-auth-submit">تسجيل الدخول</button>
        <p class="zfb-auth-switch">ليس لديك حساب؟ <button type="button" data-goto="register">إنشاء حساب</button></p>
      </form>

      <form class="zfb-auth-form" data-form="register" hidden novalidate>
        <div class="zfb-auth-field">
          <label for="zfb-reg-name">الاسم</label>
          <input type="text" id="zfb-reg-name" name="name" autocomplete="name"
                 placeholder="مثال: عبدالله محمد" required>
        </div>
        <div class="zfb-auth-field">
          <label for="zfb-reg-phone">رقم الهاتف</label>
          <input type="tel" id="zfb-reg-phone" name="phone" inputmode="tel" dir="ltr"
                 autocomplete="tel" placeholder="مثال: 775010726" required>
        </div>
        <div class="zfb-auth-field">
          <label for="zfb-reg-password">كلمة المرور</label>
          <input type="password" id="zfb-reg-password" name="password"
                 autocomplete="new-password" placeholder="8 أحرف على الأقل" required minlength="8">
        </div>
        <div class="zfb-auth-field">
          <label for="zfb-reg-confirm">تأكيد كلمة المرور</label>
          <input type="password" id="zfb-reg-confirm" name="confirmPassword"
                 autocomplete="new-password" placeholder="أعد كتابة كلمة المرور" required minlength="8">
        </div>
        <p class="zfb-auth-error" data-error hidden></p>
        <button type="submit" class="zfb-auth-submit">إنشاء الحساب</button>
        <p class="zfb-auth-switch">لديك حساب بالفعل؟ <button type="button" data-goto="login">تسجيل الدخول</button></p>
      </form>
    `;

    const tabs = root.querySelectorAll('.zfb-auth-tab');
    const forms = {
      login: root.querySelector('[data-form="login"]'),
      register: root.querySelector('[data-form="register"]')
    };

    function show(mode) {
      tabs.forEach(t => {
        const active = t.dataset.tab === mode;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      forms.login.hidden = mode !== 'login';
      forms.register.hidden = mode !== 'register';
      const firstField = forms[mode].querySelector('input');
      if (firstField) firstField.focus();
    }

    tabs.forEach(tab => tab.addEventListener('click', () => show(tab.dataset.tab)));
    root.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => show(btn.dataset.goto));
    });

    function wire(form, submit) {
      const errorBox = form.querySelector('[data-error]');
      const button = form.querySelector('.zfb-auth-submit');
      const originalLabel = button.textContent;

      form.addEventListener('submit', async e => {
        e.preventDefault();
        errorBox.hidden = true;
        errorBox.textContent = '';
        form.querySelectorAll('input').forEach(i => i.removeAttribute('aria-invalid'));

        button.disabled = true;
        button.textContent = 'جارٍ المعالجة…';

        try {
          await submit(Object.fromEntries(new FormData(form).entries()));
          if (typeof options.onSuccess === 'function') options.onSuccess();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          if (err.field) {
            const field = form.querySelector(`[name="${err.field}"]`);
            if (field) {
              field.setAttribute('aria-invalid', 'true');
              field.focus();
            }
          }
        } finally {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      });
    }

    wire(forms.login, values => login(values));
    wire(forms.register, values => register(values));

    if (options.mode === 'register') show('register');

    return root;
  }

  function injectStyles() {
    if (document.getElementById('zfb-auth-styles')) return;

    const style = document.createElement('style');
    style.id = 'zfb-auth-styles';
    // Uses the storefront's own custom properties (--gold, --surface, --ink,
    // --line) with literal fallbacks, so the card inherits the ZeyadStore
    // identity on every page and in dark mode without shipping a second
    // palette.
    style.textContent = `
      .zfb-auth { max-width: 420px; margin: 0 auto; text-align: right; }
      .zfb-auth-head { text-align: center; margin-bottom: 20px; }
      .zfb-auth-mark {
        width: 52px; height: 52px; border-radius: 15px;
        background: var(--gold, #c38c35); color: #fff;
        font-size: 26px; font-weight: 800; line-height: 52px;
        display: inline-block; margin-bottom: 12px;
      }
      .zfb-auth-title { font-size: 1.35rem; font-weight: 800; margin: 0 0 6px; color: var(--ink, #111); }
      .zfb-auth-sub { margin: 0; font-size: 0.88rem; color: var(--ink-soft, #64748b); }

      .zfb-auth-tabs {
        display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        background: var(--surface-alt, #f1f5f9); border-radius: 12px;
        padding: 5px; margin-bottom: 20px;
      }
      .zfb-auth-tab {
        padding: 11px 8px; border: 0; border-radius: 9px; cursor: pointer;
        font-family: inherit; font-size: 0.94rem; font-weight: 700;
        background: transparent; color: var(--ink-soft, #64748b);
        transition: background 0.2s ease, color 0.2s ease;
      }
      .zfb-auth-tab.is-active {
        background: var(--surface, #fff); color: var(--gold, #c38c35);
        box-shadow: 0 1px 3px rgba(0,0,0,0.09);
      }

      .zfb-auth-field { margin-bottom: 14px; }
      .zfb-auth-field label {
        display: block; font-size: 0.85rem; font-weight: 700;
        margin-bottom: 6px; color: var(--ink, #111);
      }
      .zfb-auth-field input {
        width: 100%; height: 46px; padding: 0 14px; box-sizing: border-box;
        border-radius: 10px; border: 1px solid var(--line, #cbd5e1);
        background: var(--surface-alt, #fafafa); color: inherit;
        font-family: inherit; font-size: 0.95rem;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .zfb-auth-field input:focus {
        outline: none; border-color: var(--gold, #c38c35);
        box-shadow: 0 0 0 3px rgba(195,140,53,0.18);
      }
      .zfb-auth-field input[aria-invalid="true"] { border-color: #ef4444; }

      .zfb-auth-error {
        margin: 0 0 12px; padding: 10px 12px; border-radius: 9px;
        background: rgba(239,68,68,0.09); color: #dc2626;
        font-size: 0.85rem; font-weight: 600; text-align: center;
      }
      .zfb-auth-submit {
        width: 100%; height: 48px; border: 0; border-radius: 12px; cursor: pointer;
        background: var(--gold, #c38c35); color: #fff;
        font-family: inherit; font-size: 1rem; font-weight: 800;
        box-shadow: 0 4px 14px rgba(195,140,53,0.32);
        transition: filter 0.2s ease, transform 0.15s ease;
      }
      .zfb-auth-submit:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
      .zfb-auth-submit:disabled { opacity: 0.65; cursor: progress; transform: none; }

      .zfb-auth-switch {
        margin: 14px 0 0; text-align: center;
        font-size: 0.87rem; color: var(--ink-soft, #64748b);
      }
      .zfb-auth-switch button {
        background: none; border: 0; padding: 0; cursor: pointer;
        font-family: inherit; font-size: inherit; font-weight: 800;
        color: var(--gold, #c38c35); text-decoration: underline;
      }

      .zfb-auth-backdrop {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(5px);
        display: flex; align-items: center; justify-content: center; padding: 20px;
        opacity: 0; pointer-events: none; transition: opacity 0.22s ease;
      }
      .zfb-auth-backdrop.show { opacity: 1; pointer-events: auto; }
      .zfb-auth-card--modal {
        position: relative; width: 100%; max-width: 460px;
        max-height: 92vh; overflow-y: auto;
        background: var(--surface, #fff); border-radius: 20px; padding: 28px 24px;
        border: 1px solid var(--line, #e2e8f0);
        box-shadow: 0 24px 48px rgba(0,0,0,0.28);
      }
      .zfb-auth-close {
        position: absolute; top: 14px; left: 14px;
        width: 32px; height: 32px; border: 0; border-radius: 8px;
        background: transparent; color: var(--ink-soft, #94a3b8);
        font-size: 24px; line-height: 1; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  window.ZFB_AUTH = {
    getUser,
    isLoggedIn,
    ready,
    refresh,
    login,
    register,
    logout,
    updateProfile,
    openAuthModal,
    buildAuthCard
  };

  // Ask the server who we are as soon as the script loads, so every page has
  // a truthful answer without each one remembering to request it.
  refresh();
})();
