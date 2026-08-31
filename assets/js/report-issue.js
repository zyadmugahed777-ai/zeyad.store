/**
 * REPORT AN ISSUE & BOUNTY REWARDS CLIENT ENGINE — V1.0 PRO MAX
 * Client Controller, Context Auto-Detection, Secure File Upload & Live Tracking
 */

(function () {
  'use strict';

  const STORAGE_REPORTS_KEY = 'zfb.my_reports';
  let selectedFile = null;

  function qs(id) {
    return document.getElementById(id);
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function showToast(msg, type = 'info') {
    if (window.ZFB && window.ZFB.Notification) {
      window.ZFB.Notification.show(msg, type);
      return;
    }
    let toast = document.querySelector('.zfb-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'zfb-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function saveLocalReport(reportNumber, trackingToken) {
    try {
      const raw = localStorage.getItem(STORAGE_REPORTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!list.some(r => r.reportNumber === reportNumber)) {
        list.unshift({ reportNumber, trackingToken, date: new Date().toISOString() });
        localStorage.setItem(STORAGE_REPORTS_KEY, JSON.stringify(list.slice(0, 10)));
      }
    } catch (_) {}
  }

  function getLocalReportToken(reportNumber) {
    try {
      const raw = localStorage.getItem(STORAGE_REPORTS_KEY);
      if (!raw) return '';
      const list = JSON.parse(raw);
      const item = list.find(r => r.reportNumber === reportNumber);
      return item ? item.trackingToken : '';
    } catch (_) {
      return '';
    }
  }

  // ==========================================================================
  // CONTEXT AUTO-DETECTION
  // ==========================================================================
  function initContext() {
    const productId = getQueryParam('product_id') || getQueryParam('pid') || sessionStorage.getItem('zfb_last_product_id');
    const productTitle = getQueryParam('product_title') || getQueryParam('title') || sessionStorage.getItem('zfb_last_product_title');
    const refUrl = getQueryParam('url') || sessionStorage.getItem('zfb_last_page') || document.referrer || window.location.href;
    const issueParam = getQueryParam('issue') || getQueryParam('type');
    const orderId = getQueryParam('order_id') || sessionStorage.getItem('zfb_last_order_id');

    const pageUrlInput = qs('reportPageUrl');
    if (pageUrlInput && !pageUrlInput.value) {
      pageUrlInput.value = refUrl;
    }

    const issueSelect = qs('reportIssueType');
    if (issueSelect && issueParam) {
      issueSelect.value = issueParam;
    } else if (issueSelect && productId) {
      issueSelect.value = 'product_error';
    }

    // Context banner if product or order is attached
    const contextBanner = qs('reportContextBanner');
    const contextText = qs('reportContextText');
    if (contextBanner && (productId || orderId)) {
      contextBanner.hidden = false;
      if (productId) {
        contextText.innerHTML = `بلاغ مرتبط بالمنتج: <strong>${productTitle || productId}</strong> (رمز: ${productId})`;
      } else if (orderId) {
        contextText.innerHTML = `بلاغ مرتبط بالطلب رقم: <strong>${orderId}</strong>`;
      }
    }

    // Auto-fill phone and name if stored
    const nameInput = qs('reportCustomerName');
    const phoneInput = qs('reportCustomerPhone');
    try {
      if (phoneInput && !phoneInput.value) {
        phoneInput.value = localStorage.getItem('zfb.customer_phone') || '';
      }
      if (nameInput && !nameInput.value) {
        nameInput.value = localStorage.getItem('zfb.customer_name') || '';
      }
    } catch (_) {}
  }

  // ==========================================================================
  // IMAGE UPLOAD & PREVIEW
  // ==========================================================================
  function initFileUpload() {
    const dropzone = qs('reportDropzone');
    const fileInput = qs('reportFileInput');
    const previewBox = qs('reportPreviewBox');
    const previewThumb = qs('reportPreviewThumb');
    const previewName = qs('reportPreviewName');
    const previewSize = qs('reportPreviewSize');
    const removeBtn = qs('reportPreviewRemove');

    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length) {
        handleFileSelect(e.target.files[0]);
      }
    });

    function handleFileSelect(file) {
      if (!file) return;

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        showToast('يرجى اختيار صورة بصيغة JPG أو PNG أو WEBP فقط', 'error');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        showToast('حجم الصورة كبير جداً (الحد الأقصى 5 ميجابايت)', 'error');
        return;
      }

      selectedFile = file;

      const reader = new FileReader();
      reader.onload = (event) => {
        if (previewThumb) previewThumb.src = event.target.result;
        if (previewName) previewName.textContent = file.name;
        if (previewSize) previewSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
        if (previewBox) previewBox.hidden = false;
        dropzone.hidden = true;
      };
      reader.readAsDataURL(file);
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        if (previewBox) previewBox.hidden = true;
        dropzone.hidden = false;
      });
    }
  }

  // ==========================================================================
  // FORM SUBMISSION
  // ==========================================================================
  function initForm() {
    const form = qs('reportForm');
    const submitBtn = qs('reportSubmitBtn');
    const successBox = qs('reportSuccessBox');
    const resultReportNum = qs('resultReportNumber');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const phone = qs('reportCustomerPhone')?.value.trim();
      const description = qs('reportDescription')?.value.trim();
      const issueType = qs('reportIssueType')?.value;

      if (!phone || phone.length < 8) {
        showToast('يرجى إدخال رقم هاتف صحيح للتواصل ومتابعة البلاغ', 'error');
        qs('reportCustomerPhone')?.focus();
        return;
      }

      if (!description || description.length < 5) {
        showToast('يرجى كتابة تفاصيل المشكلة بوضوح', 'error');
        qs('reportDescription')?.focus();
        return;
      }

      // Collect diagnostics context
      const contextData = {
        productId: getQueryParam('product_id') || getQueryParam('pid') || sessionStorage.getItem('zfb_last_product_id') || null,
        productTitle: getQueryParam('product_title') || sessionStorage.getItem('zfb_last_product_title') || null,
        categoryId: getQueryParam('category_id') || sessionStorage.getItem('zfb_last_category_id') || null,
        orderId: getQueryParam('order_id') || sessionStorage.getItem('zfb_last_order_id') || null,
        cartCount: window.ZFB?.Cart?.count ? window.ZFB.Cart.count() : 0,
        screen: `${window.innerWidth}x${window.innerHeight}`,
        device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'جوال' : 'كمبيوتر مكتبي',
        theme: document.documentElement.getAttribute('data-theme') || 'light',
        referrer: document.referrer || '',
        userAgent: navigator.userAgent
      };

      const formData = new FormData();
      formData.append('customerName', qs('reportCustomerName')?.value.trim() || '');
      formData.append('customerPhone', phone);
      formData.append('customerEmail', qs('reportCustomerEmail')?.value.trim() || '');
      formData.append('issueType', issueType || 'other');
      formData.append('pageUrl', qs('reportPageUrl')?.value.trim() || '');
      formData.append('description', description);
      formData.append('expectedBehavior', qs('reportExpected')?.value.trim() || '');
      formData.append('actualBehavior', qs('reportActual')?.value.trim() || '');
      formData.append('contextData', JSON.stringify(contextData));

      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      // Remember phone for next visits
      try {
        localStorage.setItem('zfb.customer_phone', phone);
        if (qs('reportCustomerName')?.value.trim()) {
          localStorage.setItem('zfb.customer_name', qs('reportCustomerName').value.trim());
        }
      } catch (_) {}

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('is-loading');
        submitBtn.innerHTML = 'جاري إرسال البلاغ...';
      }

      try {
        const res = await fetch('/api/customer-reports', {
          method: 'POST',
          headers: {
            'x-guest-id': localStorage.getItem('zfb.guest_id') || ''
          },
          body: formData
        });

        const data = await res.json();

        if (data.success) {
          saveLocalReport(data.reportNumber, data.trackingToken);

          if (resultReportNum) resultReportNum.textContent = data.reportNumber;
          if (successBox) successBox.hidden = false;
          form.hidden = true;

          // Populate tracking input
          const trackInput = qs('trackReportInput');
          if (trackInput) trackInput.value = data.reportNumber;

          // Scroll to success box smoothly
          successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          showToast('تم استلام بلاغك بنجاح! شكراً لمساعدتنا.', 'success');
        } else {
          showToast(data.error || 'تعذر إرسال البلاغ حالياً', 'error');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('is-loading');
            submitBtn.innerHTML = 'إرسال البلاغ الآن 🚀';
          }
        }
      } catch (err) {
        console.error('Report submission error:', err);
        showToast('تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('is-loading');
          submitBtn.innerHTML = 'إرسال البلاغ الآن 🚀';
        }
      }
    });

    // Copy Report Number Buttons
    document.querySelectorAll('[data-copy-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.copyTarget;
        const text = qs(targetId)?.textContent || '';
        if (text && navigator.clipboard) {
          navigator.clipboard.writeText(text.trim()).then(() => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '✓ تم النسخ';
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
          });
        }
      });
    });
  }

  // ==========================================================================
  // TRACKING REPORT STATUS
  // ==========================================================================
  function initTracking() {
    const trackForm = qs('reportTrackForm');
    const trackResultBox = qs('reportTrackResultBox');
    const trackInput = qs('trackReportInput');

    if (!trackForm) return;

    // Check if report number is passed in URL ?track=BUG-2026-XXXXXX
    const trackQuery = getQueryParam('track');
    if (trackQuery && trackInput) {
      trackInput.value = trackQuery;
      doTrack(trackQuery);
    }

    trackForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const reportNum = trackInput?.value.trim().toUpperCase();
      if (!reportNum) {
        showToast('يرجى كتابة رقم البلاغ', 'error');
        return;
      }
      doTrack(reportNum);
    });

    async function doTrack(reportNum) {
      const token = getLocalReportToken(reportNum);
      const phone = localStorage.getItem('zfb.customer_phone') || '';

      if (trackResultBox) {
        trackResultBox.hidden = false;
        trackResultBox.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--report-ink-muted);">جاري البحث عن البلاغ...</div>';
      }

      try {
        const queryParams = new URLSearchParams();
        if (token) queryParams.append('token', token);
        if (phone) queryParams.append('phone', phone);

        const res = await fetch(`/api/customer-reports/track/${encodeURIComponent(reportNum)}?${queryParams.toString()}`);
        const data = await res.json();

        if (!data.success || !data.data) {
          if (trackResultBox) {
            trackResultBox.innerHTML = `
              <div style="text-align:center; padding: 20px; color: #ef4444;">
                <div style="font-size: 24px; margin-bottom: 6px;">❌</div>
                <strong>${data.error || 'لم يتم العثور على بلاغ مطابق.'}</strong>
              </div>
            `;
          }
          return;
        }

        renderTrackingResult(data.data, data.authenticated);

      } catch (err) {
        console.error('Tracking query error:', err);
        if (trackResultBox) {
          trackResultBox.innerHTML = '<div style="text-align:center; padding: 20px; color: #ef4444;">تعذر الاتصال بالخادم للاستعلام عن البلاغ.</div>';
        }
      }
    }

    function renderTrackingResult(rep, isAuthenticated) {
      if (!trackResultBox) return;

      const isDone1 = true;
      const isDone2 = ['in_review', 'verified', 'rewarded', 'completed', 'closed'].includes(rep.status);
      const isDone3 = ['verified', 'rewarded', 'completed', 'closed'].includes(rep.status);
      const isDone4 = ['rewarded', 'completed', 'closed'].includes(rep.status);

      let rewardHtml = '';
      if (rep.reward && rep.hasReward) {
        rewardHtml = `
          <div class="report-reward-voucher">
            <h4>🎉 تم اعتماد مكافأة لبلاغك!</h4>
            <p style="font-size: 13px; color: var(--report-ink); margin: 4px 0;">
              ${rep.reward.type === 'percentage' ? `خصم بقيمة <strong>${rep.reward.value}%</strong>` : `خصم بقيمة <strong>${rep.reward.value} ر.ي</strong>`}
            </p>
            ${rep.reward.code ? `
              <div>
                <span class="report-voucher-code" id="trackVoucherCode">${rep.reward.code}</span>
                <button type="button" class="report-copy-btn" data-copy-target="trackVoucherCode">نسخ الكوبون</button>
              </div>
              <small style="color: var(--report-ink-muted); display: block;">يمكنك استخدام هذا الكود في سلة الشراء أو إتمام الطلب للحصول على الخصم فوراً.</small>
            ` : ''}
          </div>
        `;
      } else if (rep.status === 'rejected') {
        rewardHtml = `
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; padding: 12px; margin-top: 14px; text-align: center;">
            <strong style="color: #ef4444; font-size: 13px;">حالة البلاغ: غير معتمد</strong>
            <p style="font-size: 12px; color: var(--report-ink-muted); margin: 4px 0 0;">نشكرك على مشاركتك، وتبين بعد المراجعة أن هذا السلوك مطابق للإعدادات المعتمدة أو تعذر إعادة إنتاج الخلل.</p>
          </div>
        `;
      }

      trackResultBox.innerHTML = `
        <div style="border-top: 1px solid var(--report-border); padding-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div>
              <strong style="font-size: 15px; color: var(--report-gold); font-family: monospace;">${rep.reportNumber}</strong>
              <span style="font-size: 12px; color: var(--report-ink-muted); margin-inline-start: 8px;">(${rep.issueTypeAr || 'مشكلة'})</span>
            </div>
            <div style="font-size: 12px; color: var(--report-ink-muted);">
              بتاريخ: ${new Date(rep.createdAt).toLocaleDateString('ar-YE')}
            </div>
          </div>

          <!-- Stepper -->
          <div class="report-status-stepper">
            <div class="report-step ${isDone1 ? 'is-done' : ''}">
              <div class="report-step-dot"></div>
              <span class="report-step-label">1. تم الإرسال</span>
            </div>
            <div class="report-step ${isDone2 ? (rep.status === 'in_review' ? 'is-active' : 'is-done') : ''}">
              <div class="report-step-dot"></div>
              <span class="report-step-label">2. قيد المراجعة</span>
            </div>
            <div class="report-step ${isDone3 ? (rep.status === 'verified' ? 'is-active' : 'is-done') : ''}">
              <div class="report-step-dot"></div>
              <span class="report-step-label">3. تم التحقق</span>
            </div>
            <div class="report-step ${isDone4 ? 'is-done is-active' : ''}">
              <div class="report-step-dot"></div>
              <span class="report-step-label">4. المكافأة / الحل</span>
            </div>
          </div>

          ${rewardHtml}
        </div>
      `;

      // Re-bind dynamic copy buttons inside tracking result
      trackResultBox.querySelectorAll('[data-copy-target]').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.copyTarget;
          const text = qs(targetId)?.textContent || '';
          if (text && navigator.clipboard) {
            navigator.clipboard.writeText(text.trim()).then(() => {
              const originalText = btn.innerHTML;
              btn.innerHTML = '✓ تم النسخ';
              setTimeout(() => { btn.innerHTML = originalText; }, 2000);
            });
          }
        });
      });
    }
  }

  // ==========================================================================
  // FAQ ACCORDIONS
  // ==========================================================================
  function initFaq() {
    document.querySelectorAll('.report-faq-item').forEach(item => {
      const questionBtn = item.querySelector('.report-faq-question');
      if (questionBtn) {
        questionBtn.addEventListener('click', () => {
          const isOpen = item.classList.contains('is-open');
          document.querySelectorAll('.report-faq-item').forEach(i => i.classList.remove('is-open'));
          if (!isOpen) item.classList.add('is-open');
        });
      }
    });
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initContext();
    initFileUpload();
    initForm();
    initTracking();
    initFaq();
  });

})();
