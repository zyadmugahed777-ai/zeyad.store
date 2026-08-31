/**
 * PostgreSQL Customer Repository
 * Encapsulates all database queries for the customers table and customer order
 * relations. Methods are async (pg). No business logic.
 *
 * The header said "SQLite ... Methods are synchronous (better-sqlite3)" -- a
 * copy from the adapter this file was ported from, describing the opposite of
 * what it does.
 */
const PostgresBaseRepository = require('./postgres-base-repository');
const { phoneVariants } = require('../../utils/helpers');

/**
 * Columns that may be handed to a customer over the API.
 *
 * password_hash is absent on purpose: a query that never reads the hash cannot
 * leak it through a log line, an error object, or a response body somebody
 * forgot to sanitize. Used by findPublicById(), the read behind every
 * customer-facing response.
 */
const PUBLIC_COLUMNS = [
  'id', 'first_name', 'last_name', 'phone', 'email', 'city', 'district',
  'address_detail', 'total_orders', 'total_spent', 'created_at', 'updated_at',
  'last_login_at'
].join(', ');

/**
 * Drop the password hash from a row on its way out of the repository.
 *
 * The general-purpose reads below use `SELECT *`, and narrowing them to an
 * explicit column list would silently omit any column added to the table
 * later. Stripping the one secret key instead keeps them faithful while making
 * sure the hash is not sitting inside objects handed to EJS views, logged on
 * error, or spread into a response by some future handler. findAuthByPhone()
 * is the deliberate exception -- it is where a password is verified.
 */
function withoutSecret(row) {
  if (!row) return row;
  if ('password_hash' in row) delete row.password_hash;
  return row;
}

class PostgresCustomerRepo extends PostgresBaseRepository {
  /**
   * Find customer by ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findById(id) {
    return withoutSecret(await this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id)) || null;
  }

  /**
   * Find customer by phone number, in any spelling it may be stored under.
   *
   * An exact match on the canonical form alone is not enough: rows written
   * before normalizePhone() was hardened carry '+967...', '00967...' or a
   * leading trunk zero, and the same human typing the same number has to land
   * on the same row regardless. Matching the whole variant set is what makes
   * "one phone number, one account" true against the data that already exists.
   *
   * Ordered so the canonical spelling wins when a number was, historically,
   * stored twice -- deterministically, not by insertion order.
   *
   * @param {string} phone
   * @returns {Object|null}
   */
  async findByPhone(phone) {
    if (!phone) return null;
    const variants = phoneVariants(phone);
    if (variants.length === 0) return null;

    // Native $n placeholders rather than the statement adapter's `?`: that
    // adapter flattens array arguments into separate parameters, which would
    // turn one text[] into five scalars and break `= ANY(...)`.
    return withoutSecret(await this.queryOne(
      `SELECT * FROM customers
        WHERE phone = ANY($1::text[])
        ORDER BY (phone = $2) DESC, id ASC
        LIMIT 1`,
      [variants, variants[0]]
    ));
  }

  /**
   * Find every row a phone number may resolve to.
   *
   * Registration uses this to refuse a number that is already claimed even
   * when the claim sits under an older spelling, and to report the duplicate
   * rows that predate normalization without touching them.
   *
   * @param {string} phone
   * @returns {Array<Object>}
   */
  async findAllByPhone(phone) {
    if (!phone) return [];
    const variants = phoneVariants(phone);
    if (variants.length === 0) return [];

    return (await this.query(
      `SELECT * FROM customers
        WHERE phone = ANY($1::text[])
        ORDER BY (phone = $2) DESC, id ASC`,
      [variants, variants[0]]
    )).map(withoutSecret);
  }

