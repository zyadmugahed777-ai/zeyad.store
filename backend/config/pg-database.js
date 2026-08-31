/**
 * Zeyad For Business — PostgreSQL Connection & Pool Manager
 * 
 * Manages PostgreSQL connection pool for Shadow & Target database.
 * Completely isolated from SQLite connection pool.
 */

const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');

// PostgreSQL NUMERIC/DECIMAL (OID 1700) comes back as a string by default so
// arbitrary-precision values aren't silently truncated. The schema's NUMERIC
// columns (order totals, prices, coupon amounts, exchange rates) are all
// well within JS's safe integer/float range, so parse them to numbers here
// once, globally, instead of patching every call site that does `=== 1` or
// string concatenation with `+` against these values.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

// BIGINT/int8 (OID 20) -- notably every COUNT(*) result -- has the exact
// same string-by-default problem, for the exact same reason (avoiding
// silent precision loss above Number.MAX_SAFE_INTEGER). Found live: with
// only the NUMERIC parser registered, ensureDefaultAdmin()'s
// `if (count === 0)` compared the number 0 against the string "0" and
// never matched, so a fresh database could never bootstrap its first
// admin account. This store's row counts are nowhere near the safe-integer
// ceiling, so parsing to a JS number is safe.
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

let pool = null;

/**
 * Connection settings the application must never guess in production.
 *
 * Every field below has a built-in default, which is convenient locally and
 * dangerous in production: a deployment that sets nothing still connects --
 * to zeyad_shadow on 127.0.0.1:5433 with an empty password -- and looks
 * perfectly healthy while doing it. Under NODE_ENV=production that silence is
 * refused: the process fails to start rather than attaching to whatever the
 * defaults happen to point at.
 *
 * Deliberately not enforced outside production, so local development and the
 * test suites keep working with no configuration.
 */
const REQUIRED_IN_PRODUCTION = ['PG_HOST', 'PG_PORT', 'PG_DATABASE', 'PG_USER', 'PG_PASSWORD'];

/**
 * The shadow overrides, which win over the real ones in getPgConfig() below.
 *
 * That precedence is right for development -- it is how a developer points the
 * app at the local shadow cluster without editing the canonical settings -- and
 * it is a trap in production. Setting every PG_* variable correctly satisfies
 * the check above and the deployment still connects to whatever PG_SHADOW_*
 * says, because PG_SHADOW_* is read first. A single stale line left in a .env
 * copied from a developer's machine is enough: the server boots, reports
 * healthy, and serves and writes the wrong database, with the real one
 * untouched and quietly going stale.
 *
 * There is no legitimate reason for a shadow override to exist in production,
 * so their mere presence is treated as a misconfiguration and refused.
 */
const SHADOW_OVERRIDES = [
  'PG_SHADOW_HOST', 'PG_SHADOW_PORT', 'PG_SHADOW_DATABASE',
  'PG_SHADOW_USER', 'PG_SHADOW_PASSWORD'
];

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_IN_PRODUCTION.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      'Refusing to start: NODE_ENV=production but ' + missing.join(', ') +
      ' ' + (missing.length === 1 ? 'is' : 'are') + ' not set. PostgreSQL connection ' +
      'settings must be explicit in production -- falling back to the built-in ' +
      'defaults would silently connect this deployment to a database nobody chose.'
    );
  }

  const shadowed = SHADOW_OVERRIDES.filter((k) => process.env[k]);
  if (shadowed.length) {
    throw new Error(
      'Refusing to start: NODE_ENV=production but ' + shadowed.join(', ') +
      ' ' + (shadowed.length === 1 ? 'is' : 'are') + ' set. These development ' +
      'overrides take precedence over the PG_* settings, so this deployment ' +
      'would connect to the shadow database instead of production while looking ' +
      'perfectly healthy. Remove them from the production environment.'
    );
  }
}

