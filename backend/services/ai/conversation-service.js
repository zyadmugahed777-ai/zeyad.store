const { getRepositories } = require('../../repositories');
const { createProvider } = require('./providers');
const { getSystemInstructions, getKnowledge, getMemory, getProviderSettings } = require('./settings-store');
const { runTool, createOperationalTasks } = require('./tools');
const { ADMIN_TOOL_DEFINITIONS, WRITE_TOOL_NAMES } = require('./admin-tool-definitions');
const { logAiActivity } = require('./activity');

async function listConversations(userId, search = '') {
  return await getRepositories().ai.listConversations(userId, search, 60);
}

async function createConversation(userId, title = 'محادثة جديدة') {
  return await getRepositories().ai.createConversation(title, userId);
}

async function getConversation(id) {
  const repos = getRepositories();
  const conversation = await repos.ai.getConversationById(id);
  if (!conversation) return null;
  conversation.messages = (await repos.ai.getConversationMessages(id)) || [];
  return conversation;
}

async function renameConversation(id, title, userId) {
  await getRepositories().ai.renameConversation(id, title, userId);
  return await getConversation(id);
}

async function deleteConversation(id, userId) {
  await getRepositories().ai.deleteConversation(id, userId);
}

async function clearConversation(id, userId) {
  const repos = getRepositories();
  const row = await repos.ai.getConversationById(id);
  if (row && (!userId || row.created_by === userId)) {
    await repos.ai.clearConversationMessages(id);
  }
}

async function addMessage(conversationId, role, content, metadata = null) {
  return await getRepositories().ai.addMessage(conversationId, role, content, metadata);
}

function selectTools(message) {
  const text = String(message || '').toLowerCase();
  const tools = [];
  if (/مبيعات|sales|revenue|ايراد|إيراد/.test(text)) tools.push(['get_sales_summary', { period: text.includes('اليوم') ? 'today' : '30d' }]);
  if (/أكثر|افضل|أفضل|top|best/.test(text) && /منتج|products/.test(text)) tools.push(['get_top_products', { period: '30d' }]);
  if (/بدون صور|لا تحتوي على صور|missing images|without images/.test(text)) tools.push(['get_products_without_images', {}]);
  if (/بدون سعر|بدون أسعار|missing prices|without prices/.test(text)) tools.push(['get_products_without_prices', {}]);
  if (/طلبات|orders/.test(text)) tools.push(['get_orders', { status: text.includes('الجديدة') ? 'pending' : '', period: '30d' }]);
  if (/مخزون|inventory|stock/.test(text)) tools.push(['get_inventory_summary', {}]);
  if (/seo|محركات البحث|سيو/.test(text)) tools.push(['get_seo_status', {}]);
  if (/أخطاء|اخطاء|errors|health|صحة|افحص/.test(text)) tools.push(['get_system_status', {}], ['get_error_logs', {}]);
  if (/أداء|performance|سرعة/.test(text)) tools.push(['get_page_performance', {}]);
  if (/بحث|search/.test(text)) tools.push(['get_search_statistics', {}]);
  if (/تقرير|brief|ملخص|انتباهي|اليوم|overview|dashboard/.test(text)) tools.push(['get_store_overview', {}]);
  if (tools.length === 0) tools.push(['get_store_overview', {}]);
  return tools;
}

function buildContextBlock(toolResults) {
  return toolResults.map((item) => `Tool: ${item.tool}\nResult JSON: ${JSON.stringify(item.result, null, 2)}`).join('\n\n');
}

