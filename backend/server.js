const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const webpMiddleware = require('./middleware/webp');
const morgan = require('morgan');
const errorHandler = require('./middleware/error');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Trust exactly one reverse proxy in production.
//
// Two things depend on this and both fail silently without it. The session
// cookie is `secure` in production, and express-session refuses to set a
// secure cookie unless it believes the connection is HTTPS -- behind nginx
// terminating TLS, Express sees plain HTTP and no customer can ever stay
// logged in. And req.ip, which the login rate limiter counts against, would
// be the proxy's address for every visitor on earth: one shared bucket, so
// one attacker's lockout would lock out the whole site.
//
// The value is 1, not `true`. `true` trusts the entire X-Forwarded-For chain,
// including the part the client wrote, which lets an attacker forge a fresh
// req.ip per request and walk straight around the rate limiter. 1 means
// "believe the single hop closest to us" -- our own nginx.
//
// Left off outside production, where connections are direct and req.ip is
// already the real peer.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Node >=15 terminates the process on an unhandled promise rejection.
// The codebase has many fire-and-forget async calls (consultations, quotes,
// designs, contact, newsletter, settings saves, syncFrontend(), AI admin
// writes); until those are all individually audited and awaited, log
// rejections instead of crashing the whole server on one bad call site.
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason instanceof Error ? reason.stack : reason);
});

// =============================================
// MIDDLEWARE
// =============================================
// ---------------------------------------------------------------------------
// CORS -- restricted to the real production domain.
//
// Was unrestricted cors(), which reflects any request Origin back as allowed.
// credentials is never set to true anywhere in this codebase (confirmed by
// grep), so browsers never attached the session cookie to a cross-origin
// request regardless -- the practical exposure was public read endpoints
// (products/categories/etc, which are public anyway) being fetchable from any
// origin. Restricting this closes that off with zero behavior change for the
// site itself, since the storefront and admin panel only ever call same-origin.
//
// The domain (zeyad.store) is confirmed by the project owner. Localhost
// origins stay allowed unconditionally so local development and the test
// suite are unaffected.
// ---------------------------------------------------------------------------
// The loopback entries follow the port the server was actually started on.
// They were hardcoded to 3000, so running on any other port (a second
// instance, the test suite, a dev server sharing the machine) made the browser
// reject every same-machine request with the generic "حدث خطأ في الطلب" -- an
// error that names neither CORS nor the port, and reads to whoever hits it as
// "login is broken". Port 3000 stays listed so the common case keeps working
// even when PORT is set to something else.
const ALLOWED_ORIGINS = [
  'https://zeyad.store',
  'https://www.zeyad.store',
];

// The comment above says localhost is allowed unconditionally; the list only
// ever allowed port 3000. Running the app on any other port -- which the test
// suite and a second checkout both do -- made the site's OWN same-origin fetches
// fail with 403, and the storefront's estimator forms broke without any hint of
// why. Match the stated intent: any loopback port, and only loopback.
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/*
 * A rejected origin has to be identifiable in the log.
 *
 * The rejection below threw `new Error('حدث خطأ في الطلب')` and pm2 recorded
 * exactly that: no origin, no path, no address. Bursts of a dozen identical
 * anonymous lines several times a day read like the site was failing, and
 * there was no way to tell from the log whether a customer or a scanner had
 * produced them. (Measured on 5 September: 122 of 4,398 requests, every one
 * from two addresses probing /graphql, /proxy, /fetch and /wp-json/batch/v1
 * with rotating forged bot user-agents. Not one came from zeyad.store.)
 *
 * The origin goes to the SERVER log only. The client still gets the same
 * opaque message -- telling a prober which origins are allowed is telling it
 * what to forge next.
 *
 * Throttled per origin, because a sustained scan would otherwise write a line
 * per request and bury everything else. The suppressed count is reported when
 * the window closes, so the volume is never hidden, only summarised.
 */
