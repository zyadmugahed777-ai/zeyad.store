/**
 * Zeyad For Business — PostgreSQL Transaction Manager (Phase 8A)
 * 
 * Provides atomic transaction execution for PostgreSQL repositories
 * using client checkouts and BEGIN/COMMIT/ROLLBACK.
 */

class PostgresTransactionManager {
  /**
   * @param {import('pg').Pool} pool
   */
  constructor(pool) {
    if (!pool) {
      throw new Error('PostgresTransactionManager requires a pg Pool instance');
    }
    this.pool = pool;
  }

  /**
   * Execute an asynchronous transaction.
   * Checks out a client, runs BEGIN, executes the callback with the client,
   * and automatically executes COMMIT on success or ROLLBACK on error.
   * 
   * @param {(client: import('pg').PoolClient) => Promise<any>} callback
   * @returns {Promise<any>}
   */
  async run(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { PostgresTransactionManager };