  /**
   * Find a customer for authentication -- the one query that is allowed to
   * read password_hash.
   *
   * Kept separate from findByPhone so the hash is loaded only where a password
   * is about to be verified, and returns the smallest row that makes that
   * possible.
   *
   * @param {string} phone
   * @returns {{id: number, phone: string, password_hash: string|null}|null}
   */
  async findAuthByPhone(phone) {
    if (!phone) return null;
    const variants = phoneVariants(phone);
    if (variants.length === 0) return null;

    // A number stored twice under different spellings resolves to whichever
    // row actually has a password: that is the account the customer registered,
    // and the other row is a pre-normalization contact record.
    return await this.queryOne(
      `SELECT id, phone, password_hash FROM customers
        WHERE phone = ANY($1::text[])
        ORDER BY (password_hash IS NOT NULL) DESC, (phone = $2) DESC, id ASC
        LIMIT 1`,
      [variants, variants[0]]
    );
  }

  /**
   * Attach a password hash to a customer.
   *
   * Deliberately not reachable through update(): password_hash is absent from
   * that method's allow-list, so no route that forwards a request body can
   * ever set or clear a password by accident.
   *
   * @param {number|string} id
   * @param {string} passwordHash a bcrypt hash -- never a plaintext password
   * @returns {boolean}
   */
  async setPasswordHash(id, passwordHash) {
    if (!id || !passwordHash) return false;
    const result = await this.db.prepare(`
      UPDATE customers
         SET password_hash = ?, password_updated_at = NOW(), updated_at = NOW()
       WHERE id = ?
    `).run(passwordHash, id);
    return result.changes > 0;
  }

  /**
   * Claim a passwordless checkout contact record as a real account.
   *
   * The `password_hash IS NULL` predicate is the whole point, and it belongs
   * in the statement rather than in a check the caller makes first. Two people
   * registering the same number at the same moment both see a NULL hash, and
   * both would go on to write one -- the second silently overwriting the
   * first, who is then locked out of an account they believe they created.
   * Here the database decides: exactly one UPDATE matches a row, the other
   * reports zero changes, and the caller turns that into "this number is
   * already registered".
   *
   * @param {number|string} id
   * @param {string} passwordHash
   * @returns {boolean} true only for the caller that won the claim
   */
  async claimPasswordlessAccount(id, passwordHash) {
    if (!id || !passwordHash) return false;
    const result = await this.db.prepare(`
      UPDATE customers
         SET password_hash = ?, password_updated_at = NOW(), updated_at = NOW()
       WHERE id = ? AND password_hash IS NULL
    `).run(passwordHash, id);
    return result.changes > 0;
  }

  /**
   * Record a successful login. Never throws into the login path -- a failed
   * bookkeeping write must not cost a customer their session.
   * @param {number|string} id
   */
  async touchLastLogin(id) {
    if (!id) return false;
    const result = await this.db.prepare(
      'UPDATE customers SET last_login_at = NOW() WHERE id = ?'
    ).run(id);
    return result.changes > 0;
  }

  /**
   * Create a customer that owns a password from the moment it exists.
   *
   * Registration cannot be "INSERT then UPDATE the hash in": between those two
   * statements the row is an account with no password, and a concurrent login
   * would find it. One INSERT closes that window.
   *
   * The unique index on phone is what actually decides who wins a race between
   * two simultaneous registrations of the same number -- the loser gets a
   * 23505 the caller is expected to translate, not a second account.
   *
   * @param {Object} data
   * @returns {number} inserted customer id
   */
  async createWithPassword(data) {
    const result = await this.db.prepare(`
      INSERT INTO customers (
        first_name, last_name, phone, email, city, district, address_detail,
        password_hash, password_updated_at, total_orders, total_spent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, 0, NOW(), NOW())
    `).run(
      data.first_name || '',
      data.last_name || '',
      data.phone,
      data.email || '',
      data.city || '',
      data.district || '',
      data.address_detail || '',
      data.password_hash
    );

    return result.lastInsertRowid;
  }