const CORS_LOG_WINDOW_MS = 60000;
const corsRejections = new Map();

function noteRejectedOrigin(origin) {
  const now = Date.now();
  const seen = corsRejections.get(origin);

  if (!seen || now - seen.firstAt >= CORS_LOG_WINDOW_MS) {
    if (seen && seen.count > 1) {
      console.warn('[cors] ' + (seen.count - 1) + ' further request(s) from ' + origin + ' in the previous minute');
    }
    corsRejections.set(origin, { firstAt: now, count: 1 });
    console.warn('[cors] refused a cross-origin request from ' + origin);
    return;
  }

  seen.count++;

  // Unbounded growth is the failure mode of any map keyed on attacker input.
  if (corsRejections.size > 200) {
    for (const [key, val] of corsRejections) {
      if (now - val.firstAt >= CORS_LOG_WINDOW_MS) corsRejections.delete(key);
    }
  }
}

app.use(cors({
  origin(origin, callback) {
    // No Origin header, or the literal opaque origin "null" (sandboxed
    // contexts, some redirect chains, privacy modes) -- neither identifies a
    // specific cross-origin actor to block, so there is nothing to restrict.
    if (!origin || origin === 'null') return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (LOOPBACK_ORIGIN.test(origin)) return callback(null, true);
    // A real, specific, disallowed origin. Reject with a controlled error --
    // never the raw origin string or a stack trace back to the client. The
    // origin is recorded on this side only.
    noteRejectedOrigin(origin);
    const err = new Error('حدث خطأ في الطلب');
    err.status = 403;
    return callback(err);
  }
}));

// ---------------------------------------------------------------------------
// Content-Security-Policy -- enabled for the first time.
//
// Was contentSecurityPolicy: false. The site relies on inline <script> blocks
// (27+ across admin views alone), inline style attributes, and inline event
// handler attributes (onclick etc.) throughout both the storefront and the
// admin panel. A strict CSP (no unsafe-inline) would break all of that
// immediately and requires a dedicated nonce-injection pass across every
// template -- exactly what Wave 11 deferred, and out of scope for a
// config-only hardening pass.
//
// This is the improvement available without touching any template: keep
// 'unsafe-inline' for script-src and style-src (so nothing currently on the
// page breaks), but stop allowing script/style/image/font/connect from an
// arbitrary origin. That still blocks a same-origin-script-tag XSS payload
// pointed at an attacker-controlled host, since that host is not in the
// allowlist, while every legitimate resource this site actually loads keeps
// working. Every origin below was found by grepping the real storefront HTML
// and every admin EJS view, not assumed:
//   cdn.jsdelivr.net / unpkg.com        -- remixicon font CSS, Leaflet (storefront)
//   cdnjs.cloudflare.com                -- Cropper.js (admin media manager)
//   cdn.tiny.cloud                      -- TinyMCE (admin CMS editor)
//   cdn.tailwindcss.com                 -- Tailwind (admin theme builder)
//   fonts.googleapis.com/fonts.gstatic.com -- Google Fonts
// ---------------------------------------------------------------------------
// Compression. Every response was going out raw: a catalogue page is 350KB of
// HTML, styles.css is 168KB, site.js is 85KB -- all of it highly compressible
// text. On a VPS this is the single cheapest win available, and it matters
// most on the phone connections that make up nearly all of this shop's
// traffic. Must sit above the routes so it wraps their responses.
app.use(compression({
  // Below roughly a TCP segment there is nothing to gain and a little CPU to
  // lose, so leave the small stuff alone.
  threshold: 1024,
  // 6 is zlib's default and the right trade here: 9 costs noticeably more CPU
  // for a percent or two of size on text this size.
  level: 6,
  filter: (req, res) => {
    // Honour a client that explicitly opts out.
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", "'unsafe-inline'",
        'https://cdn.jsdelivr.net', 'https://unpkg.com',
        // cdn.tiny.cloud is gone: TinyMCE is served from /vendor/tinymce now.
        'https://cdnjs.cloudflare.com', 'https://cdn.tailwindcss.com'
      ],
      // Helmet sets script-src-attr 'none' by default, and merges its defaults
      // with whatever directives you pass. That default silently undid the
      // whole point of keeping 'unsafe-inline' above: script-src governs
      // <script> blocks, script-src-attr governs inline event HANDLERS, and
      // 'none' killed every one of them site-wide -- 1,033 in the storefront
      // HTML and 78 in the admin views. <script> blocks kept running, so every
      // function was defined and simply never called: the colour presets and
      // primary-image stars on the product form did nothing, and addToCart on
      // every product card did nothing either.
      //
      // Restoring it to 'unsafe-inline' grants no capability that
      // script-src 'unsafe-inline' does not already grant.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'", "'unsafe-inline'",
        'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net',
        'https://unpkg.com', 'https://cdnjs.cloudflare.com'
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Explicitly omitted: Helmet includes this by default. It rewrites every
      // http:// sub-resource request to https://, which breaks asset loading
      // outright if the origin is ever reached over plain HTTP with no HTTPS
      // listener behind it -- unverified from this environment (see point 2).
      // Re-enable once HTTPS termination in front of production is confirmed.
      upgradeInsecureRequests: null
    }
  }
}));
// 'dev' is a development format: colourised, no timestamp, no bytes, no
// referrer/user-agent. Production wants a parseable access log, so use the
// standard combined format there and keep 'dev' locally.
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
const visualCmsMiddleware = require('./middleware/visual-cms');
app.use(visualCmsMiddleware);

