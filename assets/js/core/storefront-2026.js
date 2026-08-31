/* ==========================================================================
   ZeyadStore — Storefront 2026 behaviour layer
   --------------------------------------------------------------------------
   Runs on every storefront page, after the page's own scripts.

   1. normaliseCards()  — one card anatomy across static HTML, zfb-core.js,
                          search-page.js and the server-rendered catalogue.
   2. Category rail     — the bedroom category/style tiles and their filtering.

   Everything here is idempotent: it can run any number of times over the same
   DOM (a MutationObserver re-runs it whenever a grid is re-rendered) and will
   only ever do work once per card.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     1. PRODUCT CARD NORMALISER
     ---------------------------------------------------------------------
     The catalogue ships cards from four different generators. They agree on
     the outer shape (article.product-card > a.product-photo-link + .product-body)
     and disagree on everything inside it: some put the wishlist button over the
     photograph, some put it in the action row; the badge is appended to the
     photo link by premium-cards.js on some pages and printed into the price row
     on others; availability is sometimes a bare span that costs a whole line.

     Rather than rewrite the markup in 30 static files -- which would rewrite the
     data-vid attributes the visual CMS keys its saved edits on -- the structure
     is normalised here, in one place, at runtime.
     --------------------------------------------------------------------- */

  var BADGE_SEL = '.premium-badge, .discount-tag, .badge-discount, .badge-bestseller, .offer-badge';

  /* ---------------------------------------------------------------------
     Transparent product photography
     ---------------------------------------------------------------------
     A cut-out on a transparent background and a photograph of a room need
     opposite treatment. The blurred backdrop that makes a landscape room shot
     fill a square box looks broken behind a cut-out kettle: the kettle appears
     to float over a smeared copy of itself.

     So transparency is detected once per unique image and cached. The test is
     four corner pixels plus the centre of each edge, which is where a cut-out
     is transparent and a photograph is not. It runs on a 12x12 downscale, so
     the cost is one small drawImage per distinct product photo, not per card.

     Everything is defensive: a cross-origin image taints the canvas and throws,
     a broken image never loads, and in both cases the card simply keeps the
     default treatment.
     --------------------------------------------------------------------- */

  var transparencyCache = new Map();
  var probeCanvas = null;

  function probeTransparency(url) {
    if (transparencyCache.has(url)) return Promise.resolve(transparencyCache.get(url));

    var promise = new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onerror = function () { resolve(false); };
      img.onload = function () {
        try {
          if (!probeCanvas) probeCanvas = document.createElement('canvas');
          var N = 12;
          probeCanvas.width = N;
          probeCanvas.height = N;
          var ctx = probeCanvas.getContext('2d', { willReadFrequently: true });
          ctx.clearRect(0, 0, N, N);
          ctx.drawImage(img, 0, 0, N, N);
          var d = ctx.getImageData(0, 0, N, N).data;
          var at = function (x, y) { return d[(y * N + x) * 4 + 3]; };
          var samples = [
            at(0, 0), at(N - 1, 0), at(0, N - 1), at(N - 1, N - 1),
            at((N / 2) | 0, 0), at((N / 2) | 0, N - 1),
            at(0, (N / 2) | 0), at(N - 1, (N / 2) | 0)
          ];
          // A cut-out has transparent edges nearly all the way round. Requiring
          // most of the samples rather than one avoids treating a photo with a
          // single soft corner as a cut-out.
          var clear = samples.filter(function (a) { return a < 24; }).length;
          resolve(clear >= 6);
        } catch (e) {
          resolve(false);   // tainted canvas, or no 2d context
        }
      };
      img.src = url;
    });

    transparencyCache.set(url, promise);
    promise.then(function (value) { transparencyCache.set(url, value); });
    return promise;
  }

  /** Only formats that can carry an alpha channel are worth probing. */
  function mayBeTransparent(url) {
    return /\.(png|webp|svg)(\?|#|$)/i.test(url);
  }

  /* ---------------------------------------------------------------------
     The card follows the photograph, not the other way round.
     ---------------------------------------------------------------------
     Forcing every product into one square box is what leaves a wide room shot
     floating in a band of empty space and a tall wardrobe shrunk to nothing.
     The media box takes the shape of the picture inside it instead.

     Clamped, because "follow the image" cannot mean "let one product be three
     screens tall": a panorama settles at 16:9 and a very tall shot at 3:4. In
     between, the box is exactly the photograph's own shape, so it fills the
     frame edge to edge with nothing left over.
     --------------------------------------------------------------------- */
  var MIN_RATIO = 0.75;   // 3:4, the tallest a card may get
  var MAX_RATIO = 1.78;   // 16:9, the widest

  function fitMediaToImage(media, img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    /* A grid card is sized by the rhythm rules, not by its own picture -- a
       row of two must stay a row of two. Only cards free to size themselves
       take the photograph's shape. */
    if (media.dataset.zsRatio === '1') return;
    var r = img.naturalWidth / img.naturalHeight;
    if (!isFinite(r) || r <= 0) return;
    r = Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
    media.style.setProperty('--zs-media-ratio', r.toFixed(4));
    media.dataset.zsRatio = '1';
  }

  function watchImageRatio(media) {
    var img = media.querySelector('img');
    if (!img) return;
    if (img.complete) fitMediaToImage(media, img);
    else img.addEventListener('load', function () { fitMediaToImage(media, img); }, { once: true });
  }

  function applyImageTreatment(media, url) {
    if (/\.svg(\?|#|$)/i.test(url)) { media.classList.add('zs-cutout'); return; }
    if (!mayBeTransparent(url)) return;
    Promise.resolve(probeTransparency(url)).then(function (isCutout) {
      if (isCutout) media.classList.add('zs-cutout');
    });
  }

  function firstImageUrl(card) {
    var img = card.querySelector('img');
    if (!img) return null;
    var src = img.currentSrc || img.getAttribute('src');
    if (!src || /^data:/.test(src)) return null;
    return src;
  }

  /* Every step below is written to be a no-op the second time it runs, because
     premium-cards.js injects the rating block AFTER this file's first pass and
     the card generators re-render whole grids. Re-running is normal, not an
     error path. */
  function normaliseCard(card) {
    var media = card.querySelector('.product-photo-link') ||
                (card.firstElementChild && card.firstElementChild.tagName === 'A' ? card.firstElementChild : null);
    var body = card.querySelector('.product-body');
    if (!body) return;

    /* -- The photograph fills its box: a blurred copy of itself sits behind
          the contained image so nothing is cropped and nothing is empty. -- */
    if (media && media.dataset.zsMedia !== '1') {
      var url = firstImageUrl(card);
      if (url) {
        media.style.setProperty('--card-img', 'url("' + url.replace(/"/g, '\\"') + '")');
        media.dataset.zsMedia = '1';
        applyImageTreatment(media, url);
        watchImageRatio(media);
      }
      /* The stage the older layers built had inline aspect-ratio: 4/5 on it. */
      media.style.removeProperty('aspect-ratio');
    }

    /* -- Nothing is allowed to sit on top of the photograph. Anything the
          older code appended there moves into the information block. -- */
    var priceRow = body.querySelector('.price');
    if (media) {
      Array.prototype.forEach.call(media.querySelectorAll(BADGE_SEL), function (badge) {
        if (priceRow) priceRow.appendChild(badge);
        else body.insertBefore(badge, body.firstChild);
      });
      Array.prototype.forEach.call(media.querySelectorAll('.wish, .btn-wishlist'), function (btn) {
        var row = body.querySelector('.stock > div') || body.querySelector('.stock');
        if (row) row.insertBefore(btn, row.firstChild);
        else body.appendChild(btn);
      });
    }

    /* A badge printed directly into .product-body (not into .price) still
       belongs beside the price. */
    if (priceRow) {
      Array.prototype.forEach.call(body.children, function (el) {
        if (el !== priceRow && el.matches && el.matches(BADGE_SEL)) priceRow.appendChild(el);
      });
    }

    /* The title is clamped to two lines so a grid row stays even. Clamping
       hides text, so the full name has to stay reachable: the card links to the
       product page that shows it in full, and the attribute exposes it to a
       pointer and to assistive technology without opening anything. */
    var heading = body.querySelector('h3');
    if (heading && !heading.title) {
      var full = (heading.textContent || '').trim();
      if (full) heading.title = full;
    }

    /* -- Meta row: rating and availability share one line instead of two. -- */
    var meta = body.querySelector('.zs-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'zs-meta';
      var h3 = body.querySelector('h3');
      if (h3 && h3.nextSibling) body.insertBefore(meta, h3.nextSibling);
      else if (h3) body.appendChild(meta);
      else body.insertBefore(meta, body.firstChild);
    }

    var rating = body.querySelector('.premium-rating');
    if (rating && rating.parentNode !== meta) meta.appendChild(rating);

    if (!meta.querySelector('.zs-stockdot')) {
      var out = card.getAttribute('data-stock') === 'out-of-stock';
      var label = (body.querySelector('.stock > span') || {}).textContent;
      label = (label || '').trim() || (out ? 'غير متوفر' : 'متوفر');
      var dot = document.createElement('span');
      dot.className = 'zs-stockdot' + (out ? ' is-out' : '');
      dot.textContent = label;
      meta.appendChild(dot);
    }

    /* An empty meta row would still cost its min-height. */
    if (!meta.children.length) meta.remove();
  }

  function normaliseCards(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var cards = scope.querySelectorAll('.product-card');
    for (var i = 0; i < cards.length; i++) {
      try { normaliseCard(cards[i]); } catch (e) { /* one bad card must not stop the rest */ }
    }
  }

  /* ---------------------------------------------------------------------
     2. CATEGORY FILTERING
     ---------------------------------------------------------------------
     The tiles and chips are real links to ?category=<slug>, rendered by
     services/category-strip-service.js. The server already answers those URLs
     with a filtered grid, so the filter works with JavaScript off and every
     category is a shareable, crawlable URL.

     What this adds is speed: the same click filters the cards already on the
     page and rewrites the URL, so switching category is instant instead of a
     full page load. History is kept, so Back returns to the previous category.
     --------------------------------------------------------------------- */

  function categoryOf(card) {
    return (card.getAttribute('data-category') || '').trim();
  }

  function countLabel(n) {
    if (!n) return 'لا توجد منتجات';
    if (n === 1) return 'منتج واحد';
    if (n === 2) return 'منتجان';
    if (n <= 10) return n + ' منتجات';
    return n + ' منتج';
  }

  function categoryName(slug) {
    if (!slug) return 'كل غرف النوم';
    var tile = document.querySelector('.zs-cat-tile[data-category="' + slug.replace(/"/g, '\\"') + '"] .zs-cat-label strong');
    if (tile) return tile.textContent.trim();
    var data = window.ZFB_DATA && window.ZFB_DATA.categories;
    var hit = (data || []).filter(function (c) { return c.slug === slug; })[0];
    return hit ? hit.name : slug;
  }

  /** The grid the category tiles filter: the page's main catalogue. */
  function catalogGrid() {
    var bar = document.querySelector('[data-zs-filter-bar]');
    if (!bar) return null;
    var el = bar.nextElementSibling;
    while (el && !(el.classList.contains('product-card') || el.querySelector('.product-card'))) {
      el = el.nextElementSibling;
    }
    if (!el) return null;
    /* The bar sits before the results SECTION, so walk in to the grid itself --
       otherwise the empty state would be appended next to the section heading
       rather than into the grid. */
    return el.querySelector('.product-grid, .mini-product-grid, .visual-product-grid') || el;
  }

  /** The section wrapping the results, which is hidden when nothing matches. */
  function catalogSection() {
    var grid = catalogGrid();
    return grid ? grid.closest('section') : null;
  }

  function applyCategory(slug, push) {
    var grid = catalogGrid();
    if (!grid) return false;

    var cards = grid.querySelectorAll('.product-card');
    var shown = 0;
    for (var i = 0; i < cards.length; i++) {
      var match = !slug || categoryOf(cards[i]) === slug;
      /* A class, not an inline style: .product-card carries
         `display: flex !important`, which an inline `display:none` loses to. */
      cards[i].classList.toggle('zs-hidden', !match);
      cards[i].hidden = !match;
      if (match) shown++;
    }

    /* An empty category is a dead end unless the page says so and offers the
       way out. The message and the section are handled separately on purpose:
       the message lives in the filter bar, which stays on screen, while the
       results section -- heading, frame and all -- is hidden, because an empty
       frame under a heading reads as a broken page. */
    var empty = document.querySelector('[data-zs-empty]');
    if (empty) empty.hidden = !!shown;

    var section = catalogSection();
    if (section) section.hidden = !shown;

    document.querySelectorAll('.zs-cat-tile, .zs-chip').forEach(function (el) {
      var on = (el.getAttribute('data-category') || '') === (slug || '');
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-current', on ? 'true' : 'false');
    });

    /* The category's own banner: its picture, its name, and the way out.
       The picture comes from the tile that was clicked, which is the same
       image the server would have rendered for this category. */
    var banner = document.querySelector('[data-zs-banner]');
    if (banner) {
      if (slug) {
        var tileImg = document.querySelector('.zs-cat-tile[data-category="' + slug.replace(/"/g, '\\"') + '"] .zs-cat-media img');
        var bannerImg = banner.querySelector('[data-zs-banner-img]');
        if (tileImg) {
          if (!bannerImg) {
            bannerImg = document.createElement('img');
            bannerImg.setAttribute('data-zs-banner-img', '');
            bannerImg.alt = '';
            bannerImg.loading = 'lazy';
            banner.querySelector('.zs-cat-banner-media').appendChild(bannerImg);
          }
          bannerImg.src = tileImg.currentSrc || tileImg.src;
        } else if (bannerImg) {
          bannerImg.remove();
        }
        var bt = banner.querySelector('[data-zs-banner-title]');
        if (bt) bt.textContent = categoryName(slug);
        var bc = banner.querySelector('[data-zs-banner-count]');
        if (bc) bc.textContent = countLabel(shown);
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }

    var title = document.querySelector('[data-zs-results-title]');
    if (title) title.textContent = categoryName(slug);
    var count = document.querySelector('[data-zs-results-count]');
    if (count) count.textContent = countLabel(shown);

    if (push) {
      var url = new URL(window.location.href);
      if (slug) url.searchParams.set('category', slug);
      else url.searchParams.delete('category');
      history.pushState({ zsCategory: slug || '' }, '', url.toString());
    }

    normaliseCards(grid);
    return true;
  }

  function bindCategoryFiltering() {
    if (!document.querySelector('[data-zs-filter-bar]')) return;

    document.addEventListener('click', function (e) {
      var link = e.target.closest &&
        e.target.closest('.zs-cat-tile, .zs-chip, .zs-cat-banner-clear, .zs-empty-clear');
      if (!link) return;
      // Let the browser do its normal thing for a new tab or a modified click.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

      var slug = link.getAttribute('data-category') || '';
      if (!applyCategory(slug, true)) return;  // no grid here: follow the link
      e.preventDefault();

      var bar = document.querySelector('[data-zs-filter-bar]');
      if (bar && link.classList.contains('zs-cat-tile')) {
        bar.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    window.addEventListener('popstate', function () {
      var slug = new URL(window.location.href).searchParams.get('category') || '';
      applyCategory(slug, false);
    });

    /* The server already rendered the right cards for the current URL; this
       only syncs the heading and the counts with what is actually on screen. */
    applyCategory(new URL(window.location.href).searchParams.get('category') || '', false);
  }

  /* ---------------------------------------------------------------------
     3. MAJLIS REQUEST WIZARD
     ---------------------------------------------------------------------
     Replaces a "cost calculator" that calculated nothing: seven step circles
     with no script behind them and six options that were all links to the same
     collections page.

     What it does now: three questions, then hands the answers to the
     consultation form with the details already written out. It deliberately
     does NOT quote a price. A majlis price depends on fabric, seat count and
     the room; a number invented in the browser is a number the shop would have
     to honour, and getting that wrong is worse than not showing one.

     Step one's choices are the department's REAL categories, read from
     window.ZFB_DATA, so adding a category in the admin adds it here too.
     --------------------------------------------------------------------- */

  var MAJLIS_DEPARTMENT = 'living-rooms';

  function majlisCategories() {
    var data = window.ZFB_DATA || {};
    var cats = Array.isArray(data.categories) ? data.categories : [];
    var depts = Array.isArray(data.departments) ? data.departments : [];
    var dept = depts.find(function (d) { return d.slug === MAJLIS_DEPARTMENT; });
    var list = cats.filter(function (c) {
      return dept && String(c.departmentId) === String(dept.id);
    });
    /* A category that is really the department under another name ("مجالس"
       inside مجالس) is not a choice, it is the default. */
    return list
      .filter(function (c) { return c.slug !== 'majalis'; })
      .map(function (c) { return { value: c.name, label: c.name }; });
  }

  function initMajlisWizard() {
    var root = document.querySelector('[data-zs-majlis-wizard]');
    if (!root || root.dataset.zsWizardReady === '1') return;

    var typeChoices = majlisCategories();
    /* With no categories configured the type question has nothing to ask, so it
       is dropped rather than shown empty. The rest of the flow still works. */
    var steps = [];
    if (typeChoices.length) {
      steps.push({ key: 'النوع', title: 'اختر نوع المجلس', options: typeChoices });
    }
    steps.push({
      key: 'المقاس',
      title: 'كم مساحة المجلس تقريباً؟',
      options: [
        { value: 'صغير (حتى 4×5 م)', label: 'صغير', hint: 'حتى 4×5 م' },
        { value: 'متوسط (5×6 م)', label: 'متوسط', hint: '5×6 م' },
        { value: 'كبير (6×8 م)', label: 'كبير', hint: '6×8 م' },
        { value: 'كبير جداً (أكبر من 6×8 م)', label: 'كبير جداً', hint: 'أكبر من ذلك' }
      ]
    });
    steps.push({
      key: 'عدد الجلسات',
      title: 'كم عدد الجلسات المطلوبة؟',
      options: [
        { value: '6 جلسات', label: '6 جلسات' },
        { value: '8 جلسات', label: '8 جلسات' },
        { value: '10 جلسات', label: '10 جلسات' },
        { value: '12 جلسة أو أكثر', label: '12 أو أكثر' }
      ]
    });

    var elSteps = root.querySelector('[data-zs-wizard-steps]');
    var elProgress = root.querySelector('[data-zs-wizard-progress]');
    var elTitle = root.querySelector('[data-zs-wizard-title]');
    var elOptions = root.querySelector('[data-zs-wizard-options]');
    var elSummary = root.querySelector('[data-zs-wizard-summary]');
    var elBack = root.querySelector('[data-zs-wizard-back]');
    var elCta = root.querySelector('[data-zs-wizard-cta]');
    if (!elSteps || !elOptions || !elCta) return;

    var index = 0;
    var answers = {};

    function detailsText() {
      var lines = ['طلب مجلس عبر الموقع:'];
      steps.forEach(function (s) {
        if (answers[s.key]) lines.push('- ' + s.key + ': ' + answers[s.key]);
      });
      return lines.join('\n');
    }

    function render() {
      var done = steps.filter(function (s) { return answers[s.key]; }).length;
      var finished = done === steps.length;

      elSteps.innerHTML = steps.map(function (s, i) {
        var state = answers[s.key] ? ' is-done' : (i === index ? ' active' : '');
        return '<li class="' + state.trim() + '">' + (i + 1) + '</li>';
      }).join('');

      if (finished) {
        /* Arabic wording rather than a bare "1 / 7": in a right-to-left
           paragraph a slash-separated fraction renders in the opposite order to
           the one it was written in, which is why the old label read "7 / 1". */
        elProgress.textContent = 'اكتملت الاختيارات';
        elTitle.textContent = 'راجع اختيارك ثم أرسل الطلب';
        elOptions.hidden = true;
        elSummary.hidden = false;
        elSummary.innerHTML = steps.map(function (s) {
          return '<div class="zs-wizard-row"><span>' + s.key + '</span><strong>' +
            String(answers[s.key]).replace(/</g, '&lt;') + '</strong></div>';
        }).join('');
        elCta.textContent = 'أرسل الطلب واحصل على عرض سعر';
        /* "furniture" is the value of the consultation form's own
           "الأثاث والمجالس" option -- the handoff has to speak that form's
           vocabulary or the select arrives empty. */
        elCta.href = 'consultation.html?type=furniture&details=' +
          encodeURIComponent(detailsText());
        elCta.removeAttribute('aria-disabled');
      } else {
        var step = steps[index];
        elProgress.textContent = 'الخطوة ' + (index + 1) + ' من ' + steps.length;
        elTitle.textContent = step.title;
        elOptions.hidden = false;
        elSummary.hidden = true;
        elOptions.innerHTML = step.options.map(function (o) {
          var active = answers[step.key] === o.value ? ' active' : '';
          return '<button type="button" class="majalis-option' + active + '" data-value="' +
            String(o.value).replace(/"/g, '&quot;') + '">' +
            '<strong>' + o.label + '</strong>' +
            (o.hint ? '<span class="zs-wizard-hint">' + o.hint + '</span>' : '') +
            '</button>';
        }).join('');
        elCta.textContent = 'اختر للمتابعة';
        elCta.href = '#';
        elCta.setAttribute('aria-disabled', 'true');
      }

      elBack.hidden = index === 0 && !finished;
    }

    elOptions.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-value]');
      if (!btn) return;
      answers[steps[index].key] = btn.dataset.value;
      if (index < steps.length - 1) index += 1;
      render();
    });

    elBack.addEventListener('click', function () {
      var finished = steps.every(function (s) { return answers[s.key]; });
      if (finished) {
        delete answers[steps[steps.length - 1].key];
        index = steps.length - 1;
      } else if (index > 0) {
        index -= 1;
        delete answers[steps[index].key];
      }
      render();
    });

    elSteps.addEventListener('click', function (e) {
      var li = e.target.closest('li');
      if (!li) return;
      var i = Array.prototype.indexOf.call(elSteps.children, li);
      // Only backwards: skipping ahead past an unanswered question would submit
      // a request with holes in it.
      if (i >= 0 && i <= index) { index = i; render(); }
    });

    elCta.addEventListener('click', function (e) {
      if (elCta.getAttribute('aria-disabled') === 'true') e.preventDefault();
    });

    root.dataset.zsWizardReady = '1';
    render();
  }

  /* ---------------------------------------------------------------------
     3b. ESTIMATOR FORMS
     ---------------------------------------------------------------------
     The majlis / kitchen / solar estimator forms posted natively to
     /api/calculate-*, so submitting one navigated the customer away from the
     shop to a page of raw JSON. The endpoint works and returns a real estimate;
     only the presentation was missing.

     Progressive enhancement: the plain POST still works with JavaScript off,
     and with it on the answer is rendered under the button.
     --------------------------------------------------------------------- */
  function initEstimatorForms() {
    var forms = document.querySelectorAll('form[action^="/api/calculate-"]');
    Array.prototype.forEach.call(forms, function (form) {
      if (form.dataset.zsEstimator === '1') return;
      form.dataset.zsEstimator = '1';

      var out = document.createElement('div');
      out.className = 'zs-estimate';
      out.hidden = true;
      out.setAttribute('role', 'status');
      form.appendChild(out);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var submit = form.querySelector('[type="submit"]');
        var label = submit ? submit.textContent : '';
        if (submit) { submit.disabled = true; submit.textContent = 'جارٍ الحساب...'; }

        fetch(form.getAttribute('action'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(form)).toString()
        })
          .then(function (r) { return r.json(); })
          .then(function (json) {
            var d = (json && json.data) || {};
            if (!json || json.success === false || !d.formatted_price) {
              throw new Error((json && json.error) || 'تعذّر الحساب');
            }
            var dim = d.dimensions || {};
            out.innerHTML =
              '<div class="zs-estimate-head">التقدير الأولي</div>' +
              '<div class="zs-estimate-price">' + esc(d.formatted_price) + '</div>' +
              '<ul class="zs-estimate-meta">' +
                (dim.runningMeters ? '<li>' + esc(dim.runningMeters) + '</li>' : '') +
                (dim.capacity ? '<li>' + esc(dim.capacity) + '</li>' : '') +
              '</ul>' +
              /* Said plainly, because an estimate that reads as a final price is
                 a promise the shop has to keep. */
              '<p class="zs-estimate-note">هذا تقدير تقريبي حسب المقاسات المدخلة، والسعر النهائي يُحدَّد بعد المعاينة.</p>' +
              '<a class="zs-estimate-cta" href="consultation.html?type=furniture&details=' +
                encodeURIComponent(estimateDetails(form, d)) + '">اطلب عرض سعر نهائي</a>';
            out.hidden = false;
            out.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          })
          .catch(function (err) {
            out.innerHTML = '<p class="zs-estimate-note">' + esc(err.message || 'تعذّر الحساب، حاول مرة أخرى.') + '</p>';
            out.hidden = false;
          })
          .then(function () {
            if (submit) { submit.disabled = false; submit.textContent = label; }
          });
      });
    });
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function estimateDetails(form, data) {
    var lines = ['طلب تقدير مجلس عبر الموقع:'];
    var fd = new FormData(form);
    var labels = { type: 'نوع القماش', wood: 'نوع الخشب', length: 'الطول (م)', width: 'العرض (م)', height: 'الارتفاع (م)' };
    fd.forEach(function (value, key) {
      if (labels[key] && String(value).trim()) lines.push('- ' + labels[key] + ': ' + value);
    });
    if (data && data.formatted_price) lines.push('- التقدير الأولي من الموقع: ' + data.formatted_price);
    return lines.join('\n');
  }

  /* ---------------------------------------------------------------------
     3c. MOBILE SEARCH PLACEHOLDER
     ---------------------------------------------------------------------
     The pages ship placeholders like "ابحث عن مجالس، أقمشة، خشب، ديكورات..."
     into a field that is ~150px wide on a phone. The customer sees "ابحث عن
     مجالس،" and nothing else -- a sentence cut mid-list, on every page.

     A short prompt fits, so the field reads as a finished control. The long
     text is kept as the accessible label, so nothing is lost to a screen
     reader; only the visible hint is shortened, and only on small screens.
     --------------------------------------------------------------------- */
  function initSearchPlaceholder() {
    if (window.innerWidth >= 768) return;
    var inputs = document.querySelectorAll('.zfb-mobile-search input[name="q"]');
    Array.prototype.forEach.call(inputs, function (input) {
      if (input.dataset.zsPlaceholder === '1') return;
      var full = input.getAttribute('placeholder') || '';
      if (full.length > 18) {
        if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', full);
        input.setAttribute('placeholder', 'ابحث في المتجر');
      }
      input.dataset.zsPlaceholder = '1';
    });
  }

  /* ---------------------------------------------------------------------
     4. CONSULTATION PREFILL
     ---------------------------------------------------------------------
     The majlis wizard hands its answers over in the URL. Without this the
     handoff would be decorative -- the customer would arrive at an empty form
     and have to type out choices they had just made, which is the same dead end
     the wizard was built to remove.

     Only the two fields the wizard actually sends are touched, and only when
     they are still empty, so a half-filled form is never overwritten.
     --------------------------------------------------------------------- */
  function initConsultationPrefill() {
    var type = null, details = null;
    try {
      var q = new URLSearchParams(window.location.search);
      type = q.get('type');
      details = q.get('details');
    } catch (e) { return; }
    if (!type && !details) return;

    var typeEl = document.getElementById('consultationType');
    if (typeEl && !typeEl.value && type) {
      var match = Array.prototype.find.call(typeEl.options, function (o) { return o.value === type; });
      if (match) {
        typeEl.value = type;
        typeEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    var detailsEl = document.getElementById('details');
    if (detailsEl && !detailsEl.value.trim() && details) {
      detailsEl.value = details;
      detailsEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ---------------------------------------------------------------------
     Boot + re-run whenever a grid is replaced.
     --------------------------------------------------------------------- */
  /* The promo stack on the home page sat above the products, so the first thing
     a visitor scrolled past was three text links to other pages rather than
     anything they could buy. It reads as a footer, so it goes in the footer's
     place: after the products, still on the page, still linked. */
  function moveOffersBelowProducts() {
    var offers = document.querySelector('main > #offers');
    if (!offers || offers.dataset.zsMoved === '1') return;
    var main = offers.parentElement;
    if (!main || main.lastElementChild === offers) return;
    offers.dataset.zsMoved = '1';
    main.appendChild(offers);
  }

  function boot() {
    moveOffersBelowProducts();
    normaliseCards(document);
    bindCategoryFiltering();
    try { initMajlisWizard(); } catch (e) { /* one page's widget must not break the rest */ }
    try { initEstimatorForms(); } catch (e) { /* same */ }
    try { initSearchPlaceholder(); } catch (e) { /* same */ }
    try { initConsultationPrefill(); } catch (e) { /* same */ }

    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; normaliseCards(document); });
    }

    /* Two things must be caught: a grid being re-rendered (a .product-card is
       added), and premium-cards.js dropping its rating block into a card that
       was already normalised (an element is added INSIDE a card). */
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mu = mutations[i];
        if (mu.target && mu.target.closest && mu.target.closest('.product-card')) { schedule(); return; }
        var added = mu.addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.classList.contains('product-card') || n.querySelector('.product-card')) { schedule(); return; }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    /* The card generators re-render on these; catch them explicitly rather
       than relying on the observer alone. */
    ['zfb-state-change', 'zfb-cart-updated', 'zfb-currency-change', 'zfb-products-rendered']
      .forEach(function (ev) {
        window.addEventListener(ev, function () { normaliseCards(document); });
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.ZS2026 = { normaliseCards: normaliseCards };
})();