  /**
   * Read a customer by id without ever loading the password hash.
   * Used by every path that is about to send the row to a browser.
   * @param {number|string} id
   * @returns {Object|null}
   */
  async findPublicById(id) {
    if (!id) return null;
    return await this.db.prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM customers WHERE id = ?`
    ).get(id) || null;
  }

  /**
   * Find customer by email
   * @param {string} email
   * @returns {Object|null}
   */
  async findByEmail(email) {
    if (!email) return null;
    return withoutSecret(await this.db.prepare('SELECT * FROM customers WHERE email = ?').get(email)) || null;
  }

  /**
   * Find all customers matching optional filters and pagination
   * @param {Object} filters
   * @param {number} limit
   * @param {number} offset
   * @returns {Array<Object>}
   */
  async findAll(filters = {}, limit = 20, offset = 0) {
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (first_name ILIKE ? OR last_name ILIKE ? OR phone ILIKE ? OR email ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return (await this.db.prepare(sql).all(...params)).map(withoutSecret);
  }

  /**
   * Count customers matching optional filters
   * @param {Object} filters
   * @returns {number}
   */
  async count(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM customers WHERE 1=1';
    const params = [];

    if (filters.search) {
      sql += ' AND (first_name ILIKE ? OR last_name ILIKE ? OR phone ILIKE ? OR email ILIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    return (await this.db.prepare(sql).get(...params))?.count || 0;
  }

  /**
   * Create a new customer record
   * @param {Object} data
   * @returns {number} Inserted customer ID
   */
  async create(data) {
    const stmt = this.db.prepare(`
      INSERT INTO customers (
        first_name, last_name, phone, email, city, district, address_detail, notes,
        total_orders, total_spent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `);

    const result = await stmt.run(
      data.first_name || '',
      data.last_name || '',
      data.phone,
      data.email || '',
      data.city || '',
      data.district || '',
      data.address_detail || '',
      data.notes || null,
      data.total_orders || 0,
      data.total_spent || 0
    );

    return result.lastInsertRowid;
  }

  /**
   * Update customer by ID
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async update(id, data) {
    const fields = [];
    const params = [];

    const allowed = [
      'first_name', 'last_name', 'phone', 'email', 'city', 'district',
      'address_detail', 'notes', 'total_orders', 'total_spent'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return false;

    fields.push("updated_at = NOW()");
    params.push(id);

    const sql = `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`;
    const result = await this.db.prepare(sql).run(...params);
    return result.changes > 0;
  }

  /**
   * Update customer by phone
   * @param {string} phone
   * @param {Object} data
   * @returns {boolean}
   */
  async updateByPhone(phone, data) {
    const fields = [];
    const params = [];

    const allowed = [
      'first_name', 'last_name', 'email', 'city', 'district',
      'address_detail', 'notes', 'total_orders', 'total_spent'
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }

    if (fields.length === 0) return false;

    fields.push("updated_at = NOW()");
    params.push(phone);

    const sql = `UPDATE customers SET ${fields.join(', ')} WHERE phone = ?`;
    const result = await this.db.prepare(sql).run(...params);
    return result.changes > 0;
  }

  /**
   * Find orders belonging to a customer
   * @param {number|string} customerId
   * @returns {Array<Object>}
   */
  async findCustomerOrders(customerId) {
    return await this.db.prepare(`
      SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC
    `).all(customerId);
  }

  /**
   * Update order statistics for a customer
   * @param {number|string} id
   * @param {number} totalOrders
   * @param {number} totalSpent
   * @returns {boolean}
   */
  async updateOrderStats(id, totalOrders, totalSpent) {
    const result = await this.db.prepare(`
      UPDATE customers 
      SET total_orders = ?, total_spent = ?, updated_at = NOW()
      WHERE id = ?
    `).run(totalOrders, totalSpent, id);
    return result.changes > 0;
  }

  /**
   * Increment order count and lifetime spent for a customer
   * @param {number|string} id
   * @param {number} amountSpent
   * @returns {boolean}
   */
  async incrementOrderStats(id, amountSpent = 0) {
    const result = await this.db.prepare(`
      UPDATE customers 
      SET total_orders = total_orders + 1,
          total_spent = total_spent + ?,
          updated_at = NOW()
      WHERE id = ?
    `).run(amountSpent, id);
    return result.changes > 0;
  }
}

module.exports = PostgresCustomerRepo;
