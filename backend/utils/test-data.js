/**
 * Recognising development leftovers.
 *
 * Rows named TEST-P-1787430261120 / "منتج اختبار السلة" get created by the
 * automated suites and by hand during debugging, and nothing deletes them
 * afterwards. They are ordinary active products as far as every query is
 * concerned, so they surface wherever products surface -- which is fine on a
 * department page nobody browses during a test run, and not fine at all on the
 * shop's front page or in a search engine's index.
 *
 * This is a safety net, not a fix. It hides nothing from the site's own
 * navigation and it changes no data; the rows themselves should be deleted,
 * which is a decision for whoever owns the database, not for a render pass.
 */

const LOOKS_LIKE_TEST_ID = /^(TEST|CART-TEST|FIN-TEST|P2A-TEST|SEED)[-_]/i;
const LOOKS_LIKE_TEST_TITLE = /(تجريبي|اختبار|test)/i;

/**
 * @param {object} p a product row or storefront product object
 * @returns {boolean}
 */
function looksLikeTestProduct(p) {
  if (!p) return false;
  const id = String(p.product_id || p.id || '');
  const title = String(p.title || p.name_ar || '');
  return LOOKS_LIKE_TEST_ID.test(id) || LOOKS_LIKE_TEST_TITLE.test(title);
}

module.exports = { looksLikeTestProduct, LOOKS_LIKE_TEST_ID, LOOKS_LIKE_TEST_TITLE };
