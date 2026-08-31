// Node.js network-level error codes (connection refused/timed out/DNS
// failure/etc.) that a raw `net`/`pg-pool` error carries -- these leak
// internal infrastructure (e.g. "connect ECONNREFUSED 127.0.0.1:5433")
// just as much as a SQL-level error leaks schema details.
const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE']);

/**
 * A `pg` driver error carries fields like code (SQLSTATE), severity, table,
 * column, and constraint that plain application-thrown `new Error(...)`
 * objects never have. Used to tell "an intentional, Arabic, user-facing
 * business error" apart from "a raw database error whose .message can
 * contain table/column/constraint names" -- the latter must never reach
 * the client as-is. Also catches connection-level failures (ECONNREFUSED
 * and friends), which leak host/port infrastructure details the same way.
 */
function isRawDatabaseError(err) {
  if (!err) return false;
  if (err.severity || err.table || err.constraint) return true;
  if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) return true;
  if (err.code && NETWORK_ERROR_CODES.has(err.code)) return true;
  return false;
}

/**
 * Node filesystem/OS errors put the absolute path straight into .message, e.g.
 *   ENOENT: no such file or directory, stat 'D:\played\Zeyad For Business\404.html'
 * Those are not database errors, so they used to fall through to the "this is
 * an intentional Arabic business message" branch and were returned verbatim --
 * disclosing the server's real directory layout to any client, in production
 * too, not just in development. A genuine `new Error('...')` thrown by our own
 * code never carries syscall/errno/path.
 */
function isRawSystemError(err) {
  if (!err) return false;
  return Boolean(err.syscall || err.errno !== undefined || err.path);
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  const status = err.status || 500;
  const isInternal = isRawDatabaseError(err) || isRawSystemError(err);
  const safeMessage = isInternal ? 'حدث خطأ في الخادم، يرجى المحاولة لاحقاً' : (err.message || 'حدث خطأ في الخادم');

  // API error response
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      success: false,
      error: safeMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // Multer errors (file size, unexpected fields, etc.)
  if (err.name === 'MulterError' || err.code === 'LIMIT_FILE_SIZE') {
    // Drain any remaining request body before responding -- if the client is
    // still streaming a rejected (oversized) upload when we respond, some
    // browsers/proxies see that as a connection reset rather than our actual
    // error response.
    if (!req.readableEnded) {
      req.resume();
    }
    if (req.originalUrl.startsWith('/api') || req.path.startsWith('/api')) {
      return res.status(400).json({ success: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'حجم الملف كبير جداً (الحد الأقصى 50MB)' : err.message });
    }
    const flashMsg = err.code === 'LIMIT_FILE_SIZE'
      ? 'حجم الملف كبير جداً (الحد الأقصى 50MB)'
      : `خطأ في رفع الملفات: ${err.message}`;
    if (req.session) {
      req.session.flash = { type: 'danger', message: flashMsg };
    }
    return res.redirect('back');
  }

  // Admin panel error
  if (req.originalUrl.startsWith('/admin') || req.path.startsWith('/admin')) {
    return res.status(status).render('admin/error', {
      title: 'خطأ في النظام',
      message: safeMessage,
      error: safeMessage,
      status,
      stack: process.env.NODE_ENV === 'development' ? (err.stack || '') : ''
    });
  }

  // Default
  res.status(status).json({ success: false, error: safeMessage });
}

module.exports = errorHandler;
