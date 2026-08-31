/**
 * The single shape a customer takes when it leaves the server.
 *
 * Customer rows are read with `SELECT *` in several places that predate this
 * file, so the row an API handler is holding may well contain password_hash.
 * Every customer-facing response builds its body through toPublicCustomer()
 * rather than spreading the row, which makes the leak impossible by
 * construction instead of by remembering: adding a sensitive column to the
 * table later cannot widen an existing response, because nothing here copies
 * unknown keys.
 */

const SENSITIVE_KEYS = ['password', 'password_hash', 'passwordHash', 'confirmPassword', 'password_confirmation'];

/**
 * Project a customer row onto the fields the browser is allowed to see.
 *
 * @param {Object|null} row a customers row, possibly including password_hash
 * @returns {Object|null} a new object -- never the row itself
 */
function toPublicCustomer(row) {
  if (!row) return null;

  const first = row.first_name || '';
  const last = row.last_name || '';

  return {
    id: row.id,
    name: `${first} ${last}`.trim(),
    firstName: first,
    lastName: last,
    phone: row.phone || '',
    email: row.email || '',
    city: row.city || '',
    district: row.district || '',
    addressDetail: row.address_detail || '',
    totalOrders: Number(row.total_orders) || 0,
    totalSpent: Number(row.total_spent) || 0
  };
}

/**
 * What goes into req.session.customer.
 *
 * The session is persisted to the sessions table as JSON and is readable by
 * anyone who can read that table, so it holds identity and display data only
 * -- never the password hash, and never anything a route should be reading
 * from the database instead.
 *
 * @param {Object} row
 * @returns {Object}
 */
function toSessionCustomer(row) {
  const pub = toPublicCustomer(row);
  if (!pub) return null;
  return {
    id: pub.id,
    name: pub.name,
    firstName: pub.firstName,
    lastName: pub.lastName,
    phone: pub.phone,
    email: pub.email,
    city: pub.city,
    district: pub.district,
    addressDetail: pub.addressDetail
  };
}

/**
 * Strip credential-shaped keys out of an object before it is logged.
 *
 * Request bodies reach console.error() in a few handlers. A registration body
 * carries a plaintext password, and a log file is exactly the place it must
 * never end up.
 *
 * @param {Object} obj
 * @returns {Object} a shallow copy with credential keys redacted
 */
function redactCredentials(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = { ...obj };
  for (const key of SENSITIVE_KEYS) {
    if (key in copy) copy[key] = '[REDACTED]';
  }
  return copy;
}

module.exports = { toPublicCustomer, toSessionCustomer, redactCredentials, SENSITIVE_KEYS };
