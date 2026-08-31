/**
 * Zeyad For Business — PostgreSQL Repository Factory (Phase 8A)
 * 
 * Central factory for all PostgreSQL repository instances.
 */

const { getPgPool } = require('../../config/pg-database');
const { PostgresTransactionManager } = require('./postgres-transaction-manager');

// PostgreSQL Repository Adapters
const PostgresSettingsRepo = require('./settings-repo');
const PostgresCategoryRepo = require('./category-repo');
const PostgresDepartmentRepo = require('./department-repo');
const PostgresProductRepo = require('./product-repo');
const PostgresCustomerRepo = require('./customer-repo');
const PostgresOrderRepo = require('./order-repo');
const PostgresCartRepo = require('./cart-repo');
const PostgresCouponRepo = require('./coupon-repo');
const PostgresNotificationRepo = require('./notification-repo');
const PostgresCustomerRequestRepo = require('./customer-request-repo');
const PostgresCustomerReportRepo = require('./customer-report-repo');
const PostgresCmsRepo = require('./cms-repo');
const PostgresDeliveryRepo = require('./delivery-repo');
const PostgresAddressRepo = require('./address-repo');
const PostgresMediaRepo = require('./media-repo');
const PostgresAuthRepo = require('./auth-repo');
const PostgresAdminRepo = require('./admin-repo');
const PostgresAiRepo = require('./ai-repo');
const PostgresBranchRepo = require('./branch-repo');
const PostgresNewsletterRepo = require('./newsletter-repo');
const PostgresBannerRepo = require('./banner-repo');
const PostgresOfferRepo = require('./offer-repo');
const PostgresWishlistRepo = require('./wishlist-repo');
const PostgresSessionRepo = require('./session-repo');

let pgInstance = null;

/**
 * Build a fresh repository bundle bound to a specific pool or client.
 * Used both for the cached pool-bound singleton and for building a
 * transaction-scoped bundle bound to a checked-out client, so that writes
 * made through repos.* inside a transaction actually run on the same
 * connection as the transaction's BEGIN/COMMIT/ROLLBACK instead of
 * silently autocommitting on the pool.
 * @param {import('pg').Pool|import('pg').PoolClient} poolOrClient
 */
function buildRepoBundle(poolOrClient) {
  const tx = new PostgresTransactionManager(poolOrClient);

  const bundle = {
    settings: new PostgresSettingsRepo(poolOrClient),
    branches: new PostgresBranchRepo(poolOrClient),
    newsletter: new PostgresNewsletterRepo(poolOrClient),
    categories: new PostgresCategoryRepo(poolOrClient),
    departments: new PostgresDepartmentRepo(poolOrClient),
    products: new PostgresProductRepo(poolOrClient),
    customers: new PostgresCustomerRepo(poolOrClient),
    orders: new PostgresOrderRepo(poolOrClient),
    carts: new PostgresCartRepo(poolOrClient),
    coupons: new PostgresCouponRepo(poolOrClient),
    notifications: new PostgresNotificationRepo(poolOrClient),
    customerRequests: new PostgresCustomerRequestRepo(poolOrClient),
    customerReports: new PostgresCustomerReportRepo(poolOrClient),
    cms: new PostgresCmsRepo(poolOrClient),
    delivery: new PostgresDeliveryRepo(poolOrClient),
    addresses: new PostgresAddressRepo(poolOrClient),
    media: new PostgresMediaRepo(poolOrClient),
    auth: new PostgresAuthRepo(poolOrClient),
    admin: new PostgresAdminRepo(poolOrClient),
    ai: new PostgresAiRepo(poolOrClient),
    banners: new PostgresBannerRepo(poolOrClient),
    offers: new PostgresOfferRepo(poolOrClient),
    wishlists: new PostgresWishlistRepo(poolOrClient),
    sessions: new PostgresSessionRepo(poolOrClient),
    tx,
    transactionManager: tx
  };

  // Convenient non-enumerable aliases
  const aliases = {
    cart: bundle.carts,
    wishlist: bundle.wishlists,
    session: bundle.sessions,
    banner: bundle.banners,
    offer: bundle.offers,
    coupon: bundle.coupons,
    order: bundle.orders,
    product: bundle.products,
    customer: bundle.customers,
    category: bundle.categories,
    department: bundle.departments,
    setting: bundle.settings,
    branch: bundle.branches
  };

  for (const [alias, repo] of Object.entries(aliases)) {
    Object.defineProperty(bundle, alias, {
      value: repo,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }

  return bundle;
}

/**
 * Get the cached pool-bound repository singleton, or -- when a client is
 * passed (typically from PostgresTransactionManager.run()'s callback) --
 * build a fresh, uncached bundle bound to that client so writes route
 * through the active transaction.
 * @param {import('pg').PoolClient} [transactionClient]
 */
function getPgRepositories(transactionClient) {
  if (transactionClient) {
    return buildRepoBundle(transactionClient);
  }

  const pool = getPgPool();
  if (pgInstance && !pool.ended) {
    return pgInstance;
  }

  pgInstance = buildRepoBundle(pool);
  return pgInstance;
}

function resetPgRepositories() {
  pgInstance = null;
}

module.exports = { getPgRepositories, resetPgRepositories };