// Redirect legacy AI assistant to Najm AI
app.get(['/ai-assistant.html', '/ai-assistant'], (req, res) => {
  res.redirect(301, '/najm.html');
});

// Clean Product Detail Page Routing
app.get(['/product/:id', '/products/:id', '/p/:id'], (req, res) => {
  res.redirect(301, `/product.html?id=${encodeURIComponent(req.params.id)}`);
});

// The repo root is served as static files below so the storefront's
// top-level HTML/CSS/JS assets work, but the root also contains the
// `backend/` app itself (including db/zeyad.db and db/backups/*.sql --
// admin bcrypt hashes and customer PII) plus assorted dev/ops directories
// that were never meant to be web-accessible. express.static only ignores
// dotfiles by default; block these non-dotfile paths explicitly before the
// static handler ever sees them.
// The repo root has no 404.html, so sendFile() rejected with an ENOENT whose
// message contains the absolute server path -- every unmatched route produced
// an error-handler round trip and leaked the directory layout. Serve the file
// when it exists and fall back to a plain response when it does not, so a
// missing asset can never turn a 404 into a 500.
const NOT_FOUND_PAGE = path.join(__dirname, '..', '404.html');
function sendNotFound(res) {
  const fsMod = require('fs');
  if (fsMod.existsSync(NOT_FOUND_PAGE)) {
    return res.status(404).sendFile(NOT_FOUND_PAGE);
  }
  return res.status(404).type('html').send(
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">' +
    '<title>غير موجود</title><h1>404</h1><p>الصفحة غير موجودة.</p>'
  );
}

const BLOCKED_STATIC_PREFIXES = [
  '/backend', '/node_modules', '/backups', '/docs', '/scratch', '/archive',
  '/ai', '/.git', '/.agent', '/.agents', '/.claude', '/.codex', '/.vscode'
];
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (BLOCKED_STATIC_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))) {
    return sendNotFound(res);
  }
  next();
});

// The generated data files are rewritten every time an operator saves a
// product or a setting, but the pages reference them at a version stamp that
// was last bumped by hand in August. Express's default 'public, max-age=0' left
// browsers free to serve a heuristically cached copy: a page was observed
// holding 100 products with no taxonomy while the server was serving 402 with
// it, which reads to the operator as "I added a product and the site ignored
// it". These three must always be revalidated.
const ALWAYS_FRESH = new Set(['/products_db.js', '/products_db.json', '/zfb-config.js']);
app.use((req, res, next) => {
  if (ALWAYS_FRESH.has(req.path)) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
});

