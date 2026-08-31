/**
 * Zeyad For Business — Repository Factory
 *
 * PostgreSQL is the only database. There is no adapter to select.
 *
 * This file used to carry a second, complete SQLite implementation behind a
 * DATABASE_TYPE switch: 25 repositories, a separate transaction manager, a
 * separate base class, and a lazy loader whose job was to keep the native
 * better-sqlite3 driver out of a PostgreSQL boot. That existed to make the
 * migration reversible while it was in progress. The migration is finished,
 * so the switch is gone and with it the possibility of a misspelled
 * DATABASE_TYPE silently serving a stale, frozen copy of the data -- which the
 * old default did, with nothing but a console warning.
 */

/**
 * Get the repository bundle.
 *
 * @param {string} [adapterType] Legacy parameter. PostgreSQL is the only
 *   database now, so this is ignored; it is still accepted because call sites
 *   pass `getRepositories(null, client)` to bind repositories to an open
 *   transaction, and that second argument is the one that matters.
 * @param {import('pg').PoolClient} [transactionClient] Pass the client handed
 *   to a PostgresTransactionManager.run() callback to get a fresh repo bundle
 *   bound to that client instead of the pool-bound singleton -- so writes made
 *   through the returned repos actually participate in that transaction.
 */
function getRepositories(adapterType, transactionClient) {
  const { getPgRepositories } = require('./postgres');

  if (transactionClient) {
    return getPgRepositories(transactionClient);
  }

  return getPgRepositories();
}

/**
 * Reset cached repository instances (tests only).
 */
function resetRepositories() {
  const { resetPgRepositories } = require('./postgres');
  resetPgRepositories();
}

/**
 * The active adapter. Retained so callers that report which database is in
 * use keep working; the answer is no longer variable.
 * @returns {'postgres'}
 */
function getActiveAdapterType() {
  return 'postgres';
}

module.exports = {
  getRepositories,
  resetRepositories,
  getActiveAdapterType
};