function localArabicAnswer(message, toolResults) {
  const overview = toolResults.find((item) => item.tool === 'get_store_overview')?.result;
  const sales = toolResults.find((item) => item.tool === 'get_sales_summary')?.result;
  const top = toolResults.find((item) => item.tool === 'get_top_products')?.result;
  const missingImages = toolResults.find((item) => item.tool === 'get_products_without_images')?.result;
  const missingPrices = toolResults.find((item) => item.tool === 'get_products_without_prices')?.result;

  const lines = ['اعتمدت على بيانات المتجر المتاحة من الأدوات المعتمدة.'];
  if (overview) {
    lines.push('');
    lines.push('| المؤشر | القيمة |');
    lines.push('|---|---:|');
    lines.push(`| مبيعات اليوم | ${Number(overview.todayRevenue).toLocaleString('ar-YE')} ر.ي |`);
    lines.push(`| طلبات اليوم | ${overview.todayOrders} |`);
    lines.push(`| الطلبات المعلقة | ${overview.pendingOrders} |`);
    lines.push(`| المنتجات بدون صور | ${overview.productsWithoutImages} |`);
    lines.push(`| المنتجات بدون أسعار | ${overview.productsWithoutPrices} |`);
    lines.push(`| رسائل غير مقروءة | ${overview.unreadMessages} |`);
  }
  if (sales) {
    lines.push('');
    lines.push(`ملخص المبيعات: ${Number(sales.revenue || 0).toLocaleString('ar-YE')} ر.ي من ${sales.orders_count || 0} طلب خلال الفترة المحددة.`);
  }
  if (top && top.length) {
    lines.push('');
    lines.push('أكثر المنتجات مبيعًا:');
    top.slice(0, 5).forEach((product, index) => {
      lines.push(`${index + 1}. ${product.product_title}: ${product.quantity_sold} قطعة، ${Number(product.revenue || 0).toLocaleString('ar-YE')} ر.ي`);
    });
  }
  if (missingImages && missingImages.length) {
    lines.push('');
    lines.push(`يوجد ${missingImages.length} منتجًا ظاهرًا في العينة بدون صور. أولوية المعالجة: المنتجات النشطة والأعلى سعرًا.`);
  }
  if (missingPrices && missingPrices.length) {
    lines.push('');
    lines.push(`يوجد ${missingPrices.length} منتجًا ظاهرًا في العينة بدون أسعار. لا أنصح بعرضها للعملاء قبل تحديث السعر.`);
  }
  lines.push('');
  lines.push('التوصية التشغيلية: ابدأ بالطلبات المعلقة، ثم المنتجات بدون أسعار، ثم المنتجات بدون صور لأنها تؤثر مباشرة على الثقة والتحويل.');
  return lines.join('\n');
}

/**
 * Admin AI turn.
 *
 * Was: selectTools() matched the user's message against a dozen hardcoded
 * regexes, ran whichever read tools matched, and pasted their JSON into the
 * system prompt. The model never chose a tool, never supplied arguments, and
 * could not reach 21 of the 32 registered tools -- including every write tool.
 * It could describe the store but never act on it, which is what made it a
 * chatbot rather than an administrative employee.
 *
 * Now: the model is given all 32 tool definitions and decides what to call,
 * with real arguments, over up to MAX_TOOL_ROUNDS turns so it can chain (find
 * a product, then propose a price change on it). Every call still goes through
 * runTool(), which enforces hasAiPermission() per tool and writes an audit
 * entry -- authorisation is unchanged and is not something the model can talk
 * its way past. Write tools still return a confirmation proposal instead of
 * applying anything.
 *
 * The regex path is kept as the no-provider fallback only (localArabicAnswer),
 * so the panel still answers usefully when no AI provider is configured.
 */
const MAX_TOOL_ROUNDS = 3;

