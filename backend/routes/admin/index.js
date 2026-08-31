const router = require('express').Router();
const { requireAuth, loginAdmin, setFlash } = require('../../middleware/auth');
const csrfProtection = require('../../middleware/csrf');
const { formatPrice, formatDate, formatDateTime, toDateInput, toDateTimeInput, parsePagination, paginationInfo, statusLabel, statusColor,
  statusTint, paymentLabel, colorSwatch } = require('../../utils/helpers');

// The default-admin bootstrap now runs from server.js bootstrapDatabase(),
// awaited and ordered after the reference-data seed it depends on. Calling it
// here at require time was a fire-and-forget async DB write that raced the
// seed and failed silently on a fresh PostgreSQL database.

const { getRepositories } = require('../../repositories');

// Make helpers available to all admin views
router.use(async (req, res, next) => {
  const currentCurrency = (req.session && req.session.admin_currency) || 'SAR';
  let exchangeRate = 140;
  try {
    const repos = getRepositories();
    const rateRow = (await repos.settings.findByKey('exchange_rate_sar_yer')) || (await repos.settings.findByKey('exchange_rate'));
    if (rateRow && rateRow.value) exchangeRate = parseFloat(rateRow.value) || 140;
  } catch (_) {}

  res.locals.currentCurrency = currentCurrency;
  res.locals.exchangeRate = exchangeRate;
  res.locals.helpers = { 
    formatPrice: (amount, cur = currentCurrency) => formatPrice(amount, cur, exchangeRate), 
    formatDate, 
    formatDateTime, 
    toDateInput,
    toDateTimeInput,
    parsePagination, 
    paginationInfo, 
    statusLabel, 
    statusColor, 
    // Translucent wash of the status colour, for badge backgrounds. The views
    // used to derive this themselves with a replace() that assumed an rgb()
    // string and silently produced the text colour instead, making the badge
    // text invisible.
    statusTint, 
    paymentLabel,
    colorSwatch
  };
  res.locals.admin = req.session ? req.session.admin : null;
  res.locals.flash = req.session ? req.session.flash : null;
  if (req.session) delete req.session.flash;
  next();
});

// Fast Currency Switch Route
router.get('/currency/switch', (req, res) => {
  const code = (req.query.code || 'SAR').toUpperCase();
  const validCodes = ['SAR', 'YER', 'USD'];
  if (validCodes.includes(code) && req.session) {
    req.session.admin_currency = code;
  }
  const referer = req.get('Referrer') || '/admin';
  res.redirect(referer);
});

// Auth routes
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { title: 'تسجيل الدخول', layout: false });
});

// POST /admin/login - Authenticate
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await loginAdmin(username, password, req);
  
  if (admin) {
    req.session.admin = admin;
    const returnTo = req.session.returnTo || '/admin/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } else {
    res.render('admin/login', { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Protect all following routes
router.use(requireAuth);
router.use(csrfProtection);

const { checkPermission } = require('../../middleware/rbac');

// Any successful write to the tables the storefront now reads must drop the
// cached payload, so an operator who saves a change and reloads the site sees
// it at once rather than waiting out a TTL and assuming the save failed.
// One hook here beats an invalidate() call sprinkled through every route --
// and cannot be forgotten when the next write path is added.
const { invalidate: invalidateStorefrontData } = require('../../services/storefront-data-service');
const STOREFRONT_TABLES = /^\/(offers|categories|departments|banners|settings)(\/|$)/;

router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (!STOREFRONT_TABLES.test(req.path)) return next();

  res.on('finish', () => {
    // 2xx and 3xx both count: admin writes answer with a redirect on success.
    if (res.statusCode < 400) invalidateStorefrontData();
  });
  next();
});

// Mount sub-routers with RBAC protection
router.use('/', require('./dashboard'));
router.use('/dashboard', require('./dashboard'));
router.use('/products', checkPermission('products:view'), require('./products'));
router.use('/frame-products', checkPermission('frame-products:view'), require('./frame-products'));
router.use('/departments', checkPermission('departments:view'), require('./departments'));
router.use('/categories', checkPermission('categories:view'), require('./categories'));
router.use('/orders', checkPermission('orders:view'), require('./orders'));
router.use('/customers', checkPermission('customers:view'), require('./customers'));
router.use('/branches', checkPermission('branches:view'), require('./branches'));
router.use('/offers', checkPermission('offers:view'), require('./offers'));
router.use('/banners', checkPermission('banners:view'), require('./banners'));
router.use('/editor', checkPermission('pages:view'), require('./editor'));
router.use('/media', checkPermission('media:view'), require('./media'));
router.use('/pages', checkPermission('pages:view'), require('./pages')); 
router.use('/notifications', checkPermission('notifications:view'), require('./notifications'));
router.use('/settings', checkPermission('settings:view'), require('./settings'));
router.use('/theme', checkPermission('settings:view'), require('./theme'));
router.use('/ai-employee', checkPermission('ai:view'), require('./ai-employee'));
router.use('/najm', checkPermission('ai:view'), require('./najm'));
router.use('/users', checkPermission('users:view'), require('./users'));
router.use('/reports', checkPermission('reports:view'), require('./reports'));
router.use('/customer-reports', checkPermission('customer-reports:view'), require('./customer-reports'));
router.use('/requests', checkPermission('requests:view'), require('./requests'));
router.use('/coupons', checkPermission('coupons:view'), require('./coupons'));
router.use('/delivery', checkPermission('delivery:view'), require('./delivery'));

module.exports = router;
