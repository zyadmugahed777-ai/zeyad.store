const router = require('express').Router();
const { requireAuth } = require('../../middleware/auth');
const csrfProtection = require('../../middleware/csrf');
const { checkPermission } = require('../../middleware/rbac');
const { PROVIDERS, DEFAULT_SYSTEM_INSTRUCTIONS } = require('../../services/ai/defaults');
const {
  getProviderSettings,
  saveProviderSettings,
  getSystemInstructions,
  saveSystemInstructions,
  resetSystemInstructions,
  getInstructionHistory,
  getKnowledge,
  saveKnowledge,
  getMemory,
  saveMemoryItem,
  deleteMemory,
  clearMemory
} = require('../../services/ai/settings-store');
const { getAiPermissions, saveAiPermissions } = require('../../services/ai/permissions');
const { getAiActivity } = require('../../services/ai/activity');
const { testProvider } = require('../../services/ai/providers');
const {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  deleteConversation,
  clearConversation,
  generateChatResponse,
  getDailyBriefing
} = require('../../services/ai/conversation-service');
const {
  getSalesSummary,
  getTopProducts,
  getInventorySummary,
  getWebsiteStatistics,
  getSeoStatus,
  getPagePerformance,
  getSystemStatus,
  createOperationalTasks,
  getTasks,
  updateTaskStatus,
  executeConfirmedAction,
  runTool
} = require('../../services/ai/tools');

router.use(requireAuth);
router.use(csrfProtection);
router.use(checkPermission('ai:view'));

function ok(res, data = {}) {
  res.json({ success: true, ...data });
}

function fail(res, error) {
  res.status(error.status || 500).json({
    success: false,
    error: error.status && error.status < 500 ? error.message : 'حدث خطأ غير متوقع. راجع سجل التشخيص عند الحاجة.'
  });
}

router.get('/settings', async (req, res) => {
  try {
    ok(res, {
      settings: (await getProviderSettings(false)) || {},
      providers: PROVIDERS,
      systemInstructions: (await getSystemInstructions()) || {},
      instructionHistory: (await getInstructionHistory()) || [],
      defaultSystemInstructions: DEFAULT_SYSTEM_INSTRUCTIONS
    });
  } catch (error) {
    fail(res, error);
  }
});

