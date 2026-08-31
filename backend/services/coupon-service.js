/**
 * Zeyad For Business - Canonical Coupon & Discount Engine
 * Single Source of Truth for Coupon Rules, Validation, Financials, and Atomic Redemption.
 * Refactored in Phase 1 Batch 5B to use Repository Layer (SqliteCouponRepo).
 */

const crypto = require('crypto');
const { getRepositories } = require('../repositories');
const { currencyService } = require('./currency-service');
const { normalizePhone, sanitize } = require('../utils/helpers');

const ALLOWED_COUPON_TYPES = {
  percentage: 'خصم نسبة مئوية (%)',
  free_shipping: 'توصيل مجاني'
};

const ALLOWED_SCOPES = {
  public: 'عام (لجميع العملاء)',
  private: 'خاص (برقم هاتف / عميل محدد)',
  customer_report: 'مكافأة بلاغ مشكلة'
};

class CouponService {
  get repo() {
    return getRepositories().coupons;
  }

  get authRepo() {
    return getRepositories().auth;
  }

  /**
   * Standardize and normalize coupon code
   */
  normalizeCode(code) {
    if (!code) return '';
    return String(code).trim().toUpperCase();
  }

  /**
   * Generate secure cryptographically random unique code
   */
  generateSecureCode(prefix = 'ZFB', type = 'percentage', value = 10) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    let typePart = 'DISC';
    if (type === 'percentage') {
      typePart = `${Math.round(Number(value) || 10)}`;
    } else if (type === 'free_shipping') {
      typePart = 'FREE';
    }
    return `${prefix}-${typePart}-${randomHex}`;
  }

  /**
   * Validate Coupon against all business rules
   * Single source of truth for Cart, Orders, and Checkout.
   */
  async validateCoupon(rawCode, {
    subtotalSar = 0,
    customerPhone = null,
    customerId = null,
    deliveryFeeSar = 0,
    targetCurrency = 'SAR'
  } = {}) {
    const code = this.normalizeCode(rawCode);

    if (!code) {
      return {
        isValid: false,
        reason: 'EMPTY_CODE',
        error: 'يرجى إدخال كود الكوبون'
      };
    }

    const coupon = await this.repo.findByCode(code);

    if (!coupon) {
      return {
        isValid: false,
        reason: 'NOT_FOUND',
        error: 'الكوبون غير موجود، يرجى التأكد من كتابة الكود بشكل صحيح'
      };
    }

    // 1. Active status check
    if (!coupon.is_active) {
      return {
        isValid: false,
        reason: 'INACTIVE',
        error: 'عذراً، هذا الكوبون غير مفعّل حالياً'
      };
    }

    // 2. Type check (Strictly allowed types only)
    if (!ALLOWED_COUPON_TYPES[coupon.discount_type]) {
      return {
        isValid: false,
        reason: 'UNSUPPORTED_TYPE',
        error: 'نوع هذا الكوبون قديم أو غير مدعوم حالياً'
      };
    }

    const now = new Date();

    // 3. Start date check
    if (coupon.start_date) {
      const startDate = new Date(coupon.start_date);
      if (!isNaN(startDate.getTime()) && now < startDate) {
        return {
          isValid: false,
          reason: 'NOT_STARTED',
          error: `هذا الكوبون سيبدأ تفعيله بتاريخ ${startDate.toLocaleDateString('ar-YE')}`
        };
      }
    }

    // 4. Expiration check
    if (coupon.end_date) {
      const endDate = new Date(coupon.end_date);
      if (!isNaN(endDate.getTime()) && now > endDate) {
        return {
          isValid: false,
          reason: 'EXPIRED',
          error: 'عذراً، انتهت صلاحية هذا الكوبون'
        };
      }
    }

    // 5. Usage Limit Check
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
      return {
        isValid: false,
        reason: 'MAX_USES_REACHED',
        error: 'عذراً، تم استنفاذ الحد الأقصى لاستخدام هذا الكوبون'
      };
    }

    // 6. Minimum Order Amount Check
    const minOrder = Number(coupon.min_order) || 0;
    const subtotal = Math.max(Number(subtotalSar) || 0, 0);

    if (minOrder > 0 && subtotal < minOrder) {
      const formattedMin = currencyService.formatCurrency(minOrder, targetCurrency);
      return {
        isValid: false,
        reason: 'MIN_ORDER_NOT_MET',
        minOrder,
        error: `الحد الأدنى للطلب للاستفادة من هذا الكوبون هو ${formattedMin.amountFormatted}`
      };
    }

    // 7. Scope & Customer/Phone binding
    if (coupon.scope === 'private' || coupon.scope === 'customer_report') {
      const normalizedReqPhone = normalizePhone(customerPhone);
      const normalizedCouponPhone = normalizePhone(coupon.customer_phone);

      if (normalizedCouponPhone && normalizedReqPhone !== normalizedCouponPhone) {
        return {
          isValid: false,
          reason: 'PHONE_MISMATCH',
          error: 'هذا الكوبون مخصص لرقم هاتف محدد وغير صالح مع هذا الرقم'
        };
      }

      if (coupon.customer_id && customerId && String(coupon.customer_id) !== String(customerId)) {
        return {
          isValid: false,
          reason: 'CUSTOMER_MISMATCH',
          error: 'هذا الكوبون مخصص لحساب عميل محدد'
        };
      }
    }

    // 8. Financial Calculation
    let discountAmountSar = 0;
    let freeShipping = false;

    if (coupon.discount_type === 'percentage') {
      const pct = Math.min(Math.max(Number(coupon.discount_value) || 0, 0), 100);
      discountAmountSar = Number(((subtotal * pct) / 100).toFixed(2));
      // Ensure discount doesn't exceed subtotal
      if (discountAmountSar > subtotal) {
        discountAmountSar = subtotal;
      }
    } else if (coupon.discount_type === 'free_shipping') {
      freeShipping = true;
      discountAmountSar = Math.max(Number(deliveryFeeSar) || 0, 0);
    }

    const discountFormatted = currencyService.formatCurrency(discountAmountSar, targetCurrency);

    return {
      isValid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        scope: coupon.scope,
        minOrder: coupon.min_order,
        freeShipping
      },
      discountAmountSar,
      discountFormatted,
      freeShipping,
      message: coupon.discount_type === 'free_shipping'
        ? 'تم تطبيق خصم التوصيل المجاني بنجاح!'
        : `تم تطبيق خصم ${coupon.discount_value}% بنجاح (${discountFormatted.amountFormatted})`
    };
  }

  /**
   * Atomic Coupon Redemption during Order Creation
   * Prevents race conditions and double spending on max_uses limits
   */
  async atomicRedeemCoupon(dbOrNull, couponId) {
    if (!couponId) return { success: true };

    const success = await this.repo.incrementUsage(couponId);
    if (!success) {
      throw new Error('تعذر إتمام الطلب: تم استهلاك هذا الكوبون بالكامل أو انتهت مرات استخدامه بالتزامن');
    }

    return { success: true };
  }

  /**
   * Create a new coupon from Admin
   */
  async createCoupon({
    code,
    discountType = 'percentage',
    discountValue = 10,
    minOrder = 0,
    maxUses = 0,
    startDate = null,
    endDate = null,
    scope = 'public',
    customerPhone = null,
    customerId = null,
    sourceType = 'admin',
    sourceId = null,
    notes = null
  }, adminUser = null, ip = '127.0.0.1') {
    // Normalize code or auto-generate if empty
    let safeCode = this.normalizeCode(code);
    const safeType = ALLOWED_COUPON_TYPES[discountType] ? discountType : 'percentage';
    let safeValue = Math.max(Number(discountValue) || 0, 0);

    if (safeType === 'percentage') {
      if (safeValue <= 0 || safeValue > 100) {
        throw new Error('نسبة الخصم يجب أن تكون بين 1% و 100%');
      }
    } else if (safeType === 'free_shipping') {
      safeValue = 0;
    }

    if (!safeCode) {
      safeCode = this.generateSecureCode('ZFB', safeType, safeValue);
    }

    // Validate Code Format
    if (!/^[A-Z0-9_-]{3,30}$/.test(safeCode)) {
      throw new Error('كود الكوبون يجب أن يتكون من أحرف إنجليزية وأرقام وعلامة (-) فقط وبطول 3 إلى 30 حرف');
    }

    const existing = await this.repo.findByCode(safeCode);
    if (existing) {
      throw new Error(`كود الكوبون "${safeCode}" مسجل مسبقاً في النظام`);
    }

    const safeMinOrder = Math.max(Number(minOrder) || 0, 0);
    const safeMaxUses = Math.max(Number(maxUses) || 0, 0);
    const safeScope = ALLOWED_SCOPES[scope] ? scope : 'public';
    const safePhone = normalizePhone(customerPhone);
    const safeNotes = sanitize(notes || '');
    const adminName = adminUser?.full_name || adminUser?.username || 'Admin';

    const newCouponId = await this.repo.create({
      code: safeCode,
      discount_type: safeType,
      discount_value: safeValue,
      min_order: safeMinOrder,
      max_uses: safeMaxUses,
      start_date: startDate || null,
      end_date: endDate || null,
      scope: safeScope,
      customer_phone: safePhone || null,
      customer_id: customerId || null,
      source_type: sourceType,
      source_id: sourceId || null,
      created_by: adminName,
      notes: safeNotes || null
    });

    // Audit log
    try {
      await this.authRepo.logAction({
        user_id: adminUser?.id || null,
        action: 'CREATE_COUPON',
        entity: 'coupons',
        entity_id: newCouponId,
        old_values: null,
        new_values: { code: safeCode, type: safeType, value: safeValue, scope: safeScope },
        ip_address: ip || '127.0.0.1'
      });
    } catch (_) {}

    return await this.getCouponById(newCouponId);
  }

  /**
   * Update existing coupon from Admin
   */
  async updateCoupon(id, {
    discountType,
    discountValue,
    minOrder,
    maxUses,
    startDate,
    endDate,
    isActive,
    scope,
    customerPhone,
    notes
  }, adminUser = null, ip = '127.0.0.1') {
    const current = await this.repo.findById(id);

    if (!current) {
      throw new Error('الكوبون غير موجود');
    }

    const safeType = ALLOWED_COUPON_TYPES[discountType] ? discountType : current.discount_type;
    let safeValue = discountValue !== undefined ? Math.max(Number(discountValue) || 0, 0) : current.discount_value;

    if (safeType === 'percentage') {
      if (safeValue <= 0 || safeValue > 100) {
        throw new Error('نسبة الخصم يجب أن تكون بين 1% و 100%');
      }
    } else if (safeType === 'free_shipping') {
      safeValue = 0;
    }

    const safeMinOrder = minOrder !== undefined ? Math.max(Number(minOrder) || 0, 0) : current.min_order;
    const safeMaxUses = maxUses !== undefined ? Math.max(Number(maxUses) || 0, 0) : current.max_uses;
    const safeActive = isActive !== undefined ? (isActive ? 1 : 0) : current.is_active;
    const safeScope = scope && ALLOWED_SCOPES[scope] ? scope : current.scope;
    const safePhone = customerPhone !== undefined ? normalizePhone(customerPhone) : current.customer_phone;
    const safeNotes = notes !== undefined ? sanitize(notes) : current.notes;

    await this.repo.update(id, {
      discount_type: safeType,
      discount_value: safeValue,
      min_order: safeMinOrder,
      max_uses: safeMaxUses,
      start_date: startDate !== undefined ? startDate : current.start_date,
      end_date: endDate !== undefined ? endDate : current.end_date,
      is_active: safeActive,
      scope: safeScope,
      customer_phone: safePhone || null,
      notes: safeNotes || null
    });

    // Audit log
    try {
      await this.authRepo.logAction({
        user_id: adminUser?.id || null,
        action: 'UPDATE_COUPON',
        entity: 'coupons',
        entity_id: id,
        old_values: { is_active: current.is_active, value: current.discount_value, max_uses: current.max_uses },
        new_values: { is_active: safeActive, value: safeValue, max_uses: safeMaxUses },
        ip_address: ip || '127.0.0.1'
      });
    } catch (_) {}

    return await this.getCouponById(id);
  }

  /**
   * Delete / Deactivate coupon
   */
  async deleteCoupon(id, adminUser = null, ip = '127.0.0.1') {
    const current = await this.repo.findById(id);
    if (!current) throw new Error('الكوبون غير موجود');

    await this.repo.delete(id);

    try {
      await this.authRepo.logAction({
        user_id: adminUser?.id || null,
        action: 'DELETE_COUPON',
        entity: 'coupons',
        entity_id: id,
        old_values: current,
        new_values: null,
        ip_address: ip || '127.0.0.1'
      });
    } catch (_) {}

    return true;
  }

  /**
   * Get coupon by ID
   */
  async getCouponById(id) {
    const row = await this.repo.findById(id);
    if (!row) return null;
    return this.formatCouponRecord(row);
  }

  /**
   * List coupons with search and filtering
   */
  async listCoupons({
    search = '',
    status = '',
    type = '',
    scope = '',
    page = 1,
    limit = 20
  } = {}) {
    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const filters = { search, status, type, scope };
    const totalItems = await this.repo.count(filters);
    const rows = await this.repo.findAll(filters, limitNum, offset);

    const items = (rows || []).map(r => this.formatCouponRecord(r));

    return {
      items,
      totalItems,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalItems / limitNum) || 1
    };
  }

  /**
   * Get operational coupon analytics directly from SQLite
   */
  async getCouponStats() {
    return await this.repo.getStats();
  }

  /**
   * Atomic Reward Coupon Creation from Customer Report
   */
  async createRewardCouponForReport(report, value = 10, type = 'percentage', adminName = 'Admin') {
    const safeType = type === 'free_shipping' ? 'free_shipping' : 'percentage';
    const safeValue = safeType === 'percentage' ? Math.min(Math.max(Number(value) || 10, 1), 100) : 0;

    // Check if report already has an active reward coupon
    if (report.reward_code) {
      const existing = await this.repo.findByCode(report.reward_code);
      if (existing) {
        return this.formatCouponRecord(existing);
      }
    }

    const code = this.generateSecureCode('ZFB', safeType, safeValue);

    const newCouponId = await this.repo.create({
      code,
      discount_type: safeType,
      discount_value: safeValue,
      min_order: 0,
      max_uses: 1,
      start_date: null,
      end_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      scope: 'customer_report',
      customer_phone: report.customer_phone || null,
      customer_id: null,
      source_type: 'customer_report',
      source_id: String(report.id),
      created_by: adminName,
      notes: `مكافأة معتمدة لبلاغ المشكلة رقم ${report.report_number}`
    });

    return this.getCouponById(newCouponId);
  }

  formatCouponRecord(r) {
    const now = new Date();
    let statusKey = 'active';
    let statusLabel = 'نشط';

    if (!r.is_active) {
      statusKey = 'inactive';
      statusLabel = 'معطّل';
    } else if (r.end_date && new Date(r.end_date) < now) {
      statusKey = 'expired';
      statusLabel = 'منتهي الصلاحية';
    } else if (r.max_uses > 0 && r.used_count >= r.max_uses) {
      statusKey = 'exhausted';
      statusLabel = 'مستنفد الاستخدام';
    }

    return {
      ...r,
      statusKey,
      statusLabel,
      type_ar: ALLOWED_COUPON_TYPES[r.discount_type] || r.discount_type,
      scope_ar: ALLOWED_SCOPES[r.scope] || r.scope
    };
  }
}

const couponService = new CouponService();

module.exports = {
  CouponService,
  couponService,
  ALLOWED_COUPON_TYPES,
  ALLOWED_SCOPES
};
