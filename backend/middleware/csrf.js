const crypto = require('crypto');

/**
 * Does this request expect a JSON reply?
 *
 * This matters because the failure path below used to answer *every* rejected
 * request with an HTML redirect. For the admin panel's fetch() callers that
 * meant the browser quietly followed the redirect, handed the JS an HTML login
 * or dashboard page, and `await res.json()` blew up with
 *   Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 * -- an error that names neither CSRF nor the route that actually refused.
 * The visual editor, the theme builder, the media library and the page builder
 * all failed this way, and all four looked like "the editor just doesn't work".
 */
function wantsJson(req) {
  if (req.xhr) return true;
  if (req.is && req.is('application/json')) return true;
  const requestedWith = req.get('x-requested-with');
  if (requestedWith && requestedWith.toLowerCase() === 'xmlhttprequest') return true;
  const accept = req.get('accept') || '';
  // Treat as JSON only when JSON is preferred over HTML, so ordinary form
  // posts (Accept: text/html,...,*/*) keep their redirect behaviour.
  return accept.includes('application/json') && !accept.includes('text/html');
}

function csrfProtection(req, res, next) {
  if (!req.session) return next();

  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const submittedToken = (req.body && req.body._csrf) || (req.query && req.query._csrf) || req.get('x-csrf-token') || req.get('x-xsrf-token');
  if (submittedToken && submittedToken === req.session.csrfToken) {
    return next();
  }

  // If this is a multipart request from an authenticated admin session,
  // allow it through to route-level multer parser
  if (req.is && req.is('multipart/form-data') && req.session && req.session.admin) {
    return next();
  }

  if (wantsJson(req)) {
    return res.status(403).json({
      success: false,
      code: 'CSRF_TOKEN_INVALID',
      message: 'انتهت صلاحية جلسة الأمان (CSRF). حدّث الصفحة ثم أعد المحاولة.'
    });
  }

  req.session.flash = { type: 'danger', message: 'انتهت صلاحية النموذج. الرجاء المحاولة مرة أخرى.' };
  return res.redirect(req.get('referer') || '/admin');
}

module.exports = csrfProtection;
module.exports.wantsJson = wantsJson;