router.put('/settings', async (req, res) => {
  try {
    ok(res, { settings: await saveProviderSettings(req.body || {}, req.session.admin.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.put('/system-instructions', async (req, res) => {
  try {
    ok(res, { systemInstructions: await saveSystemInstructions(req.body.body, req.session.admin.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/system-instructions/reset', async (req, res) => {
  try {
    ok(res, { systemInstructions: await resetSystemInstructions(req.session.admin.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/test-provider', async (req, res) => {
  try {
    ok(res, { result: await testProvider() });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/conversations', async (req, res) => {
  try {
    ok(res, { conversations: await listConversations(req.session.admin.id, req.query.q || '') });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/conversations', async (req, res) => {
  try {
    ok(res, { conversation: await createConversation(req.session.admin.id, req.body.title || 'محادثة جديدة') });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const conversation = await getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ success: false, error: 'المحادثة غير موجودة.' });
    ok(res, { conversation });
  } catch (error) {
    fail(res, error);
  }
});

router.put('/conversations/:id', async (req, res) => {
  try {
    ok(res, { conversation: await renameConversation(req.params.id, req.body.title, req.session.admin.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    await deleteConversation(req.params.id, req.session.admin.id);
    ok(res);
  } catch (error) {
    fail(res, error);
  }
});

router.post('/conversations/:id/clear', async (req, res) => {
  try {
    await clearConversation(req.params.id, req.session.admin.id);
    ok(res);
  } catch (error) {
    fail(res, error);
  }
});

router.post('/chat', async (req, res) => {
  try {
    const result = await generateChatResponse({
      conversationId: req.body.conversationId,
      message: req.body.message,
      userId: req.session.admin.id
    });

    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('x-ai-conversation-id', String(result.conversationId));
    const words = result.content.split(/(\s+)/);
    let index = 0;
    const writeNext = () => {
      if (index >= words.length) return res.end();
      res.write(words[index]);
      index += 1;
      setTimeout(writeNext, 12);
    };
    writeNext();
  } catch (error) {
    res.status(error.status || 500).type('text/plain').send(error.message || 'حدث خطأ غير متوقع.');
  }
});

router.get('/briefing', async (req, res) => {
  try {
    ok(res, { briefing: await getDailyBriefing() });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/insights', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    ok(res, {
      insights: {
        sales: await getSalesSummary({ period }),
        products: await getTopProducts({ period }),
        inventory: await getInventorySummary(),
        website: await getWebsiteStatistics(),
        seo: await getSeoStatus(),
        performance: getPagePerformance(),
        system: await getSystemStatus()
      }
    });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/tasks', async (req, res) => {
  try {
    ok(res, { tasks: await createOperationalTasks() });
  } catch (error) {
    fail(res, error);
  }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    ok(res, { tasks: await updateTaskStatus({ taskId: req.params.id, status: req.body.status }) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/activity', async (req, res) => {
  try {
    ok(res, { activity: await getAiActivity(150) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/knowledge', async (req, res) => {
  try {
    ok(res, { knowledge: await getKnowledge() });
  } catch (error) {
    fail(res, error);
  }
});

router.put('/knowledge', async (req, res) => {
  try {
    ok(res, { knowledge: await saveKnowledge(req.body.items || [], req.session.admin.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/memory', async (req, res) => {
  try {
    ok(res, { memory: await getMemory() });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/memory', async (req, res) => {
  try {
    ok(res, { memory: await saveMemoryItem(req.body, req.session.admin.id) });
  } catch (error) {
    fail(res, error);
  }
});

router.delete('/memory/:id', async (req, res) => {
  try {
    await deleteMemory(req.params.id);
    ok(res);
  } catch (error) {
    fail(res, error);
  }
});

router.delete('/memory', async (req, res) => {
  try {
    await clearMemory();
    ok(res);
  } catch (error) {
    fail(res, error);
  }
});

router.get('/permissions', async (req, res) => {
  try {
    ok(res, { permissions: await getAiPermissions() });
  } catch (error) {
    fail(res, error);
  }
});

router.put('/permissions', async (req, res) => {
  try {
    ok(res, { permissions: await saveAiPermissions(req.body.enabled || []) });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/tools/:toolName', async (req, res) => {
  try {
    const result = await runTool(req.params.toolName, req.body || {}, {
      userId: req.session.admin.id,
      conversationId: req.body.conversationId
    });
    ok(res, { result });
  } catch (error) {
    fail(res, error);
  }
});

router.post('/confirm-action/:id', async (req, res) => {
  try {
    ok(res, { result: await executeConfirmedAction(req.params.id, req.session.admin.id) });
  } catch (error) {
    fail(res, error);
  }
});

// =============================================
// NAJM CUSTOMER AI MANAGEMENT ENDPOINTS
// =============================================
const { listCustomerRequests, updateCustomerRequestStatus } = require('../../services/ai/customer-requests');
const { getRecentAudits } = require('../../services/ai/audit-service');
const { getRepositories } = require('../../repositories');

router.get('/overview', async (req, res) => {
  try {
    const repos = getRepositories();
    const totalConversations = (await repos.ai.najmConversations.countTotal()) || 0;
    const totalMessages = (await repos.ai.najmConversations.countTotalMessages()) || 0;
    const totalRequests = (await repos.ai.najmRequests.countTotal()) || 0;
    const pendingRequests = (await repos.ai.najmRequests.countByStatus('pending')) || 0;
    const resolvedRequests = (await repos.ai.najmRequests.countByStatus('resolved')) || 0;
    const assistedOrders = (await repos.ai.audit.countActionAudits('confirm_order', 'success')) || 0;
    const cartAdditions = (await repos.ai.audit.countActionAudits('add_to_cart')) || 0;
    const topProducts = (await repos.ai.audit.getTopActionTargets('add_to_cart', 5)) || [];

    ok(res, {
      totalConversations,
      totalMessages,
      totalRequests,
      pendingRequests,
      resolvedRequests,
      assistedOrders,
      cartAdditions,
      conversionRate: totalConversations > 0 ? ((assistedOrders / totalConversations) * 100).toFixed(1) + '%' : '0%',
      topProducts
    });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/customer-requests', async (req, res) => {
  try {
    const status = req.query.status || null;
    const requests = await listCustomerRequests({ status, limit: 100 });
    ok(res, { requests });
  } catch (error) {
    fail(res, error);
  }
});

router.put('/customer-requests/:id/status', checkPermission('ai:edit'), async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const updated = await updateCustomerRequestStatus(req.params.id, status, adminNotes, req.session.admin.id);
    ok(res, { request: updated });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/customer-conversations', async (req, res) => {
  try {
    const repos = getRepositories();
    const conversations = (await repos.ai.najmConversations.listConversations(100)) || [];
    ok(res, { conversations });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/customer-conversations/:id/messages', async (req, res) => {
  try {
    const repos = getRepositories();
    const messages = (await repos.ai.najmConversations.getMessages(req.params.id, 100)) || [];
    ok(res, { messages });
  } catch (error) {
    fail(res, error);
  }
});

router.get('/audits', async (req, res) => {
  try {
    const audits = (await getRecentAudits(100, req.query.action || null)) || [];
    ok(res, { audits });
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
