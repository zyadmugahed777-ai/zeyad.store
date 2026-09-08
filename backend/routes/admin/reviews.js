/**
 * Review moderation.
 *
 * Every review a customer writes lands here as 'pending' and reaches no
 * shopper — and no search engine — until an operator approves it. That queue
 * is the whole reason the shop can publish star ratings honestly: the numbers
 * come from real customers, and someone read each one before it went out.
 *
 * Two ways to say no, and they are not the same:
 *
 *   reject  keeps the row and hides it. The customer cannot resubmit the same
 *           text, because one review per customer per product is a unique
 *           index. This is the answer for "not about the product", "spam",
 *           "wrong language" -- the ordinary cases.
 *   delete  removes it entirely, and frees that customer to write a fresh one.
 *           This is for content that should not sit in the database at all:
 *           abuse, a phone number, somebody else's personal data.
 */
const router = require('express').Router();
const { getRepositories } = require('../../repositories');
const { setFlash, requireAuth } = require('../../middleware/auth');
const storefront = require('../../services/storefront-data-service');

router.use(requireAuth);

const STATUSES = ['pending', 'approved', 'rejected'];

router.get('/', async (req, res, next) => {
  try {
    const repos = getRepositories();
    const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';

    const [reviews, counts] = await Promise.all([
      repos.reviews.findForAdmin(status, 200, 0),
      repos.reviews.countByStatus()
    ]);

    res.render('admin/reviews/list', {
      title: 'تقييمات العملاء',
      active: 'reviews',
      reviews,
      counts,
      status,
      csrfToken: (req.session && req.session.csrfToken) || res.locals.csrfToken || ''
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Approving or rejecting changes what the storefront publishes -- the stars,
 * the count, and the aggregateRating in the product's structured data -- so
 * the cached storefront payload has to be dropped, or the change would not
 * show until the cache expired on its own.
 */
async function applyAndInvalidate(repos, id, status) {
  await repos.reviews.setStatus(id, status);
  try { storefront.invalidate(); } catch (_) {}
}

router.post('/:id/approve', async (req, res) => {
  try {
    await applyAndInvalidate(getRepositories(), req.params.id, 'approved');
    setFlash(req, 'success', 'تم نشر التقييم');
  } catch (error) {
    console.error('Approve review error:', error);
    setFlash(req, 'danger', 'تعذر نشر التقييم: ' + error.message);
  }
  res.redirect('/admin/reviews?status=' + (req.body.back || 'pending'));
});

router.post('/:id/reject', async (req, res) => {
  try {
    await applyAndInvalidate(getRepositories(), req.params.id, 'rejected');
    setFlash(req, 'success', 'تم رفض التقييم ولن يظهر للزبائن');
  } catch (error) {
    console.error('Reject review error:', error);
    setFlash(req, 'danger', 'تعذر رفض التقييم: ' + error.message);
  }
  res.redirect('/admin/reviews?status=' + (req.body.back || 'pending'));
});

router.post('/:id/delete', async (req, res) => {
  try {
    const repos = getRepositories();
    await repos.reviews.remove(req.params.id);
    try { storefront.invalidate(); } catch (_) {}
    setFlash(req, 'success', 'تم حذف التقييم نهائياً');
  } catch (error) {
    console.error('Delete review error:', error);
    setFlash(req, 'danger', 'تعذر حذف التقييم: ' + error.message);
  }
  res.redirect('/admin/reviews?status=' + (req.body.back || 'pending'));
});

module.exports = router;