async function generateChatResponse({ conversationId, message, userId }) {
  let conversation = conversationId ? await getConversation(conversationId) : null;
  if (!conversation) conversation = await createConversation(userId, String(message || '').slice(0, 50) || 'محادثة جديدة');

  await addMessage(conversation.id, 'user', message);

  const providerSettings = await getProviderSettings(true);
  const sysInst = await getSystemInstructions();
  const knw = await getKnowledge();
  const mem = await getMemory();

  const toolContext = { conversationId: conversation.id, userId };
  const executedTools = [];
  const pendingConfirmations = [];
  let content = '';
  let providerUsed = false;

  const hasProviderKey = Boolean(
    providerSettings.apiToken || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_REGION
  );

  const system = [
    sysInst.body,
    '',
    'Store knowledge:',
    JSON.stringify(knw, null, 2),
    '',
    'Administrator memory and business rules:',
    JSON.stringify(mem, null, 2),
    '',
    'قواعد استخدام الأدوات:',
    '- استخدم الأدوات للحصول على بيانات المتجر الحقيقية. لا تخمّن أرقاماً أبداً.',
    '- إذا احتجت معرّف منتج قبل تعديله، ابحث عنه أولاً بـ search_products.',
    '- أدوات التعديل لا تنفّذ التغيير مباشرة: تنشئ طلب تأكيد ينتظر موافقة المدير.',
    '  اذكر ذلك بوضوح ولا تقل إن التغيير تم فعلاً.',
    '- إذا رفضت أداة العمل لعدم وجود صلاحية، أبلغ المدير بذلك بصراحة.',
    '- كن مختصراً وعملياً، واعرض الأرقام في جداول عند المناسبة.'
  ].join('\n');

  if (hasProviderKey) {
    try {
      const provider = createProvider(providerSettings);
      const messages = [{ role: 'user', content: message }];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await provider.complete({
          system,
          messages,
          tools: ADMIN_TOOL_DEFINITIONS
        });
        providerUsed = true;

        const toolCalls = response.toolCalls || [];
        content = response.text || content;

        if (!toolCalls.length) break;

        const roundResults = [];
        for (const call of toolCalls) {
          let result;
          try {
            result = await runTool(call.name, call.arguments || {}, toolContext);
            if (WRITE_TOOL_NAMES.has(call.name) && result && result.confirmationId) {
              pendingConfirmations.push({ tool: call.name, confirmationId: result.confirmationId });
            }
          } catch (err) {
            // Isolate a failing tool the way Najm's loop does: one bad call
            // (missing product, denied permission) must not discard the
            // results already gathered in this same turn.
            result = { success: false, error: err.message };
          }
          executedTools.push(call.name);
          roundResults.push({ tool: call.name, result });
        }

        messages.push({
          role: 'assistant',
          content: response.text || '[استدعاء أدوات]'
        });
        messages.push({
          role: 'user',
          content: 'نتائج الأدوات (بيانات حقيقية من قاعدة البيانات):\n' + buildContextBlock(roundResults)
        });
      }

      // The loop can end on a round that returned tool calls but no prose --
      // either the model kept calling tools right up to MAX_TOOL_ROUNDS, or it
      // answered purely with calls. Without this, content stays empty and the
      // reply silently degrades to the canned local summary even though the
      // provider worked and real data was gathered. Ask once more, with no
      // tools offered, so it has to write the answer.
      if (!content && executedTools.length) {
        const closing = await provider.complete({ system, messages });
        content = closing.text || content;
      }
    } catch (error) {
      const fallbackResults = await runFallbackTools(message, toolContext, executedTools);
      // Do not echo the provider's raw error into the chat. Upstream messages
      // routinely quote the credential back ("Incorrect API key provided:
      // sk-test-******2345"), and this string is rendered straight into the
      // admin panel and persisted in ai_messages. Log the detail server-side;
      // tell the administrator only what they can act on.
      console.error('[Admin AI] provider call failed:', error.message);
      content = `${localArabicAnswer(message, fallbackResults)}\n\nتنبيه: تعذر الاتصال بمزود الذكاء الاصطناعي. تم عرض البيانات من قاعدة البيانات مباشرة. راجع إعدادات المزود في لوحة الإدارة.`;
    }
  }

  if (!content) {
    const fallbackResults = await runFallbackTools(message, toolContext, executedTools);
    content = localArabicAnswer(message, fallbackResults);
  }

  const metadata = { tools: executedTools, providerUsed, pendingConfirmations };
  await addMessage(conversation.id, 'assistant', content, metadata);
  try {
    await logAiActivity({
      userId,
      action: 'Generated assistant response',
      toolName: executedTools.join(','),
      affectedType: 'conversation',
      affectedId: conversation.id,
      result: 'success'
    });
  } catch (_) {}

  if (/تقرير|brief|ملخص|انتباهي|اليوم/.test(String(message || '').toLowerCase())) {
    await createOperationalTasks();
  }

  return { conversationId: conversation.id, content, metadata };
}

/**
 * No-provider fallback: the original regex tool selection, used only to build
 * a useful local answer when the AI provider is unreachable or unconfigured.
 */
async function runFallbackTools(message, toolContext, executedTools) {
  const results = [];
  for (const [toolName, args] of selectTools(message)) {
    try {
      const res = await runTool(toolName, args, toolContext);
      results.push({ tool: toolName, result: res });
      executedTools.push(toolName);
    } catch (_) { /* a denied or failing read tool must not break the fallback */ }
  }
  return results;
}

async function getDailyBriefing() {
  const overview = await runTool('get_store_overview', {});
  const topProducts = (await runTool('get_top_products', { period: '30d', limit: 3 })) || [];
  const tasks = (await createOperationalTasks()) || [];
  return {
    title: 'GOOD MORNING',
    overview,
    priorities: tasks.filter((task) => task.status === 'open').slice(0, 5),
    recommendation: topProducts.length
      ? `أعلى منتج مبيعًا خلال آخر 30 يومًا هو ${topProducts[0].product_title}.`
      : 'لا توجد مبيعات كافية لاستخراج توصية منتج بعد.'
  };
}

module.exports = {
  listConversations,
  createConversation,
  getConversation,
  renameConversation,
  deleteConversation,
  clearConversation,
  addMessage,
  generateChatResponse,
  getDailyBriefing
};
