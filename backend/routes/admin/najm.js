const router = require('express').Router();
const { getNajmSettings, saveNajmSettings, getNajmInstructions, saveNajmInstructions, resetNajmInstructions, testNajmConnection, DEFAULT_NAJM_SECTIONS } = require('../../services/ai/najm-settings-store');
const { PROVIDERS } = require('../../services/ai/defaults');
const { customerToolsDefinitions } = require('../../services/ai/customer-tools');
const { listCustomerRequests, updateCustomerRequestStatus, getCustomerRequest } = require('../../services/ai/customer-requests');
const { getRecentAudits } = require('../../services/ai/audit-service');
const { setFlash } = require('../../middleware/auth');
const { getRepositories } = require('../../repositories');

function renderNajmPage(view) {
  return async (req, res, next) => {
    try {
      const repos = getRepositories();

      // Stats
      const totalConversations = await repos.ai.najmConversations.countTotal();
      const totalMessages = await repos.ai.najmConversations.countTotalMessages();
      const totalRequests = await repos.ai.najmRequests.countTotal();
      const pendingRequests = await repos.ai.najmRequests.countByStatuses(['new', 'pending']);
      const completedRequests = await repos.ai.najmRequests.countByStatuses(['completed', 'resolved']);
      const assistedOrders = await repos.ai.audit.countActionAudits('confirm_order', 'success');

      const settings = await getNajmSettings(false);
      const instructions = await getNajmInstructions();
      const requests = await listCustomerRequests({ limit: 100 });
      const conversations = await repos.ai.listCustomerConversations(50);
      const actionAudits = await getRecentAudits(80);

      const titles = {
        overview: 'نجم — وكيل العملاء | لوحة التحكم',
        settings: 'نجم — إعدادات مزود الذكاء',
        instructions: 'نجم — محرر التعليمات والسياسات',
        tools: 'نجم — أدوات وصلاحيات المتجر',
        requests: 'نجم — طلبات وتذاكر العملاء',
        conversations: 'نجم — محادثات العملاء الحية',
        audits: 'نجم — سجل العمليات الحساسة (Audit)'
      };

      res.render('admin/najm/index', {
        title: titles[view] || 'نجم — وكيل العملاء',
        active: 'najm',
        view,
        csrfToken: (typeof req.csrfToken === 'function' ? req.csrfToken() : (req.session?.csrfToken || res.locals?.csrfToken || '')),
        providers: PROVIDERS,
        settings,
        instructions,
        defaultSections: DEFAULT_NAJM_SECTIONS,
        tools: customerToolsDefinitions,
        requests,
        conversations,
        actionAudits,
        stats: {
          totalConversations,
          totalMessages,
          totalRequests,
          pendingRequests,
          completedRequests,
          assistedOrders,
          conversionRate: totalConversations > 0 ? ((assistedOrders / totalConversations) * 100).toFixed(1) + '%' : '0%'
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

router.get('/', renderNajmPage('overview'));
router.get('/overview', renderNajmPage('overview'));
router.get('/settings', renderNajmPage('settings'));
router.get('/instructions', renderNajmPage('instructions'));
router.get('/tools', renderNajmPage('tools'));
router.get('/requests', renderNajmPage('requests'));
router.get('/conversations', renderNajmPage('conversations'));
router.get('/audits', renderNajmPage('audits'));

// POST /admin/najm/settings
router.post('/settings', async (req, res) => {
  try {
    const adminId = req.session?.admin?.id;
    await saveNajmSettings({
      provider: req.body.provider,
      model: req.body.model,
      apiBaseUrl: req.body.apiBaseUrl,
      apiToken: req.body.apiToken,
      temperature: req.body.temperature,
      maxTokens: req.body.maxTokens,
      requestTimeout: req.body.requestTimeout,
      enableVision: req.body.enableVision === 'on' || req.body.enableVision === true || req.body.enableVision === '1',
      enableTools: req.body.enableTools === 'on' || req.body.enableTools === true || req.body.enableTools === '1',
      isActive: req.body.isActive === 'on' || req.body.isActive === true || req.body.isActive === '1'
    }, adminId);

    setFlash(req, 'success', 'تم حفظ إعدادات وكيل العميل "نجم" بنجاح.');
    res.redirect('/admin/najm/settings');
  } catch (error) {
    console.error('Error saving Najm settings:', error);
    setFlash(req, 'danger', 'فشل حفظ الإعدادات: ' + error.message);
    res.redirect('/admin/najm/settings');
  }
});

// POST /admin/najm/test-connection (AJAX)
router.post('/test-connection', async (req, res) => {
  try {
    const result = await testNajmConnection({
      provider: req.body.provider,
      model: req.body.model,
      apiBaseUrl: req.body.apiBaseUrl,
      apiToken: req.body.apiToken
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, ok: false, error: error.message || 'فشل فحص الاتصال' });
  }
});

// POST /admin/najm/instructions
router.post('/instructions', async (req, res) => {
  try {
    const adminId = req.session?.admin?.id;
    await saveNajmInstructions({
      agent_identity: req.body.agent_identity,
      core_instructions: req.body.core_instructions,
      tone_and_style: req.body.tone_and_style,
      sales_policy: req.body.sales_policy,
      pricing_policy: req.body.pricing_policy,
      orders_and_reservation_policy: req.body.orders_and_reservation_policy,
      human_handoff_policy: req.body.human_handoff_policy,
      tool_rules: req.body.tool_rules,
      vision_rules: req.body.vision_rules
    }, adminId);

    setFlash(req, 'success', 'تم تحديث تعليمات وسياسات نجم بنجاح.');
    res.redirect('/admin/najm/instructions');
  } catch (error) {
    console.error('Error saving Najm instructions:', error);
    setFlash(req, 'danger', 'فشل حفظ التعليمات: ' + error.message);
    res.redirect('/admin/najm/instructions');
  }
});

// POST /admin/najm/instructions/reset
router.post('/instructions/reset', async (req, res) => {
  try {
    const adminId = req.session?.admin?.id;
    await resetNajmInstructions(adminId);
    setFlash(req, 'success', 'تم استعادة التعليمات الافتراضية لنجم بنجاح.');
    res.redirect('/admin/najm/instructions');
  } catch (error) {
    setFlash(req, 'danger', 'فشل استعادة التعليمات: ' + error.message);
    res.redirect('/admin/najm/instructions');
  }
});

// POST /admin/najm/requests/:id/status
router.post('/requests/:id/status', async (req, res) => {
  try {
    const adminId = req.session?.admin?.id;
    const { status, admin_notes } = req.body;
    await updateCustomerRequestStatus(req.params.id, status, admin_notes, adminId);
    setFlash(req, 'success', 'تم تحديث حالة تذكرة العميل بنجاح.');
    res.redirect('/admin/najm/requests');
  } catch (error) {
    setFlash(req, 'danger', 'فشل تحديث الحالة: ' + error.message);
    res.redirect('/admin/najm/requests');
  }
});

// GET /admin/najm/conversations/:id/messages (AJAX)
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const repos = getRepositories();
    const messages = await repos.ai.getCustomerConversationMessages(req.params.id);
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: 'تعذر جلب الرسائل' });
  }
});

module.exports = router;