function getPgConfig() {
  assertProductionConfig();
  return {
    host: process.env.PG_SHADOW_HOST || process.env.PG_HOST || '127.0.0.1',
    port: parseInt(process.env.PG_SHADOW_PORT || process.env.PG_PORT || '5433', 10),
    user: process.env.PG_SHADOW_USER || process.env.PG_USER || 'zfb_shadow_user',
    password: process.env.PG_SHADOW_PASSWORD || process.env.PG_PASSWORD || '',
    database: process.env.PG_SHADOW_DATABASE || process.env.PG_DATABASE || 'zeyad_shadow',
    max: parseInt(process.env.PG_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

/**
 * State the connection target out loud, once, on first pool creation.
 *
 * Every field in getPgConfig() has a built-in default, so a deployment that
 * sets none of the PG_* variables still connects successfully -- to
 * zeyad_shadow, on 127.0.0.1:5433, with an empty password -- and looks
 * completely healthy while doing it. That is not hypothetical: server.js loads
 * backend/.env, which carries no PG_* keys at all, so the live connection is
 * entirely built from these defaults today.
 *
 * PG_SHADOW_* also takes precedence over PG_*, so a stray shadow variable left
 * in an operator's environment silently wins over the real configuration.
 *
 * None of that is changed here -- changing connection resolution is an
 * operator decision. What changes is that it is no longer silent.
 */
let announcedTarget = false;
function announceConnectionTarget(config) {
  if (announcedTarget) return;
  announcedTarget = true;

  const usingShadowOverride = Boolean(
    process.env.PG_SHADOW_HOST || process.env.PG_SHADOW_PORT ||
    process.env.PG_SHADOW_USER || process.env.PG_SHADOW_DATABASE ||
    process.env.PG_SHADOW_PASSWORD
  );
  const explicit = Boolean(process.env.PG_HOST || process.env.PG_DATABASE || process.env.PG_USER);

  console.log('[PostgreSQL] Connecting to ' + config.database + ' on ' +
    config.host + ':' + config.port + ' as ' + config.user);

  if (!explicit && !usingShadowOverride) {
    console.warn('[PostgreSQL] No PG_HOST/PG_DATABASE/PG_USER were set -- this connection is ' +
      'built entirely from built-in defaults. Set them explicitly for any deployment you ' +
      'intend to treat as production.');
  }
  if (usingShadowOverride) {
    console.warn('[PostgreSQL] PG_SHADOW_* variables are set and take precedence over PG_*. ' +
      'Confirm this is intended -- it silently redirects the application away from PG_*.');
  }
  if (!config.password) {
    console.warn('[PostgreSQL] Connecting with an empty password.');
  }
}

function getPgPool() {
  if (!pool || pool.ended) {
    const config = getPgConfig();
    announceConnectionTarget(config);
    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]: Unexpected client error', err);
    });
  }
  return pool;
}

/**
 * Execute a parameterized query
 * @param {string} text 
 * @param {Array} params 
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const p = getPgPool();
  return p.query(text, params);
}

/**
 * Acquire a client for transaction management
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  const p = getPgPool();
  return p.connect();
}

/**
 * Initialize PostgreSQL Schema from postgres-schema.sql
 */
async function initPgDatabase() {
  const schemaPath = path.join(__dirname, '..', 'db', 'postgres-schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`PostgreSQL schema file not found at: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await getClient();
  try {
    await client.query(sql);
    console.log('[PostgreSQL] Canonical schema initialized successfully.');
  } finally {
    client.release();
  }

  await seedPgReferenceData();
}

/**
 * Load db/postgres-seed.sql — the reference rows a fresh database cannot
 * function without (currently the RBAC role catalogue).
 *
 * postgres-schema.sql is pure DDL and contains no INSERT at all, and
 * db/seed.sql is only ever read by the SQLite path in config/database.js.
 * That left `roles` empty on PostgreSQL, so ensureDefaultAdmin()'s hardcoded
 * role_id = 1 violated the admin_users -> roles foreign key and a fresh
 * deployment could never create its first admin.
 *
 * The seed is idempotent (ON CONFLICT DO NOTHING), so running it on every
 * boot is safe and keeps an existing database converging on the expected
 * reference data rather than silently drifting.
 */
async function seedPgReferenceData() {
  const seedPath = path.join(__dirname, '..', 'db', 'postgres-seed.sql');
  if (!fs.existsSync(seedPath)) {
    console.warn('[PostgreSQL] Reference seed file missing, skipping: ' + seedPath);
    return;
  }

  const sql = fs.readFileSync(seedPath, 'utf8');
  const client = await getClient();
  try {
    await client.query(sql);
    console.log('[PostgreSQL] Reference data (roles, permissions) seeded.');
  } finally {
    client.release();
  }
}

/**
 * Drain and close the connection pool
 */
async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPgPool,
  getPgConfig,
  query,
  getClient,
  initPgDatabase,
  seedPgReferenceData,
  closePgPool
};
