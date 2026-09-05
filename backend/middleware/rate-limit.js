/**
 * Sliding-window rate limiting for credential endpoints.
 *
 * In-process and in-memory, matching the coupon limiter already in
 * routes/api/cart.js -- the app runs as a single Node process on one VPS, so a
 * shared store would add a dependency for no gain. If this is ever run behind
 * more than one process, this becomes per-process and the effective limit
 * multiplies by the process count; that is a real limitation, written down
 * here rather than discovered later.
 *
 * The design point that matters: brute force is bounded per *account*, not
 * only per IP. Limiting by IP alone lets a botnet spread one account's guesses
 * across thousands of addresses, and limiting by account alone lets one IP
 * walk the whole customer list a few guesses at a time. Both keys are counted,
 * and either one tripping refuses the request.
 *
 * Successful logins are NOT counted. A household or an office behind one NAT
 * address shares an IP, and a legitimate customer must never be locked out by
 * their neighbours simply logging in correctly.
 */

const buckets = new Map();

// Sweep on a timer rather than on every request: an attacker hammering one
// endpoint should not also be paying us to walk the whole map each time.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.expiresAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);
if (sweeper.unref) sweeper.unref();

function hit(key, windowMs, max) {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + windowMs });
    return { blocked: false, retryAfter: 0 };
  }

  entry.count += 1;
  if (entry.count > max) {
    return { blocked: true, retryAfter: Math.ceil((entry.expiresAt - now) / 1000) };
  }
  return { blocked: false, retryAfter: 0 };
}

/**
 * Build a limiter middleware.
 *
 * @param {Object} options
 * @param {string} options.name    namespace, so login and register do not share counters
 * @param {number} options.windowMs
 * @param {number} options.maxPerIp
 * @param {number} [options.maxPerSubject] limit for the account being targeted
 * @param {(req: import('express').Request) => string|null} [options.subject]
 *        identifies the account under attack (the submitted phone number).
 *        Returning null means "no subject to protect", and only the IP limit
 *        applies.
 * @param {string} options.message Arabic, user-facing
 */
/**
 * @param {function} [onBlocked] how to answer a blocked request. The default
 *   sends JSON, which is right for the API. A form POST that renders HTML
 *   needs to render its page back with an error instead -- showing an operator
 *   a raw JSON body would read as the panel having crashed.
 */
function createRateLimiter({ name, windowMs, maxPerIp, maxPerSubject, subject, message, onBlocked }) {
  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    const checks = [hit(`${name}:ip:${ip}`, windowMs, maxPerIp)];

    if (subject && maxPerSubject) {
      const subjectKey = subject(req);
      if (subjectKey) {
        checks.push(hit(`${name}:sub:${subjectKey}`, windowMs, maxPerSubject));
      }
    }

    const blocked = checks.find(c => c.blocked);
    if (blocked) {
      res.set('Retry-After', String(blocked.retryAfter));
      if (typeof onBlocked === 'function') {
        return onBlocked(req, res, { retryAfter: blocked.retryAfter, message });
      }
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        error: message,
        retryAfter: blocked.retryAfter
      });
    }

    // Handed to the route so a *successful* login can refund its own attempt,
    // keeping the limit a brake on guessing rather than on using the site.
    req.rateLimit = {
      forgive() {
        const entry = buckets.get(`${name}:ip:${ip}`);
        if (entry && entry.count > 0) entry.count -= 1;
        if (subject) {
          const subjectKey = subject(req);
          const subEntry = subjectKey && buckets.get(`${name}:sub:${subjectKey}`);
          if (subEntry && subEntry.count > 0) subEntry.count -= 1;
        }
      }
    };

    return next();
  };
}

/** Test seam: drops all counters. Never called by the app itself. */
function resetRateLimits() {
  buckets.clear();
}

module.exports = { createRateLimiter, resetRateLimits };
