const express = require('express');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { cmsService } = require('../../services/cms-service');
const { requireAuth, logAction } = require('../../middleware/auth');

router.use(requireAuth);

// GET /admin/editor - Serve the Visual Editor UI
router.get('/', async (req, res) => {
  try {
    const pageId = req.query.page_id || 1;
    const cmsPage = await cmsService.getPageById(pageId);

    if (!cmsPage) {
      req.session.flash = { type: 'danger', message: 'الصفحة غير موجودة' };
      return res.redirect('/admin/pages');
    }

    if (cmsPage.editable === false || cmsPage.editable === 0) {
      req.session.flash = { type: 'warning', message: `الصفحة "${cmsPage.title_ar}" صفحة نظام محمية ولا يمكن تحريرها عبر المحرر المرئي.` };
      return res.redirect('/admin/pages');
    }

    // Preview URL with visual_editor=true and preview_draft=true for live draft reflection
    let previewUrl = cmsPage.slug === 'index' ? '/' : `/${cmsPage.slug}`;
    previewUrl += `?visual_editor=true&preview_draft=true`;

    const allPages = (await cmsService.getEditablePages()) || [];
    const revisions = (await cmsService.getRevisions(cmsPage.id)) || [];

    res.render('admin/editor', {
      title: 'المحرر المرئي: ' + cmsPage.title_ar,
      layout: false,
      previewUrl,
      cmsPage,
      allPages,
      revisions
    });
  } catch (err) {
    console.error('Error opening editor:', err);
    req.session.flash = { type: 'danger', message: 'حدث خطأ أثناء فتح المحرر: ' + err.message };
    res.redirect('/admin/pages');
  }
});

// POST /admin/editor/save - Save content block into Draft (cms_elements)
router.post('/save', express.json(), async (req, res) => {
  try {
    const { page_id, element_key, content, element_type, styles, is_visible } = req.body;
    
    if (!page_id || !element_key) {
      return res.status(400).json({ success: false, message: 'بيانات غير مكتملة (page_id و element_key مطلوبان)' });
    }

    const userId = req.session?.admin?.id || null;
    const updated = await cmsService.saveDraftElement(page_id, element_key, {
      element_type,
      content,
      styles,
      is_visible
    }, userId);

    try {
      await logAction(userId, 'cms_draft_save', 'cms_elements', `${page_id}:${element_key}`, { content, element_type });
    } catch (_) {}

    res.json({ success: true, message: 'تم حفظ المسودة بنجاح', data: updated });
  } catch (err) {
    console.error('Editor save draft error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /admin/editor/publish - Publish Page Drafts to Canonical cms_published
router.post('/publish', express.json(), async (req, res) => {
  try {
    const { page_id } = req.body;
    if (!page_id) {
      return res.status(400).json({ success: false, message: 'معرف الصفحة مطلوب للنشر' });
    }

    const userId = req.session?.admin?.id || 1;
    const result = await cmsService.publishPage(page_id, userId);

    try {
      await logAction(userId, 'cms_publish', 'cms_pages', String(page_id), result);
    } catch (_) {}

    // Publishing used to report unconditional success. An edit whose element
    // is no longer on the page -- because the page was rewritten and its ids
    // regenerated -- is silently skipped when the page is rendered, so the
    // operator was told "تم النشر بنجاح" and then saw nothing change. Three of
    // the six real saved edits on index.html were orphaned exactly this way.
    // Count what actually resolves and say so.
    let orphaned = 0;
    let applied = 0;
    try {
      const page = await cmsService.getPageById(page_id);
      const slug = page && page.slug;
      const filePath = slug && path.join(__dirname, '..', '..', '..', slug + '.html');
      if (filePath && fs.existsSync(filePath)) {
        const $ = cheerio.load(fs.readFileSync(filePath, 'utf8'));
        const published = await cmsService.getPublishedContent(slug);
        published.forEach((item, vid) => {
          if ($('[data-vid="' + vid + '"]').length > 0) applied++;
          else orphaned++;
        });
      }
    } catch (_) {
      // Counting is a courtesy; never let it turn a successful publish into
      // a failure.
    }

    const message = orphaned > 0
      ? `تم نشر ${applied} عنصر. ${orphaned} تعديل لم يعد له عنصر في الصفحة (تغيّرت الصفحة بعد حفظه) ولن يظهر.`
      : 'تم نشر التعديلات بنجاح وأصبحت مباشرة على الموقع العام';

    res.json({
      success: true,
      message,
      data: Object.assign({}, result, { applied_elements: applied, orphaned_elements: orphaned })
    });
  } catch (err) {
    console.error('Editor publish error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /admin/editor/undo - Undo element to previous draft revision
router.post('/undo', express.json(), async (req, res) => {
  try {
    const { page_id, element_key } = req.body;
    if (!page_id || !element_key) {
      return res.status(400).json({ success: false, message: 'بيانات غير مكتملة' });
    }

    const userId = req.session?.admin?.id || 1;
    const result = await cmsService.undoElement(page_id, element_key, userId);

    res.json({ success: true, message: 'تم استرجاع النسخة السابقة للعنصر', restoredValue: result.restoredContent });
  } catch (err) {
    console.error('Undo error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /admin/editor/revisions - Get Page History
router.get('/revisions', async (req, res) => {
  try {
    const pageId = req.query.page_id;
    if (!pageId) return res.status(400).json({ success: false, message: 'معرف الصفحة مطلوب' });
    const revisions = (await cmsService.getRevisions(pageId)) || [];
    res.json({ success: true, data: revisions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /admin/editor/rollback - Rollback full page to a published revision
router.post('/rollback', express.json(), async (req, res) => {
  try {
    const { page_id, revision_id } = req.body;
    if (!page_id || !revision_id) {
      return res.status(400).json({ success: false, message: 'معرف الصفحة ورقم المراجعة مطلوبان' });
    }

    const userId = req.session?.admin?.id || 1;
    const result = await cmsService.rollbackPage(page_id, revision_id, userId);

    try {
      await logAction(userId, 'cms_rollback', 'cms_pages', String(page_id), { revision_id, result });
    } catch (_) {}

    res.json({ success: true, message: 'تم استرجاع النسخة المنشورة السابقة بنجاح', data: result });
  } catch (err) {
    console.error('Rollback error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