// Cache policy for the storefront's static files.
//
// Everything was going out as 'public, max-age=0', so a returning visitor
// re-validated every stylesheet, script and image on every page view. On a VPS
// that is a round trip per asset for content that rarely changes.
//
// The split is by how the file is addressed, not by guesswork:
//   - HTML must stay fresh: it carries the injected admin data and the
//     published visual-editor overrides, both of which change without the file
//     changing name.
//   - Images, fonts and media under /assets and /uploads are effectively
//     immutable -- a new upload gets a new filename -- so they can be held for
//     a year.
//   - CSS and JS are referenced with a ?v= stamp that is bumped by hand, so
//     they get a week with revalidation rather than a year: long enough to
//     matter, short enough that a forgotten bump is not fatal.
//   - products_db.js, products_db.json and zfb-config.js are excluded above
//     and stay no-cache; they are rewritten on every admin save.
app.use((req, res, next) => {
  if (ALWAYS_FRESH.has(req.path)) return next();

  const p = req.path;
  if (/.(png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|eot|mp4|webm)$/i.test(p)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (/.(css|js)$/i.test(p)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  } else if (/.html$/i.test(p) || p === '/') {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

// Hand a WebP twin to browsers that accept one. No markup changes: see
// middleware/webp.js. Must run before express.static, or static would answer
// with the original first.
app.use(webpMiddleware);

app.use(express.static(path.join(__dirname, '..'), { extensions: ['html'] }));

app.use('/admin-assets', express.static(path.join(__dirname, 'public', 'admin')));

// Self-hosted TinyMCE. It used to come from cdn.tiny.cloud with the literal
// key "no-api-key", which makes the cloud build render every editor read-only
// -- so no description field in the admin panel could be typed into. Serving
// our own copy removes the key requirement, keeps the assets same-origin (so
// the CSP needs no third-party stylesheet exception), and lets the panel work
// with no internet connection.
app.use('/vendor/tinymce', express.static(path.join(__dirname, 'node_modules', 'tinymce'), {
  maxAge: '30d',
  immutable: true
}));
// Serve uploads from the one place that decides where uploads live.
//
// The comment that used to sit here claimed middleware/upload.js resolved this
// the same way. It did not: that file is one directory deeper, so the identical
// `path.resolve(__dirname, '..', UPLOAD_DIR)` gave it backend/uploads and gave
// this line <repo>/uploads. Uploads were written to one and served from the
// other, so every image an operator uploaded 404'd with no error anywhere.
// Both sides now import the same resolved value.
const { UPLOAD_DIR } = require('./config/paths');
app.use('/uploads', express.static(UPLOAD_DIR));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Reference data is seeded by bootstrapDatabase() below, which the startup
// sequence awaits before the first request can arrive. There is no second
// database to initialize: the SQLite branch that used to live here is gone
// along with the rest of the legacy adapter.

// Persistent session store, backed by the PostgreSQL session repository.
const SessionStore = require('./services/session-store');

// The session secret signs the cookie that carries every admin's and every
// customer's identity. The 'zfb-fallback-secret' default below is in the
// public source tree, so booting production without SESSION_SECRET set would
// let anyone who has read this file mint a valid session cookie for any
// account. Refuse to start rather than run in that state -- a server that
// will not boot is a loud, five-minute problem; a server running on a
// published secret is a silent one.
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('[FATAL] SESSION_SECRET is not set. Refusing to start in production with the public fallback secret.');
  process.exit(1);
}

// Session
app.use(session({
  store: new SessionStore({ ttl: 86400 }),
  secret: process.env.SESSION_SECRET || 'zfb-fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Blocks the session cookie from being sent on cross-site POST requests
    // (the classic auto-submitting hidden-form CSRF attack), which matters
    // most for the admin panel's multipart routes: csrf.js's token check
    // can't see req.body._csrf for multipart requests (multer hasn't parsed
    // the body yet when csrfProtection runs), so it deliberately lets any
    // authenticated admin's multipart POST through. SameSite=Lax is the
    // actual backstop for that gap without reordering every admin route's
    // middleware. Lax (not Strict) so a normal top-level link/navigation
    // into the admin panel still carries the session.
    sameSite: 'lax'
  }
}));

// Make session data available in EJS views
app.use((req, res, next) => {
  res.locals.admin = req.session.admin || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// =============================================
// API ROUTES (Public - No auth required)
// =============================================
app.use('/api/products', require('./routes/api/products'));
app.use('/api/categories', require('./routes/api/categories'));
app.use('/api/orders', require('./routes/api/orders'));
app.use('/api/appointments', require('./routes/api/appointments'));
app.use('/api/consultations', require('./routes/api/consultations'));
app.use('/api/designs', require('./routes/api/designs'));
app.use('/api/quotes', require('./routes/api/quotes'));
app.use('/api/contact', require('./routes/api/contact'));
app.use('/api/newsletter', require('./routes/api/newsletter'));
app.use('/api/branches', require('./routes/api/branches'));
app.use('/api/offers', require('./routes/api/offers'));
app.use('/api/banners', require('./routes/api/banners'));
app.use('/api/media', require('./routes/api/media'));
app.use('/api/cart', require('./routes/api/cart'));
app.use('/api/wishlist', require('./routes/api/wishlist'));
app.use('/api/settings', require('./routes/api/settings'));
app.use('/api/auth', require('./routes/api/auth'));
app.use('/api/notifications', require('./routes/api/notifications'));
app.use('/api/customer-reports', require('./routes/api/customer-reports'));
app.use('/api/ai', require('./routes/api/customer-ai'));
app.use('/api/admin/ai', require('./routes/api/admin-ai'));
app.use('/api/delivery', require('./routes/api/delivery'));
app.use('/api/addresses', require('./routes/api/addresses'));
app.use('/api/geocoding', require('./routes/api/geocoding'));
app.use('/api', require('./routes/api/legacy'));

// =============================================
// SEO: Dynamic Sitemap & Robots.txt
// =============================================
const { generateSitemapXml, generateRobotsTxt } = require('./utils/sitemap-generator');

app.get('/sitemap.xml', async (req, res) => {
  try {
    const result = await generateSitemapXml();
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(result.xml);
  } catch (err) {
    console.error('[Sitemap] Generation error:', err.message);
    res.status(500).send('Sitemap generation failed');
  }
});

app.get('/robots.txt', (req, res) => {
  try {
    const content = generateRobotsTxt();
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(content);
  } catch (err) {
    console.error('[Robots] Generation error:', err.message);
    res.status(500).send('Robots.txt generation failed');
  }
});

// =============================================
// HEALTH CHECK
// =============================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// =============================================
// ADMIN ROUTES (Auth required)
// =============================================
app.use('/admin', require('./routes/admin/index'));

// 404 Handler for HTML pages
app.use((req, res) => {
  sendNotFound(res);
});

// Error Handler Middleware
app.use(errorHandler);

// =============================================
// START SERVER
// =============================================
/**
 * Ordered, awaited database bootstrap.
 *
 * This used to be two unordered side effects: a synchronous initDatabase() at
 * module scope, and a fire-and-forget ensureDefaultAdmin() executed at require
 * time inside routes/admin/index.js. Neither was awaited, so on PostgreSQL the
 * admin bootstrap raced the reference-data seed it depends on (roles must
 * exist before admin_users.role_id can point at one) and failed silently on a
 * fresh database. Sequencing them here makes the dependency explicit and lets
 * a genuine failure surface instead of becoming an unhandled rejection.
 */
async function bootstrapDatabase() {
  const { seedPgReferenceData } = require('./config/pg-database');
  await seedPgReferenceData();

  const { ensureDefaultAdmin } = require('./middleware/auth');
  await ensureDefaultAdmin();

  // Register any storefront page the CMS does not know about yet. The registry
  // used to be a hardcoded array of 36 entries against 71 real pages, so nine
  // of them could not be opened in the visual editor at all. Scanning the
  // directory means a page added to the site is editable without a code change.
  try {
    const { getRepositories } = require('./repositories');
    const { syncPageRegistry } = require('./services/page-registry-service');
    const result = await syncPageRegistry(getRepositories());
    if (result.added.length) {
      console.log(`[CMS] Registered ${result.added.length} new page(s): ${result.added.join(', ')}`);
    }
    if (result.promoted) {
      console.log(`[CMS] Opened ${result.promoted} previously locked page(s) to the visual editor.`);
    }
    if (result.orphaned.length) {
      console.log(`[CMS] ${result.orphaned.length} registered page(s) have no HTML file: ${result.orphaned.join(', ')} -- left in place, they may own drafts.`);
    }
  } catch (err) {
    // A registry hiccup must not stop the server from serving the store.
    console.error('[CMS] Page registry sync failed:', err.message);
  }
}

if (require.main === module) {
  const server = app.listen(PORT, '0.0.0.0', async () => {
    try {
      await bootstrapDatabase();
    } catch (err) {
      console.error('[Startup] Database bootstrap failed:', err.message);
    }

    console.log(`\n========================================`);
    console.log(`  Zeyad For Business Backend`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Bound to: 0.0.0.0 (Network Accessible)`);
    console.log(`  Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Admin: http://localhost:${PORT}/admin`);
    console.log(`  API:   http://localhost:${PORT}/api/health`);
    console.log(`========================================\n`);

    // Startup SEO Validation: Generate sitemap and validate no legacy domain
    try {
      const result = await generateSitemapXml();
      generateRobotsTxt();
      const FORBIDDEN = ['zeyad', 'for', 'business.com'].join('-');
      if (result.xml.includes(FORBIDDEN)) {
        console.error(`\n[SEO ERROR] sitemap.xml contains forbidden legacy domain: ${FORBIDDEN}`);
        console.error(`[SEO ERROR] Sitemap is NOT valid for Google Search Console!\n`);
      } else {
        console.log(`[SEO OK] sitemap.xml generated: ${result.totalUrls} URLs (${result.productCount} products)`);
        console.log(`[SEO OK] All URLs use: ${result.siteUrl}`);
      }
    } catch (seoErr) {
      console.error('[SEO ERROR] Startup sitemap validation failed:', seoErr.message);
    }
  });

  // -------------------------------------------------------------------------
  // Graceful shutdown.
  //
  // There was none. On any deploy, restart or container stop the process was
  // killed outright: in-flight requests were cut mid-response, and the
  // PostgreSQL pool was never drained, so the server left connections behind
  // for the database to time out on its own. That is survivable on a hobby
  // box and not on a production storefront taking orders.
  //
  // Stop accepting new connections, let the ones in flight finish, then close
  // the pool. A hard ceiling guarantees the process still exits if something
  // refuses to settle, rather than hanging a deploy indefinitely.
  // -------------------------------------------------------------------------
  const SHUTDOWN_TIMEOUT_MS = 10000;
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[Shutdown] ${signal} received -- closing gracefully...`);

    const forceExit = setTimeout(() => {
      console.error('[Shutdown] Timed out waiting for connections; forcing exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async () => {
      console.log('[Shutdown] HTTP server closed; no longer accepting connections.');
      try {
        const { closePgPool } = require('./config/pg-database');
        await closePgPool();
        console.log('[Shutdown] PostgreSQL pool drained.');
      } catch (err) {
        console.error('[Shutdown] Error draining the PostgreSQL pool:', err.message);
      }
      clearTimeout(forceExit);
      console.log('[Shutdown] Done.');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;

