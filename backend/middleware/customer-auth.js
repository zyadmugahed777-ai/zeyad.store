/**
 * Customer authentication -- deliberately separate from middleware/auth.js.
 *
 * middleware/auth.js authenticates *operators* against admin_users and gates
 * the admin panel through RBAC. This file authenticates *shoppers* against the
 * customers table. The two share the session cookie and nothing else: a
 * customer session sets req.session.customer and never req.session.admin, so
 * no amount of customer login can satisfy requireAuth/checkPermission, and an
 * admin session grants no customer-scoped data either. Keeping them apart is
 * what stops a shopper from ever reaching an admin route.
 */

/**
 * The authenticated customer's id, or null.
 *
 * This is the ONLY sanctioned way a route learns whose data it is looking at.
 * Never `req.body.customerId`, `req.query.customer_id`, `req.params.id`, or a
 * value out of localStorage: all four are typed by the caller, and trusting
 * any of them is the entire IDOR/BOLA class of bug. The session cookie is
 * signed and server-stored; the client cannot forge what it says.
 *
 * @param {import('express').Request} req
 * @returns {number|null}
 */
function currentCustomerId(req) {
  const id = req.session && req.session.customer && req.session.customer.id;
  return id ? Number(id) : null;
}

/**
 * Reject the request unless a customer is logged in.
 *
 * Answers JSON with 401 rather than redirecting: every caller is a fetch()
 * from the storefront, and a redirect to an HTML page would surface to the
 * user as a JSON parse error that names neither the route nor the real cause.
 */
function requireCustomer(req, res, next) {
  if (currentCustomerId(req)) return next();

  return res.status(401).json({
    success: false,
    code: 'CUSTOMER_AUTH_REQUIRED',
    error: 'يجب تسجيل الدخول للوصول إلى هذه البيانات'
  });
}

/**
 * Guard state-changing customer endpoints against cross-site submission.
 *
 * The session cookie is SameSite=Lax, which already keeps it off cross-site
 * POSTs -- but Lax is one browser default away from being the only thing
 * standing there, so this adds a second, independent check:
 *
 *   1. If the browser sent an Origin, it must be one we serve. A cross-origin
 *      page cannot forge or suppress this header.
 *   2. The body must be JSON. An attacker's hidden <form> can only send
 *      urlencoded/multipart/text bodies; asking for application/json forces a
 *      CORS preflight that our origin policy then refuses.
 *
 * Requests with no Origin at all (same-origin navigations in some browsers,
 * curl, the test suite) pass rule 1 and are still held to rule 2.
 */
function ALLOWED_ORIGIN_LIST() {
  return [
    'https://zeyad.store',
    'https://www.zeyad.store',
    `http://localhost:${process.env.PORT || 3000}`,
    `http://127.0.0.1:${process.env.PORT || 3000}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
}

function sameOriginJson(req, res, next) {
  const origin = req.get('origin');
  if (origin && origin !== 'null' && !ALLOWED_ORIGIN_LIST().includes(origin)) {
    return res.status(403).json({
      success: false,
      code: 'CROSS_ORIGIN_BLOCKED',
      error: 'تعذر تنفيذ الطلب'
    });
  }

  if (!req.is('application/json')) {
    return res.status(415).json({
      success: false,
      code: 'JSON_REQUIRED',
      error: 'تعذر تنفيذ الطلب'
    });
  }

  return next();
}

module.exports = { requireCustomer, currentCustomerId, sameOriginJson };
