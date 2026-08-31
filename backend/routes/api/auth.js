/**
 * Customer accounts: registration, login, session, profile.
 *
 * What this replaced: /api/auth/login used to take a phone number and nothing
 * else, create the account if it did not exist, and hand back a session for
 * whoever asked. Typing a stranger's phone number logged you in as them.
 * /api/auth/me?phone=... returned any customer's profile to anyone, and
 * /api/auth/profile updated any customer found by a phone number in the
 * request body. Identity is now proved with a password and read only from the
 * server-side session.
 *
 * Phone + password only. No OTP, no SMS, no email verification, no
 * verification code, and no second step of any kind -- by explicit product
 * decision, not by omission.
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getRepositories } = require('../../repositories');
const { normalizePhone } = require('../../utils/helpers');
const { toPublicCustomer, toSessionCustomer } = require('../../utils/customer-safe');
const { requireCustomer, currentCustomerId, sameOriginJson } = require('../../middleware/customer-auth');
const { createRateLimiter } = require('../../middleware/rate-limit');

// bcryptjs is a pure-JavaScript implementation, so each cost step is a real
// slice of the single Node thread. Cost 10 lands around 60-100ms on this VPS:
// slow enough that offline cracking of a stolen hash is expensive, fast enough
// that a login does not block the event loop long enough to be its own denial
// of service. It also matches the cost the admin accounts already use, so the
// two authentication paths cannot drift into different strengths.
const BCRYPT_COST = 10;

// A bcrypt hash of a value nobody can produce. Verifying against this when the
// phone number does not exist makes a miss cost the same as a wrong password,
// so response timing cannot be used to enumerate which numbers are registered.
const DUMMY_HASH = bcrypt.hashSync('zfb::nonexistent-account::timing-equalizer', BCRYPT_COST);

// One message for "no such number" and for "wrong password" alike. Telling
// them apart is a free customer-list oracle for anyone with a phone book.
const INVALID_CREDENTIALS = 'رقم الهاتف أو كلمة المرور غير صحيحة';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;
const MAX_NAME_LENGTH = 80;

// The per-account limit is the one that actually stops brute force: 8 wrong
// passwords per quarter hour makes guessing hopeless while leaving room for a
// customer who genuinely cannot remember theirs.
//
// The per-IP limit is deliberately looser. In Yemen a household, an office or
// a whole café shares one NAT address, so a tight IP budget punishes
// bystanders far more reliably than attackers -- and an attacker with a
// botnet simply spends someone else's addresses. It is a brake on one machine
// spraying many accounts, not the primary defence. Successful logins are
// refunded (see the limiter's forgive()), so ordinary use never consumes it.
const loginLimiter = createRateLimiter({
  name: 'customer-login',
  windowMs: 15 * 60 * 1000,
  maxPerIp: 60,
  maxPerSubject: 8,
  subject: req => normalizePhone(req.body && req.body.phone) || null,
  message: 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
});

const registerLimiter = createRateLimiter({
  name: 'customer-register',
  windowMs: 60 * 60 * 1000,
  maxPerIp: 15,
  maxPerSubject: 5,
  subject: req => normalizePhone(req.body && req.body.phone) || null,
  message: 'تم تجاوز عدد محاولات إنشاء الحساب المسموح بها. يرجى المحاولة بعد قليل.'
});

/**
 * Server-side validation of a registration body.
 *
 * The browser validates too, for the sake of a fast, kind form -- but the
 * browser is a client and its checks are advice. Everything is re-checked
 * here, where it is the only thing standing between a request and the table.
 *
 * @returns {{ok: true, value: Object} | {ok: false, field: string, error: string}}
 */
function validateRegistration(body) {
  const rawName = String(body.name || body.fullName || '').trim().replace(/\s+/g, ' ');
  if (!rawName) {
    return { ok: false, field: 'name', error: 'يرجى إدخال الاسم' };
  }
  if (rawName.length < 2) {
    return { ok: false, field: 'name', error: 'الاسم قصير جداً' };
  }
  if (rawName.length > MAX_NAME_LENGTH) {
    return { ok: false, field: 'name', error: `الاسم طويل جداً (الحد الأقصى ${MAX_NAME_LENGTH} حرفاً)` };
  }

  const phone = normalizePhone(body.phone);
  if (!phone) {
    return { ok: false, field: 'phone', error: 'يرجى إدخال رقم الهاتف' };
  }
  if (phone.length < MIN_PHONE_DIGITS || phone.length > MAX_PHONE_DIGITS) {
    return { ok: false, field: 'phone', error: 'رقم الهاتف غير صحيح' };
  }

  const password = String(body.password == null ? '' : body.password);
  const confirmPassword = String(
    body.confirmPassword != null ? body.confirmPassword
      : body.passwordConfirm != null ? body.passwordConfirm
        : body.password_confirmation != null ? body.password_confirmation
          : ''
  );

  if (!password) {
    return { ok: false, field: 'password', error: 'يرجى إدخال كلمة المرور' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, field: 'password', error: `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل` };
  }
  // bcrypt silently ignores everything past 72 bytes, which would make two
  // different long passwords interchangeable. Refuse rather than truncate.
  if (password.length > MAX_PASSWORD_LENGTH || Buffer.byteLength(password, 'utf8') > 72) {
    return { ok: false, field: 'password', error: 'كلمة المرور طويلة جداً' };
  }
  if (password !== confirmPassword) {
    return { ok: false, field: 'confirmPassword', error: 'كلمة المرور وتأكيدها غير متطابقتين' };
  }

  const parts = rawName.split(' ');
  return {
    ok: true,
    value: {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
      phone,
      password
    }
  };
}

