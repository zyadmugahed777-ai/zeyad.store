const router = require('express').Router();
const { getProviderSettings, getSystemInstructions, getKnowledge, getMemory } = require('../../services/ai/settings-store');
const { getAiPermissions } = require('../../services/ai/permissions');
const { getAiActivity } = require('../../services/ai/activity');
const { getDailyBriefing, listConversations } = require('../../services/ai/conversation-service');
const { createOperationalTasks, getSalesSummary, getTopProducts, getInventorySummary, getWebsiteStatistics, getSeoStatus, getPagePerformance, getSystemStatus } = require('../../services/ai/tools');
const { PROVIDERS, DEFAULT_SYSTEM_INSTRUCTIONS, NAJM_CUSTOMER_DEFAULT_INSTRUCTIONS } = require('../../services/ai/defaults');
const { listCustomerRequests } = require('../../services/ai/customer-requests');
const { getRecentAudits } = require('../../services/ai/audit-service');
const { getRepositories } = require('../../repositories');

function renderPage(view) {
  return async (req, res, next) => {
    try {
      const repos = getRepositories();
      const period = req.query.period || '30d';

      // Customer stats
      const totalConversations = (await repos.ai.najmConversations.countTotal()) || 0;
      const totalRequests = (await repos.ai.najmRequests.countTotal()) || 0;
      const pendingRequests = (await repos.ai.najmRequests.countByStatus('pending')) || 0;
      const assistedOrders = (await repos.ai.audit.countActionAudits('confirm_order', 'success')) || 0;

      const customerRequests = (await listCustomerRequests({ limit: 100 })) || [];
      const customerConversations = (await repos.ai.najmConversations.listConversations(50)) || [];
      const actionAudits = (await getRecentAudits(80)) || [];

      res.render('admin/ai-employee/index', {
        title: pageTitle(view),
        active: 'ai-employee',
        view,
        providers: PROVIDERS,
        settings: (await getProviderSettings(false)) || {},
        systemInstructions: (await getSystemInstructions()) || {},
        defaultSystemInstructions: DEFAULT_SYSTEM_INSTRUCTIONS,
        customerInstructions: NAJM_CUSTOMER_DEFAULT_INSTRUCTIONS,
        knowledge: (await getKnowledge()) || [],
        memory: (await getMemory()) || [],
        permissions: (await getAiPermissions()) || {},
        activity: (await getAiActivity(80)) || [],
        customerRequests,
        customerConversations,
        actionAudits,
        customerStats: {
          totalConversations,
          totalRequests,
          pendingRequests,
          assistedOrders,
          conversionRate: totalConversations > 0 ? ((assistedOrders / totalConversations) * 100).toFixed(1) + '%' : '0%'
        },
        briefing: (await getDailyBriefing()) || {},
        conversations: (await listConversations(req.session?.admin?.id)) || [],
        tasks: (await createOperationalTasks()) || [],
        insights: {
          sales: (await getSalesSummary({ period })) || {},
          products: (await getTopProducts({ period })) || [],
          inventory: (await getInventorySummary()) || {},
          website: (await getWebsiteStatistics()) || {},
          seo: (await getSeoStatus()) || {},
          performance: getPagePerformance(),
          system: (await getSystemStatus()) || {}
        },
        period
      });
    } catch (error) {
      next(error);
    }
  };
}

function pageTitle(view) {
  const titles = {
    home: 'نجم AI — لوحة التحكم',
    overview: 'نجم AI — نظرة عامة',
    requests: 'طلبات العملاء (Human Handoff)',
    conversations: 'محادثات العملاء',
    audits: 'سجل العمليات الحساسة (Audit Log)',
    insights: 'الرؤى والتحليلات',
    tasks: 'مهام المتجر',
    activity: 'سجل النشاط الإداري',
    settings: 'إعدادات مزود الذكاء الاصطناعي',
    knowledge: 'قاعدة المعرفة والسياسات',
    permissions: 'صلاحيات الأدوات'
  };
  return titles[view] || 'نجم AI — لوحة التحكم';
}

router.get('/', renderPage('home'));
router.get('/overview', renderPage('overview'));
router.get('/requests', renderPage('requests'));
router.get('/customer-conversations', renderPage('conversations'));
router.get('/audits', renderPage('audits'));
router.get('/insights', renderPage('insights'));
router.get('/tasks', renderPage('tasks'));
router.get('/activity', renderPage('activity'));
router.get('/settings', renderPage('settings'));
router.get('/knowledge', renderPage('knowledge'));
router.get('/permissions', renderPage('permissions'));

module.exports = router;

