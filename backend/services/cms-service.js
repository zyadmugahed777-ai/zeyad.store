/**
 * Zeyad For Business - Central CMS Service
 * Single Source of Truth for Visual CMS, Drafts, Published Content, Revisions & Page Registry.
 * Refactored in Phase 1 Batch 6B to use Repository Layer (SqliteCmsRepo).
 */

const { getRepositories } = require('../repositories');

// Allowed style keys whitelist for security & layout preservation
const ALLOWED_STYLE_KEYS = new Set([
  'fontSize', 'fontWeight', 'fontFamily', 'color', 'textAlign', 'lineHeight', 'letterSpacing',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
  'borderRadius', 'borderColor', 'borderWidth', 'borderStyle', 'opacity',
  'display', 'hideOnMobile', 'hideOnDesktop', 'order', 'aspectRatio', 'objectFit'
]);

// Strip dangerous scripts or event handlers from text/HTML
function sanitizeContent(raw) {
  if (typeof raw !== 'string') return raw;
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function sanitizeStyles(stylesObj) {
  if (!stylesObj || typeof stylesObj !== 'object') return {};
  const cleaned = {};

  // Buckets are a device, optionally narrowed to one colour theme:
  //   global, desktop, tablet, mobile          -- applies in both themes
  //   global.dark, desktop.light, mobile.dark  -- applies in that theme only
  //
  // This list used to be the four device names alone, and anything else was
  // dropped without a word -- so a dark-mode-only edit was accepted by the
  // editor, reported as saved, and silently discarded here. The device half is
  // still checked against a fixed list and the theme half against exactly two
  // values, so nothing arbitrary reaches a CSS selector.
  const DEVICES = ['global', 'desktop', 'tablet', 'mobile'];
  const THEMES = ['dark', 'light'];
  const allowedBuckets = DEVICES.concat(
    DEVICES.flatMap((d) => THEMES.map((th) => d + '.' + th))
  );

  allowedBuckets.forEach(view => {
    if (stylesObj[view] && typeof stylesObj[view] === 'object') {
      cleaned[view] = {};
      for (const [k, v] of Object.entries(stylesObj[view])) {
        if (ALLOWED_STYLE_KEYS.has(k) && typeof v === 'string') {
          // Prevent CSS injection
          cleaned[view][k] = v.replace(/[;{}]/g, '').trim();
        }
      }
    }
  });

  return cleaned;
}

class CmsService {
  constructor() {
    this.publishedCache = new Map(); // pageSlug -> { data, timestamp }
    this.CACHE_TTL = 1000 * 60 * 5; // 5 minutes
  }

  get repo() {
    return getRepositories().cms;
  }

  get tx() {
    return getRepositories().tx;
  }

  invalidateCache(pageSlug = null) {
    if (pageSlug) {
      this.publishedCache.delete(pageSlug);
    } else {
      this.publishedCache.clear();
    }
  }

  // --- Page Registry ---

  async getPages() {
    return await this.repo.getPages();
  }

  async getEditablePages() {
    return await this.repo.getEditablePages();
  }

  async getPageById(id) {
    return await this.repo.getPageById(id);
  }

  async getPageBySlug(slug) {
    return await this.repo.getPageBySlug(slug);
  }

  // --- Draft Operations (cms_elements) ---

  async getElementDraft(pageId, elementKey) {
    return await this.repo.getElementDraft(pageId, elementKey);
  }

  async getPageDrafts(pageId) {
    return await this.repo.getPageDrafts(pageId);
  }

  async saveDraftElement(pageId, elementKey, elementData, userId = null) {
    const page = await this.getPageById(pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);
    if (page.editable === false || page.editable === 0) throw new Error(`Page "${page.slug}" is a protected system page and cannot be edited via Visual CMS.`);

    const key = String(elementKey).trim();
    if (!key) throw new Error('Element key is required');

    const type = elementData.element_type || elementData.type || 'text';
    let content = elementData.content !== undefined ? elementData.content : (elementData.value || '');
    content = sanitizeContent(typeof content === 'string' ? content : JSON.stringify(content));

    const styles = sanitizeStyles(elementData.styles || elementData.styles_json);
    const stylesJson = Object.keys(styles).length > 0 ? JSON.stringify(styles) : null;
    const isVisible = elementData.is_visible !== undefined ? (elementData.is_visible ? 1 : 0) : 1;

    const existing = await this.repo.getElementDraft(pageId, key);

    await this.tx.run(async (client) => {
      const txRepos = getRepositories(null, client);

      // 1. Record revision snapshot for undo
      const prevSnapshot = existing ? {
        content: existing.content,
        element_type: existing.element_type,
        styles_json: existing.styles_json,
        is_visible: existing.is_visible
      } : null;

      await txRepos.cms.createRevision(
        pageId,
        key,
        'draft_save',
        JSON.stringify(prevSnapshot),
        userId,
        `Draft save on element: ${key}`
      );

      // 2. Upsert into cms_elements
      await txRepos.cms.saveDraftElement(pageId, key, type, content, stylesJson, isVisible);
    });

    return await this.getElementDraft(pageId, key);
  }

  // --- Publishing Transaction (cms_elements -> cms_published) ---

  async publishPage(pageId, userId = null) {
    const page = await this.getPageById(pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);
    if (page.editable === false || page.editable === 0) throw new Error(`Page "${page.slug}" is a protected system page and cannot be published.`);

    const drafts = (await this.getPageDrafts(pageId)) || [];
    const currentPublished = await this.repo.getPublishedByPage(pageId);

    await this.tx.run(async (client) => {
      const txRepos = getRepositories(null, client);

      // 1. Record full page published snapshot for Rollback
      await txRepos.cms.createRevision(
        pageId,
        null,
        'publish_snapshot',
        JSON.stringify(currentPublished),
        userId,
        `Published revision containing ${drafts.length} elements for page: ${page.slug}`
      );

      // 2. Clear current published for this page and copy from drafts
      await txRepos.cms.deletePublishedByPage(pageId);

      for (const d of drafts) {
        await txRepos.cms.insertPublishedElement(
          pageId,
          d.element_key,
          d.element_type,
          d.content,
          d.styles_json,
          d.metadata,
          d.is_visible,
          userId
        );
      }

      // 3. Sync to deprecated theme_content table as a backward-compatible safety mirror
      try {
        await txRepos.cms.syncThemeContent(drafts);
      } catch (_) {}
    });

    this.invalidateCache(page.slug);
    return {
      success: true,
      page_id: pageId,
      slug: page.slug,
      published_elements_count: drafts.length,
      published_at: new Date().toISOString()
    };
  }

  // --- Undo & Rollback Operations ---

  async undoElement(pageId, elementKey, userId = null) {
    const lastRev = await this.repo.getLastDraftRevision(pageId, elementKey);

    if (!lastRev) {
      throw new Error(`لا توجد نسخة سابقة محفوظة للعنصر: ${elementKey}`);
    }

    const snapshot = JSON.parse(lastRev.snapshot);
    const existing = await this.getElementDraft(pageId, elementKey);

    await this.tx.run(async (client) => {
      const txRepos = getRepositories(null, client);

      if (snapshot === null) {
        // Was a new insert, delete from draft
        if (existing) {
          await txRepos.cms.deleteDraftElement(existing.id);
        }
      } else {
        // Restore previous draft state
        if (existing) {
          await txRepos.cms.saveDraftElement(
            pageId,
            elementKey,
            snapshot.element_type || 'text',
            snapshot.content,
            snapshot.styles_json || null,
            snapshot.is_visible !== undefined ? snapshot.is_visible : 1
          );
        } else {
          await txRepos.cms.insertDraftElement(
            pageId,
            elementKey,
            snapshot.element_type || 'text',
            snapshot.content,
            snapshot.styles_json || null,
            null,
            snapshot.is_visible !== undefined ? snapshot.is_visible : 1
          );
        }
      }

      // Remove the consumed revision
      await txRepos.cms.deleteRevision(lastRev.id);
    });

    return { success: true, restoredContent: snapshot ? snapshot.content : null };
  }

  async getRevisions(pageId) {
    return await this.repo.getRevisions(pageId);
  }

  async rollbackPage(pageId, revisionId, userId = null) {
    const page = await this.getPageById(pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);

    const rev = await this.repo.getRevisionById(revisionId, pageId);
    if (!rev) throw new Error(`Revision ${revisionId} not found for page ${pageId}`);

    const snapshot = JSON.parse(rev.snapshot);
    if (!Array.isArray(snapshot)) {
      throw new Error('Selected revision does not contain a full page snapshot.');
    }

    await this.tx.run(async (client) => {
      const txRepos = getRepositories(null, client);

      // 1. Record rollback event
      await txRepos.cms.createRevision(
        pageId,
        null,
        'rollback',
        rev.snapshot,
        userId,
        `Rollback to revision #${revisionId} (${rev.created_at})`
      );

      // 2. Restore into cms_published
      await txRepos.cms.deletePublishedByPage(pageId);

      // 3. Restore into cms_elements (Draft)
      await txRepos.cms.deleteDraftsByPage(pageId);

      for (const item of snapshot) {
        await txRepos.cms.insertPublishedElement(
          pageId,
          item.element_key,
          item.element_type || 'text',
          item.content,
          item.styles_json || null,
          item.metadata || null,
          item.is_visible !== undefined ? item.is_visible : 1,
          userId
        );
        await txRepos.cms.insertDraftElement(
          pageId,
          item.element_key,
          item.element_type || 'text',
          item.content,
          item.styles_json || null,
          item.metadata || null,
          item.is_visible !== undefined ? item.is_visible : 1
        );
      }
    });

    this.invalidateCache(page.slug);
    return { success: true, restoredElementsCount: snapshot.length };
  }

  // --- Content Query for Public Website & Preview (visual-cms middleware) ---

  async getPublishedContent(pageSlug = null) {
    const slug = pageSlug || 'index';
    const now = Date.now();
    const cached = this.publishedCache.get(slug);
    if (cached && (now - cached.timestamp < this.CACHE_TTL)) {
      return cached.data;
    }

    const page = await this.getPageBySlug(slug);
    const pageId = page ? page.id : 1;

    const rows = await this.repo.getPublishedOverrides(pageId);

    const map = new Map();
    (rows || []).forEach(r => {
      let styles = {};
      try {
        if (r.styles_json) styles = JSON.parse(r.styles_json);
      } catch (_) {}
      map.set(r.element_key, {
        key: r.element_key,
        type: r.element_type,
        value: r.content,
        styles: styles
      });
    });

    this.publishedCache.set(slug, { data: map, timestamp: now });
    return map;
  }

  async getDraftContent(pageSlug = null) {
    const slug = pageSlug || 'index';
    const page = await this.getPageBySlug(slug);
    const pageId = page ? page.id : 1;

    const rows = await this.repo.getDraftOverrides(pageId);

    const map = new Map();
    (rows || []).forEach(r => {
      let styles = {};
      try {
        if (r.styles_json) styles = JSON.parse(r.styles_json);
      } catch (_) {}
      map.set(r.element_key, {
        key: r.element_key,
        type: r.element_type,
        value: r.content,
        styles: styles
      });
    });

    return map;
  }
}

const cmsServiceInstance = new CmsService();

module.exports = {
  CmsService,
  cmsService: cmsServiceInstance,
  sanitizeContent,
  sanitizeStyles
};