/**
 * Start a brand-new session for a customer who just proved who they are.
 *
 * regenerate() issues a new session id and discards the old one. Without it,
 * an attacker who can plant a known session id in a victim's browser before
 * they log in still holds a valid id afterwards -- session fixation. The
 * pre-login session's contents (guest cart identifiers and the like) are
 * carried across deliberately, since losing a guest's basket at the moment
 * they sign in is a real regression.
 */
function establishSession(req, customerRow) {
  return new Promise((resolve, reject) => {
    const carriedOver = { ...req.session };
    delete carriedOver.cookie;
    delete carriedOver.customer;
    delete carriedOver.admin; // never inherit operator privileges into a shopper session

    req.session.regenerate(err => {
      if (err) return reject(err);

      Object.assign(req.session, carriedOver);
      req.session.customer = toSessionCustomer(customerRow);

      req.session.save(saveErr => {
        if (saveErr) return reject(saveErr);
        resolve(req.session.customer);
      });
    });
  });
}

/**
 * POST /api/auth/register
 *
 * Creates the account and signs the customer straight in. No verification
 * step stands between the two.
 */
router.post('/register', sameOriginJson, registerLimiter, async (req, res, next) => {
  try {
    const { customers: customerRepo } = getRepositories();

    const validation = validateRegistration(req.body || {});
    if (!validation.ok) {
      return res.status(400).json({ success: false, field: validation.field, error: validation.error });
    }

    const { firstName, lastName, phone, password } = validation.value;

    // An existing row may be a real account, or it may be the contact record
    // the checkout created implicitly for a guest who never had a password.
    // Those two must be treated very differently.
    const existing = await customerRepo.findAuthByPhone(phone);

    if (existing && existing.password_hash) {
      return res.status(409).json({
        success: false,
        field: 'phone',
        code: 'PHONE_TAKEN',
        error: 'يوجد حساب مسجل بهذا الرقم بالفعل. سجّل الدخول بدلاً من ذلك.'
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    let customerId;

    if (existing) {
      // A passwordless contact record from checkout. Claiming it with a
      // password is a tightening, not a loosening: before this change that
      // same phone number logged anybody in with no password at all. The row
      // keeps its stored spelling of the phone so nothing that already
      // references it breaks.
      const claimed = await customerRepo.claimPasswordlessAccount(existing.id, passwordHash);
      if (!claimed) {
        return res.status(409).json({
          success: false,
          field: 'phone',
          code: 'PHONE_TAKEN',
          error: 'يوجد حساب مسجل بهذا الرقم بالفعل. سجّل الدخول بدلاً من ذلك.'
        });
      }
      customerId = existing.id;
      await customerRepo.update(customerId, { first_name: firstName, last_name: lastName });
    } else {
      try {
        customerId = await customerRepo.createWithPassword({
          first_name: firstName,
          last_name: lastName,
          phone,
          password_hash: passwordHash
        });
      } catch (err) {
        // Two registrations of the same number can both pass the check above
        // and race to the INSERT. The unique index on customers.phone is what
        // decides the winner; the loser lands here. 23505 is PostgreSQL's
        // unique_violation, SQLITE_CONSTRAINT_UNIQUE its SQLite counterpart.
        const isDuplicate = err && (
          err.code === '23505' ||
          err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
          /duplicate key|unique constraint/i.test(err.message || '')
        );
        if (isDuplicate) {
          return res.status(409).json({
            success: false,
            field: 'phone',
            code: 'PHONE_TAKEN',
            error: 'يوجد حساب مسجل بهذا الرقم بالفعل. سجّل الدخول بدلاً من ذلك.'
          });
        }
        throw err;
      }
    }

    const customer = await customerRepo.findPublicById(customerId);
    await establishSession(req, customer);
    try { await customerRepo.touchLastLogin(customerId); } catch (_) {}

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      data: toPublicCustomer(customer)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 *
 * phone + password. Every failure answers with the same message and the same
 * status, whatever actually went wrong.
 */
router.post('/login', sameOriginJson, loginLimiter, async (req, res, next) => {
  try {
    const { customers: customerRepo } = getRepositories();
    const body = req.body || {};

    const phone = normalizePhone(body.phone);
    const password = String(body.password == null ? '' : body.password);

    if (!phone || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الهاتف وكلمة المرور' });
    }

    const account = await customerRepo.findAuthByPhone(phone);

    // Compare against a throwaway hash when there is no account, or when the
    // account is a passwordless checkout contact record. Returning early
    // instead would make a miss measurably faster than a hit and turn login
    // into a "is this number one of your customers?" lookup.
    const storedHash = (account && account.password_hash) || DUMMY_HASH;
    const passwordMatches = await bcrypt.compare(password, storedHash);

    if (!account || !account.password_hash || !passwordMatches) {
      return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', error: INVALID_CREDENTIALS });
    }

    const customer = await customerRepo.findPublicById(account.id);
    await establishSession(req, customer);
    try { await customerRepo.touchLastLogin(account.id); } catch (_) {}

    // A correct password is not an attack, so it must not eat into the budget
    // that protects a shared IP's other customers.
    if (req.rateLimit) req.rateLimit.forgive();

    return res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      data: toPublicCustomer(customer)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 *
 * Answers strictly about the session's own customer. The old handler took
 * ?phone= and returned whoever matched, which let anyone read any customer's
 * profile by guessing a phone number.
 */
router.get('/me', async (req, res, next) => {
  try {
    const customerId = currentCustomerId(req);
    if (!customerId) {
      // Not an error: the storefront calls this on every page to decide
      // whether to show "حسابي" or the sign-in card.
      return res.json({ success: true, authenticated: false, data: null });
    }

    const { customers: customerRepo } = getRepositories();
    const customer = await customerRepo.findPublicById(customerId);

    if (!customer) {
      // The row was deleted while the session lived on. Drop the session
      // rather than reporting a logged-in customer who no longer exists.
      delete req.session.customer;
      return res.json({ success: true, authenticated: false, data: null });
    }

    // Keep the session's display copy in step with the table.
    req.session.customer = toSessionCustomer(customer);

    return res.json({ success: true, authenticated: true, data: toPublicCustomer(customer) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/profile
 *
 * Updates the session's own customer and nothing else.
 *
 * The phone number is NOT updatable here. It is the account's identity and
 * the key every order, cart and address hangs off; changing it through the
 * ordinary profile form would let someone type a stranger's number and
 * quietly walk into their history. Changing a phone number is an operator
 * action.
 */
router.post('/profile', sameOriginJson, requireCustomer, async (req, res, next) => {
  try {
    const customerId = currentCustomerId(req);
    const { customers: customerRepo } = getRepositories();
    const body = req.body || {};

    const firstName = String(body.firstName || '').trim().slice(0, MAX_NAME_LENGTH);
    const lastName = String(body.lastName || '').trim().slice(0, MAX_NAME_LENGTH);
    const fallbackName = String(body.name || '').trim().replace(/\s+/g, ' ');

    const resolvedFirst = firstName || fallbackName.split(' ')[0] || '';
    const resolvedLast = lastName || fallbackName.split(' ').slice(1).join(' ') || '';

    if (!resolvedFirst) {
      return res.status(400).json({ success: false, field: 'name', error: 'يرجى إدخال الاسم' });
    }

    // An explicit field list, not a spread of the request body: without it, a
    // caller could post {"password_hash": "..."} or {"total_spent": 999999}
    // and have it written straight through -- mass assignment.
    await customerRepo.update(customerId, {
      first_name: resolvedFirst,
      last_name: resolvedLast,
      email: String(body.email || '').trim().slice(0, 160),
      city: String(body.city || '').trim().slice(0, 120),
      district: String(body.district || '').trim().slice(0, 120),
      address_detail: String(body.addressDetail || body.address_detail || '').trim().slice(0, 400)
    });

    const updated = await customerRepo.findPublicById(customerId);
    req.session.customer = toSessionCustomer(updated);

    return res.json({
      success: true,
      message: 'تم تحديث البيانات بنجاح',
      data: toPublicCustomer(updated)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 *
 * Destroys the session server-side, not just the client's copy of it. Deleting
 * req.session.customer alone would leave the session row in the table and the
 * id still valid in anyone's hands who had copied the cookie.
 */
router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true, message: 'تم تسجيل الخروج' });
  }

  req.session.destroy(err => {
    if (err) {
      console.error('Customer logout error:', err.message);
      return res.status(500).json({ success: false, error: 'تعذر تسجيل الخروج، حاول مرة أخرى' });
    }
    // The cookie names a session that no longer exists; clear it so the
    // browser stops presenting a dead id on every request.
    res.clearCookie('connect.sid', { httpOnly: true, sameSite: 'lax', path: '/' });
    return res.json({ success: true, message: 'تم تسجيل الخروج' });
  });
});

module.exports = router;
