/**
 * SQLite CMS Repository
 * Encapsulates all database queries for cms_pages, cms_elements, cms_published,
 * cms_revisions, theme_content, and theme_settings.
 * Methods are synchronous (better-sqlite3). No business logic.
 * Extracted in Batch 6B (Visual CMS / Draft / Publish / Revision Boundary).
 */
const PostgresBaseRepository = require('./postgres-base-repository');

class PostgresCmsRepo extends PostgresBaseRepository {
  // ==========================================
  // 1. Page Registry (cms_pages)
  // ==========================================

  /**
   * Get all registered CMS pages with published and draft element counts
   * @returns {Array<Object>}
   */
  async getPages() {
    return await this.db.prepare(`
      SELECT p.*,
             (SELECT COUNT(*) FROM cms_published WHERE page_id = p.id) as published_count,
             (SELECT COUNT(*) FROM cms_elements WHERE page_id = p.id) as draft_count
      FROM cms_pages p
      ORDER BY p.editable DESC, p.sort_order ASC, p.id ASC
    `).all();
  }

  /**
   * Get all editable CMS pages
   * @returns {Array<Object>}
   */
  async getEditablePages() {
    return await this.db.prepare(`
      SELECT p.*,
             (SELECT COUNT(*) FROM cms_published WHERE page_id = p.id) as published_count,
             (SELECT COUNT(*) FROM cms_elements WHERE page_id = p.id) as draft_count
      FROM cms_pages p
      WHERE p.editable = 1 AND p.is_active = 1
      ORDER BY p.sort_order ASC, p.id ASC
    `).all();
  }

  /**
   * Register a storefront page in the CMS registry, if it is not already there.
   *
   * ON CONFLICT DO NOTHING is deliberate: an operator may have renamed a page
   * or marked it non-editable by hand, and a filesystem scan must never
   * silently undo that.
   *
   * @param {Object} page
   * @returns {Promise<boolean>} true when a new row was inserted
   */
  async registerPage(page) {
    const res = await this.db.prepare(`
      INSERT INTO cms_pages (slug, route, title_ar, title_en, page_type, editable, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
      ON CONFLICT (slug) DO NOTHING
    `).run(
      page.slug,
      page.route || null,
      page.title_ar || page.slug,
      page.title_en || null,
      page.page_type || 'static',
      page.editable === false ? false : true,
      Number.isFinite(Number(page.sort_order)) ? Number(page.sort_order) : 500
    );
    return !!(res && (res.changes || res.rowCount));
  }

  /**
   * Open the legacy 'protected' pages (cart, checkout, login, account, search,
   * track-order) to the visual editor, retyping them as 'functional'.
   *
   * These were locked out of the editor entirely. Visual edits only override
   * text and styling by element id, so the lock cost more than it protected:
   * the wording of a checkout button or a login error could not be changed at
   * all. Retyping as part of the same statement makes this a one-time
   * promotion -- once no 'protected' row is left, it does nothing on later
   * boots and cannot re-open a page an operator has since locked by hand.
   *
   * @returns {Promise<number>} how many rows were promoted
   */
  async promoteProtectedPages() {
    const res = await this.db.prepare(`
      UPDATE cms_pages
         SET editable = TRUE, page_type = 'functional'
       WHERE page_type = 'protected'
    `).run();
    return (res && (res.changes || res.rowCount)) || 0;
  }

  /**
   * Get single page by numeric ID
   * @param {number|string} id
   * @returns {Object|null}
   */
  async getPageById(id) {
    if (!id) return null;
    return await this.db.prepare('SELECT * FROM cms_pages WHERE id = ?').get(Number(id)) || null;
  }

  /**
   * Get single page by slug
   * @param {string} slug
   * @returns {Object|null}
   */
  async getPageBySlug(slug) {
    if (!slug) return null;
    return await this.db.prepare('SELECT * FROM cms_pages WHERE slug = ?').get(String(slug)) || null;
  }

  /**
   * Count pages matching WHERE clause
   * @param {string} where
   * @param {Array} params
   * @returns {number}
   */
  async countPages(where = '1=1', params = []) {
    return (await this.db.prepare(`SELECT COUNT(*) as count FROM cms_pages WHERE ${where}`).get(...params))?.count || 0;
  }

