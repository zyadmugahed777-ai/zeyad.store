/**
 * Zeyad For Business - Session Store
 *
 * A persistent session store for express-session backed by the Session
 * Repository. Deliberately backend-agnostic: it resolves whichever session
 * repository the adapter factory is configured for, so it works unchanged on
 * PostgreSQL and on legacy SQLite. It was previously named SqliteSessionStore,
 * which described a coupling it never actually had.
 * Preserves Admin, Customer, and Guest sessions across server restarts.
 * Delegates 100% data access to Session Repository.
 */

const session = require('express-session');
const { getRepositories } = require('../repositories');

class SessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this._sessionRepo = options.sessionRepo || null;
    this.ttl = options.ttl || 86400; // default 24 hours in seconds
    this.cleanupIntervalMs = options.cleanupIntervalMs || 15 * 60 * 1000; // 15 minutes

    this.startCleanupInterval();
  }

  get sessionRepo() {
    return this._sessionRepo || getRepositories().sessions;
  }

  async get(sid, cb) {
    try {
      const sess = await this.sessionRepo.get(sid);
      return cb(null, sess || null);
    } catch (err) {
      return cb(err);
    }
  }

  async set(sid, sessData, cb) {
    try {
      let maxAge = this.ttl;
      if (sessData && sessData.cookie && sessData.cookie.maxAge) {
        maxAge = Math.floor(sessData.cookie.maxAge / 1000);
      }
      await this.sessionRepo.set(sid, sessData, maxAge);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  async destroy(sid, cb) {
    try {
      await this.sessionRepo.destroy(sid);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  async touch(sid, sessData, cb) {
    try {
      let maxAge = this.ttl;
      if (sessData && sessData.cookie && sessData.cookie.maxAge) {
        maxAge = Math.floor(sessData.cookie.maxAge / 1000);
      }
      await this.sessionRepo.touch(sid, maxAge);
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  async clear(cb) {
    try {
      await this.sessionRepo.clear();
      if (cb) cb(null);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  async length(cb) {
    try {
      const count = await this.sessionRepo.length();
      if (cb) cb(null, count);
    } catch (err) {
      if (cb) cb(err);
    }
  }

  startCleanupInterval() {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.sessionRepo.cleanupExpired();
      } catch (err) {
        console.error('Session cleanup error:', err.message);
      }
    }, this.cleanupIntervalMs);

    if (this.cleanupTimer && this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  async cleanupExpired() {
    return await this.sessionRepo.cleanupExpired();
  }
}

module.exports = SessionStore;
