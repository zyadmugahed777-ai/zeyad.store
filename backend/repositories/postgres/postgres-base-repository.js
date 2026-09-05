/**
 * Zeyad For Business — PostgreSQL Base Repository (Phase 8A)
 * 
 * Provides base query helpers and a high-fidelity SQL statement adapter
 * that translates parameterized queries (? -> $n) and executes them on
 * the PostgreSQL connection pool asynchronously.
 */

function translateSqliteToPg(sql) {
  let pgSql = sql;

  // 1. Replace date functions
  pgSql = pgSql.replace(/datetime\('now'\)/gi, 'NOW()');
  pgSql = pgSql.replace(/datetime\('now',\s*'\+([0-9]+)\s*days?'\)/gi, "NOW() + INTERVAL '$1 days'");
  pgSql = pgSql.replace(/datetime\('now',\s*'\+([0-9]+)\s*hours?'\)/gi, "NOW() + INTERVAL '$1 hours'");
  pgSql = pgSql.replace(/datetime\('now',\s*'\+([0-9]+)\s*seconds?'\)/gi, "NOW() + INTERVAL '$1 seconds'");
  pgSql = pgSql.replace(/datetime\('now',\s*\?\)/gi, "NOW() + (?)::INTERVAL");
  pgSql = pgSql.replace(/\bexpired\s*([><]=?)\s*NOW\(\)/gi, 'expired::TIMESTAMPTZ $1 NOW()');

  // 2. Translate boolean column comparisons (every BOOLEAN column in
  //    postgres-schema.sql). A column missing from this list is a live bug:
  //    the query keeps `= 1`, PostgreSQL refuses to compare boolean to
  //    integer, and the whole statement fails at runtime.
  const BOOLEAN_COLUMNS = [
    'is_active', 'is_archived', 'is_default', 'is_primary', 'is_visible',
    'is_confirmed', 'is_enabled', 'is_read', 'free_shipping', 'is_new',
    'is_best_seller', 'requires_installation', 'editable',
    'show_in_department', 'show_on_home', 'show_in_search', 'show_in_najm',
    'show_in_offers'
  ];
  for (const col of BOOLEAN_COLUMNS) {
    const boundary = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pgSql = pgSql.replace(new RegExp(`\\b${boundary}\\s*=\\s*1\\b`, 'gi'), `${col} = TRUE`);
    pgSql = pgSql.replace(new RegExp(`\\b${boundary}\\s*=\\s*0\\b`, 'gi'), `${col} = FALSE`);
  }

  // Handle INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
  let isInsertOrIgnore = false;
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(pgSql)) {
    isInsertOrIgnore = true;
    pgSql = pgSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  }

  // 3. Extract named parameters (@param, :param) or translate ? placeholders to $1, $2, $3...
  let paramIndex = 1;
  let inSingleQuote = false;
  let result = '';
  const namedParams = [];

  for (let i = 0; i < pgSql.length; i++) {
    const char = pgSql[i];
    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      result += char;
    } else if (!inSingleQuote && char === '?') {
      result += `$${paramIndex++}`;
    } else if (!inSingleQuote && (char === '@' || (char === ':' && pgSql[i - 1] !== ':' && pgSql[i + 1] !== ':')) && /[a-zA-Z_]/.test(pgSql[i + 1] || '')) {
      let name = '';
      let j = i + 1;
      while (j < pgSql.length && /[a-zA-Z0-9_]/.test(pgSql[j])) {
        name += pgSql[j];
        j++;
      }
      namedParams.push(name);
      result += `$${paramIndex++}`;
      i = j - 1;
    } else {
      result += char;
    }
  }

  if (isInsertOrIgnore && !/ON\s+CONFLICT/i.test(result)) {
    result += ' ON CONFLICT DO NOTHING';
  }

  // 4. If INSERT without RETURNING, append RETURNING id for lastInsertRowid compatibility
  if (/^\s*INSERT\s+INTO/i.test(result) && !/RETURNING/i.test(result) && !isInsertOrIgnore && !/guest_sessions|role_permissions|sessions/i.test(result) && !/ON\s+CONFLICT/i.test(result)) {
    result += ' RETURNING id';
  }

  return { pgSql: result, namedParams: namedParams.length > 0 ? namedParams : null };
}

class PostgresStatement {
  constructor(pool, sql) {
    this._pool = pool;
    this.sql = sql;
    const translation = translateSqliteToPg(sql);
    this.pgSql = translation.pgSql;
    this.namedParams = translation.namedParams;
  }

  get pool() {
    if (this._pool && !this._pool.ended) {
      return this._pool;
    }
    const { getPgPool } = require('../../config/pg-database');
    this._pool = getPgPool();
    return this._pool;
  }

  _prepareArgs(args) {
    if (this.namedParams && args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0]) && !(args[0] instanceof Date) && !Buffer.isBuffer(args[0])) {
      const obj = args[0];
      return this.namedParams.map(name => {
        const val = obj[name];
        return val !== undefined ? val : null;
      });
    }

    // Flatten arguments if passed as array
    let flattened = [];
    for (const arg of args) {
      if (Array.isArray(arg)) {
        flattened = flattened.concat(arg);
      } else {
        flattened.push(arg);
      }
    }
    return flattened;
  }

  async all(...args) {
    const params = this._prepareArgs(args);
    const res = await this.pool.query(this.pgSql, params);
    return res.rows;
  }

  async get(...args) {
    const params = this._prepareArgs(args);
    const res = await this.pool.query(this.pgSql, params);
    return res.rows[0];
  }

  async run(...args) {
    const params = this._prepareArgs(args);
    const res = await this.pool.query(this.pgSql, params);
    return {
      changes: res.rowCount,
      lastInsertRowid: res.rows && res.rows[0] ? res.rows[0].id : null
    };
  }
}

class PostgresBaseRepository {
  /**
   * @param {import('pg').Pool | import('pg').PoolClient} pool - PostgreSQL pool or client
   */
  constructor(pool) {
    if (!pool) {
      throw new Error('PostgresBaseRepository requires a pg Pool or Client instance');
    }
    this._pool = pool;
    this.db = {
      prepare: (sql) => new PostgresStatement(this.pool, sql),
      transaction: (fn) => async (...args) => {
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');
          const txRepo = new this.constructor(client);
          const result = await fn.apply(txRepo, args);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
    };
  }

  get pool() {
    if (this._pool && !this._pool.ended) {
      return this._pool;
    }
    const { getPgPool } = require('../../config/pg-database');
    this._pool = getPgPool();
    return this._pool;
  }

  async query(text, params = []) {
    const res = await this.pool.query(text, params);
    return res.rows;
  }

  async queryOne(text, params = []) {
    const res = await this.pool.query(text, params);
    return res.rows[0] || null;
  }

  async execute(text, params = []) {
    return this.pool.query(text, params);
  }
}

module.exports = PostgresBaseRepository;
