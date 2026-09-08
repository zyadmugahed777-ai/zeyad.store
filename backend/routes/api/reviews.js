/**
 * Product reviews: read them, write one.
 *
 * Reading is public and returns approved reviews only. Writing requires a
 * logged-in customer and always produces a 'pending' row -- nothing a stranger
 * types reaches a shopper, or a search engine, without an operator seeing it
 * first.
 *
 * Three things are computed on this side and never read off the request:
 * the product being reviewed (resolved from the URL), who the author is (from
 * the session), and whether they actually bought the item. All three are
 * exactly the fields a fake-review script would want to set.
 */
const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { requireCustomer, currentCustomerId, sameOriginJson } = require('../../middleware/customer-auth');
const { createRateLimiter } = require('../../middleware/rate-limit');

const MAX_BODY = 1500;
const MIN_BODY = 10;

/**
 * Resolve the numeric product id from whatever the URL carries.
 * The storefront links products by their operator-facing code (P-853157), not
 * by the primary key, so both have to work.
 */
async function resolveProductId(repos, idOrCode) {
  const product = await repos.products.findById(String(idOrCode));
  return product ? Number(product.id) : null;
}

/** Public shape. Never exposes customer_id, status, or the raw row. */
function publicReview(r) {
  return {
    id: r.id,
    author: r.author_name,
    rating: Number(r.rating),
    body: r.body,
    verifiedPurchase: r.is_verified_purchase === true || r.is_verified_purchase === 1,
    createdAt: r.created_at
  };
}

// ---- read ------------------------------------------------------------------
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const productId = await resolveProductId(repos, req.params.id);
    if (!productId) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });

    const [reviews, aggregate] = await Promise.all([
      repos.reviews.findApproved(productId, 30),
      repos.reviews.aggregate(productId)
    ]);

    /* Whether THIS visitor may write one, so the page can show the form, a
       "thanks, it is being reviewed" note, or a prompt to sign in -- without a
       second round trip and without the client guessing. */
    const customerId = currentCustomerId(req);
    let mine = null;
    if (customerId) {
      const existing = await repos.reviews.findMine(customerId, productId);
      mine = existing
        ? { status: existing.status, rating: Number(existing.rating), body: existing.body }
        : null;
    }

    res.json({
      success: true,
      data: reviews.map(publicReview),
      // null, not zero: "not yet rated" is a different statement from "rated 0".
      aggregate,
      viewer: { signedIn: !!customerId, myReview: mine }
    });
  } catch (error) {
    next(error);
  }
});

// ---- write -----------------------------------------------------------------
/*
 * Rate limited per customer and per address. A review form is a spam target
 * even behind a login, and the account limit is what stops one compromised
 * customer writing a hundred reviews across the catalogue.
 */
const reviewLimiter = createRateLimiter({
  name: 'product-review',
  windowMs: 60 * 60 * 1000,
  maxPerIp: 20,
  maxPerSubject: 10,
  subject: (req) => {
    const id = currentCustomerId(req);
    return id ? 'customer:' + id : null;
  },
  message: 'لقد أرسلت عدداً كبيراً من التقييمات. حاول لاحقاً.'
});

router.post('/:id/reviews', sameOriginJson, requireCustomer, reviewLimiter, async (req, res, next) => {
  try {
    const repos = getRepositories();
    const customerId = currentCustomerId(req);

    const productId = await resolveProductId(repos, req.params.id);
    if (!productId) return res.status(404).json({ success: false, error: 'المنتج غير موجود' });

    // --- validate what the customer actually sent -------------------------
    const rating = Number(req.body && req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار تقييم من 1 إلى 5 نجوم' });
    }

    const body = String((req.body && req.body.body) || '').trim().replace(/\s+/g, ' ');
    if (body.length < MIN_BODY) {
      return res.status(400).json({ success: false, error: 'اكتب رأيك في ' + MIN_BODY + ' أحرف على الأقل' });
    }
    if (body.length > MAX_BODY) {
      return res.status(400).json({ success: false, error: 'الرأي طويل جداً' });
    }

    // One review per customer per product. The unique index enforces this too;
    // catching it here gives the shopper a sentence instead of a 500.
    const existing = await repos.reviews.findMine(customerId, productId);
    if (existing) {
      return res.status(409).json({
        success: false,
        code: 'ALREADY_REVIEWED',
        error: existing.status === 'pending'
          ? 'تقييمك قيد المراجعة، شكراً لك'
          : 'لقد قيّمت هذا المنتج من قبل'
      });
    }

    /* The display name is taken from the customer record, not from the
       request. A review page where the author can type any name is a review
       page where anyone can appear to be anyone. */
    const customer = await repos.customers.findById(customerId);
    const authorName = [customer && customer.first_name, customer && customer.last_name]
      .filter(Boolean).join(' ').trim() || 'عميل زياد ستور';

    const isVerifiedPurchase = await repos.reviews.hasPurchased(customerId, productId);

    const created = await repos.reviews.create({
      productId, customerId, authorName, rating, body, isVerifiedPurchase
    });

    res.status(201).json({
      success: true,
      data: { id: created.id, status: 'pending' },
      message: 'شكراً لك. سيظهر تقييمك بعد مراجعته.'
    });
  } catch (error) {
    // The unique index is the last line of defence against a double submit.
    if (error && /idx_product_reviews_one_per_customer|duplicate key/i.test(String(error.message))) {
      return res.status(409).json({ success: false, code: 'ALREADY_REVIEWED', error: 'لقد قيّمت هذا المنتج من قبل' });
    }
    next(error);
  }
});

module.exports = router;
