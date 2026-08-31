/**
 * SQLite Admin Repository
 * Encapsulates all database queries for admin-specific operations:
 * departments, branches, banners, offers, dashboard stats.
 * Methods are synchronous (better-sqlite3). No business logic.
 * Batch 0 stub — queries extracted in Batch 2+.
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresAdminRepo extends PostgresBaseRepository {
  // Stub — queries will be extracted from routes/admin/*.js in later batches
}

module.exports = PostgresAdminRepo;