  /**
   * Find paginated pages matching WHERE clause
   * @param {string} where
   * @param {Array} params
   * @param {number} limit
   * @param {number} offset
   * @returns {Array<Object>}
   */
  async findPages(where = '1=1', params = [], limit = 20, offset = 0) {
    return await this.db.prepare(`
      SELECT * FROM cms_pages 
      WHERE ${where} 
      ORDER BY page_type ASC, id ASC 
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
  }

  /**
   * Update page settings
   * @param {number|string} id
   * @param {Object} data
   * @returns {boolean}
   */
  async updatePageSettings(id, data) {
    const res = await this.db.prepare(`
      UPDATE cms_pages 
      SET title_ar = ?, title_en = ?, is_active = ?, updated_at = NOW()
      WHERE id = ?
    `).run(
      data.title_ar,
      data.title_en || null,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      Number(id)
    );
    return res.changes > 0;
  }

  // ==========================================
  // 2. Draft Elements (cms_elements)
  // ==========================================

  /**
   * Get single element draft
   * @param {number|string} pageId
   * @param {string} elementKey
   * @returns {Object|null}
   */
  async getElementDraft(pageId, elementKey) {
    return await this.db.prepare('SELECT * FROM cms_elements WHERE page_id = ? AND element_key = ?').get(Number(pageId), String(elementKey)) || null;
  }

  /**
   * Get all draft elements for a page
   * @param {number|string} pageId
   * @returns {Array<Object>}
   */
  async getPageDrafts(pageId) {
    return await this.db.prepare('SELECT * FROM cms_elements WHERE page_id = ?').all(Number(pageId));
  }

  /**
   * Save draft element (insert or update)
   * @param {number|string} pageId
   * @param {string} key
   * @param {string} type
   * @param {string} content
   * @param {string|null} stylesJson
   * @param {number} isVisible
   * @returns {number} ID of updated/inserted draft element
   */
  async saveDraftElement(pageId, key, type, content, stylesJson, isVisible) {
    const existing = await this.getElementDraft(pageId, key);
    if (existing) {
      await this.db.prepare(`
        UPDATE cms_elements
        SET element_type = ?, content = ?, styles_json = ?, is_visible = ?, updated_at = NOW()
        WHERE id = ?
      `).run(type, content, stylesJson, isVisible, existing.id);
      return existing.id;
    } else {
      const res = await this.db.prepare(`
        INSERT INTO cms_elements (page_id, element_key, element_type, content, styles_json, is_visible, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `).run(Number(pageId), key, type, content, stylesJson, isVisible);
      return res.lastInsertRowid;
    }
  }

  /**
   * Delete single draft element by ID
   * @param {number|string} id
   * @returns {boolean}
   */
  async deleteDraftElement(id) {
    const res = await this.db.prepare('DELETE FROM cms_elements WHERE id = ?').run(Number(id));
    return res.changes > 0;
  }

  /**
   * Delete all draft elements for a page
   * @param {number|string} pageId
   * @returns {number}
   */
  async deleteDraftsByPage(pageId) {
    const res = await this.db.prepare('DELETE FROM cms_elements WHERE page_id = ?').run(Number(pageId));
    return res.changes;
  }

  /**
   * Direct insert into cms_elements (used during rollback)
   */
  async insertDraftElement(pageId, elementKey, type, content, stylesJson, metadata, isVisible) {
    const res = await this.db.prepare(`
      INSERT INTO cms_elements (page_id, element_key, element_type, content, styles_json, metadata, is_visible, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `).run(
      Number(pageId),
      elementKey,
      type || 'text',
      content,
      stylesJson || null,
      metadata || null,
      isVisible !== undefined ? isVisible : 1
    );
    return res.lastInsertRowid;
  }

  // ==========================================
  // 3. Published Elements (cms_published)
  // ==========================================

  /**
   * Get all published elements for a page
   * @param {number|string} pageId
   * @returns {Array<Object>}
   */
  async getPublishedByPage(pageId) {
    return await this.db.prepare('SELECT * FROM cms_published WHERE page_id = ?').all(Number(pageId));
  }

  /**
   * Delete all published elements for a page
   * @param {number|string} pageId
   * @returns {number}
   */
  async deletePublishedByPage(pageId) {
    const res = await this.db.prepare('DELETE FROM cms_published WHERE page_id = ?').run(Number(pageId));
    return res.changes;
  }

  /**
   * Insert published element
   */
  async insertPublishedElement(pageId, elementKey, type, content, stylesJson, metadata, isVisible, publishedBy) {
    const res = await this.db.prepare(`
      INSERT INTO cms_published (page_id, element_key, element_type, content, styles_json, metadata, is_visible, published_at, published_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `).run(
      Number(pageId),
      elementKey,
      type || 'text',
      content,
      stylesJson || null,
      metadata || null,
      isVisible !== undefined ? isVisible : 1,
      publishedBy || null
    );
    return res.lastInsertRowid;
  }

  /**
   * Query published elements for website rendering (with global fallbacks for subpages)
   * @param {number} pageId
   * @returns {Array<Object>}
   */
  async getPublishedOverrides(pageId) {
    const pId = Number(pageId) || 1;
    if (pId === 1) {
      return await this.db.prepare(`
        SELECT element_key, element_type, content, styles_json, is_visible 
        FROM cms_published 
        WHERE page_id = 1 AND is_visible = 1
      `).all();
    }

    return await this.db.prepare(`
      SELECT element_key, element_type, content, styles_json, is_visible
      FROM cms_published
      WHERE (page_id = ? OR (page_id = 1 AND (element_key ILIKE 'footer_%' OR element_key ILIKE 'header_%' OR element_key = 'store_name' OR element_key ILIKE 'social_%')))
        AND is_visible = 1
    `).all(pId);
  }

  /**
   * Query draft elements for live preview rendering
   * @param {number} pageId
   * @returns {Array<Object>}
   */
  async getDraftOverrides(pageId) {
    const pId = Number(pageId) || 1;
    if (pId === 1) {
      return await this.db.prepare(`
        SELECT element_key, element_type, content, styles_json, is_visible 
        FROM cms_elements 
        WHERE page_id = 1 AND is_visible = 1
      `).all();
    }

    return await this.db.prepare(`
      SELECT element_key, element_type, content, styles_json, is_visible
      FROM cms_elements
      WHERE (page_id = ? OR (page_id = 1 AND (element_key ILIKE 'footer_%' OR element_key ILIKE 'header_%' OR element_key = 'store_name' OR element_key ILIKE 'social_%')))
        AND is_visible = 1
    `).all(pId);
  }

  // ==========================================
  // 4. Revisions & Rollback History (cms_revisions)
  // ==========================================

  /**
   * Create revision record
   */
  async createRevision(pageId, elementKey, revisionType, snapshot, userId, description) {
    const res = await this.db.prepare(`
      INSERT INTO cms_revisions (page_id, element_key, revision_type, snapshot, user_id, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `).run(
      Number(pageId),
      elementKey || null,
      revisionType || 'draft_save',
      typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot),
      userId || null,
      description || null
    );
    return res.lastInsertRowid;
  }

  /**
   * Get revisions for a page
   * @param {number|string} pageId
   * @param {number} [limit=50]
   * @returns {Array<Object>}
   */
  async getRevisions(pageId, limit = 50) {
    return await this.db.prepare(`
      SELECT id, page_id, element_key, revision_type, description, created_at, user_id
      FROM cms_revisions
      WHERE page_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(Number(pageId), limit);
  }

  /**
   * Get single revision by ID and pageId
   * @param {number|string} id
   * @param {number|string} pageId
   * @returns {Object|null}
   */
  async getRevisionById(id, pageId) {
    return await this.db.prepare('SELECT * FROM cms_revisions WHERE id = ? AND page_id = ?').get(Number(id), Number(pageId)) || null;
  }

  /**
   * Get last draft revision for an element
   * @param {number|string} pageId
   * @param {string} elementKey
   * @returns {Object|null}
   */
  async getLastDraftRevision(pageId, elementKey) {
    return await this.db.prepare(`
      SELECT * FROM cms_revisions
      WHERE page_id = ? AND element_key = ? AND revision_type = 'draft_save'
      ORDER BY id DESC LIMIT 1
    `).get(Number(pageId), String(elementKey)) || null;
  }

  /**
   * Delete revision by ID
   * @param {number|string} id
   * @returns {boolean}
   */
  async deleteRevision(id) {
    const res = await this.db.prepare('DELETE FROM cms_revisions WHERE id = ?').run(Number(id));
    return res.changes > 0;
  }

  // ==========================================
  // 5. Theme Content Mirror & Settings
  // ==========================================

  /**
   * Sync published items to theme_content table as a backward-compatible mirror
   * @param {Array<Object>} items
   */
  async syncThemeContent(items) {
    const stmt = this.db.prepare(`
      INSERT INTO theme_content (key, type, value, updated_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT(key) DO UPDATE SET
        type = excluded.type,
        value = excluded.value,
        updated_at = NOW()
    `);

    for (const d of items) {
      await stmt.run(d.element_key, d.element_type, d.content);
    }
  }

  /**
   * Update theme content record
   */
  async updateThemeContent(key, type, value) {
    const res = await this.db.prepare(`
      INSERT INTO theme_content (key, type, value, updated_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT(key) DO UPDATE SET
        type = excluded.type,
        value = excluded.value,
        updated_at = NOW()
    `).run(key, type || 'text', value);
    return res.changes > 0;
  }

  /**
   * Get theme settings
   */
  async getThemeSettings() {
    return await this.db.prepare('SELECT * FROM theme_settings').all();
  }

  /**
   * Get single theme setting by key
   */
  async getThemeSetting(key) {
    return (await this.db.prepare('SELECT value FROM theme_settings WHERE key = ?').get(key))?.value || null;
  }
}

module.exports = PostgresCmsRepo;
