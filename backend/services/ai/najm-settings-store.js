const { getRepositories } = require('../../repositories');
const { encryptSecret, decryptSecret, maskSecret, tokenHint } = require('./crypto');
const { PROVIDERS } = require('./defaults');
const { createProvider } = require('./providers');

const DEFAULT_NAJM_SECTIONS = {
  agent_identity: `أنت "نجم"، المستشار التجاري ومساعد المبيعات الذكي الرسمي لمتجر زياد ستور (Zeyad Store) — المنصة الرائدة للأثاث والمجالس والأجهزة المنزلية وحلول الطاقة الشمسية في اليمن.`,
  core_instructions: `- مهمتك تقديم تجربة تسوق فخمة، سلسة، موثوقة ومبنية على البيانات الحقيقية فقط.
- استخدم أدوات المتجر (Store Tools) لجلب المنتجات والأسعار والتوصيات وإدارة السلة والتحقق من حالة الطلبات.
- لا تخترع منتجات أو أسعاراً أو مخزوناً أو حالات طلبات غير موجودة في قاعدة البيانات مطلقاً (REAL DATA > GUESS).
- اطرح أسئلة توضيحية ذكية إذا كانت تفاصيل طلب العميل غير كافية (الميزانية، المساحة، الألوان المفضلة).`,
  tone_and_style: `أسلوب عربي فصيح، دافئ، مهذب، واثق ومباشر، يعكس أصالة وكرم الضيافة والاحترافية العالية. تجنب الردود الآلية الجافة.`,
  sales_policy: `- ركز على تقديم القيمة وحل مشكلة العميل (مساحة الغرفة، التوافق، كفاءة الطاقة).
- اقترح منتجات بديلة عند نفاد الكمية، واقترح ملحقات مكملة متوافقة عند اختيار منتج أساسي.`,
  pricing_policy: `- الأسعار تؤخذ حصراً من قاعدة البيانات بالريال اليمني (ر.ي) أو الريال السعودي (ر.س).
- لا تخترع أسعاراً أو خصومات غير مسجلة رسمياً في النظام.`,
  orders_and_reservation_policy: `- عند رغبة العميل بالشراء، أضف المنتج إلى السلة مباشرة أو جهز مسودة طلب للشراء.
- اعرض تفاصيل الطلب والإجمالي واطلب تأكيد العميل الصريح قبل تثبيت الطلب النهائي في النظام.`,
  human_handoff_policy: `- إذا واجه العميل طلباً خاصاً، أو رغب بمنتج غير متوفر، أو احتاج تدخلاً بشرياً، اعرض إنشاء طلب متابعة للإدارة فوراً (Customer Request).
- اطلب اسم العميل ورقم هاتفه وسجل التذكرة في النظام وزوده برقم المتابعة المعتمد.`,
  tool_rules: `- استدعِ الأداة المناسبة فوراً بناءً على قصد العميل (search_products, get_product, add_to_cart, track_order, create_customer_request).
- لا تدّعِ تنفيذ العملية إلا بعد نجاحها الفعلي في Backend.`,
  vision_rules: `- عند استلام صورة من العميل، حلل محتوياتها بدقة (نوع الأثاث، النمط، الألوان، المساحة) وابحث في كتالوج المتجر عن المنتجات المطابقة أو الأقرب تناسقاً.`
};

function compileFullPrompt(sections) {
  return [
    `# هوية الوكيل (Agent Identity)`,
    sections.agent_identity || DEFAULT_NAJM_SECTIONS.agent_identity,
    ``,
    `# التعليمات الأساسية (Core Instructions)`,
    sections.core_instructions || DEFAULT_NAJM_SECTIONS.core_instructions,
    ``,
    `# أسلوب الحديث (Tone & Style)`,
    sections.tone_and_style || DEFAULT_NAJM_SECTIONS.tone_and_style,
    ``,
    `# سياسة المبيعات والتوصيات (Sales & Recommendations Policy)`,
    sections.sales_policy || DEFAULT_NAJM_SECTIONS.sales_policy,
    ``,
    `# سياسة الأسعار والعملات (Pricing Policy)`,
    sections.pricing_policy || DEFAULT_NAJM_SECTIONS.pricing_policy,
    ``,
    `# سياسة الطلبات والحجز (Orders & Reservation Policy)`,
    sections.orders_and_reservation_policy || DEFAULT_NAJM_SECTIONS.orders_and_reservation_policy,
    ``,
    `# سياسة التحويل للموظف البشري (Human Handoff Policy)`,
    sections.human_handoff_policy || DEFAULT_NAJM_SECTIONS.human_handoff_policy,
    ``,
    `# قواعد استخدام أدوات المتجر (Store Tool Rules)`,
    sections.tool_rules || DEFAULT_NAJM_SECTIONS.tool_rules,
    ``,
    `# قواعد التعامل مع الصور (Vision Rules)`,
    sections.vision_rules || DEFAULT_NAJM_SECTIONS.vision_rules
  ].join('\n');
}

function normalizeNajmSettings(row, includeSecret = false) {
  if (!row) {
    return {
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet',
      apiBaseUrl: '',
      apiToken: '',
      maskedToken: '',
      temperature: 0.3,
      maxTokens: 2048,
      requestTimeout: 30,
      enableVision: true,
      enableTools: true,
      isActive: true
    };
  }

  const token = includeSecret ? decryptSecret(row.encrypted_api_token) : '';
  // A stored-but-undecryptable token is not the same as an unconfigured one.
  const tokenStoredButUndecryptable = Boolean(row.encrypted_api_token) && includeSecret && !token;
  return {
    provider: row.provider || 'openrouter',
    model: row.model || 'anthropic/claude-3.5-sonnet',
    apiBaseUrl: row.api_base_url || '',
    apiToken: token,
    tokenStoredButUndecryptable,
    maskedToken: row.token_hint ? maskSecret('', row.token_hint) : '',
    temperature: Number(row.temperature ?? 0.3),
    maxTokens: Number(row.max_tokens ?? 2048),
    requestTimeout: Number(row.request_timeout ?? 30),
    enableVision: row.enable_vision !== undefined ? Boolean(row.enable_vision) : true,
    enableTools: row.enable_tools !== undefined ? Boolean(row.enable_tools) : true,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    updatedAt: row.updated_at
  };
}

async function getNajmSettings(includeSecret = false) {
  const row = await getRepositories().ai.getNajmSettings();
  return normalizeNajmSettings(row, includeSecret);
}

async function saveNajmSettings(input, adminId) {
  const repos = getRepositories();
  const current = await repos.ai.getNajmSettings();
  const providerIds = PROVIDERS.map((p) => p.id);
  const provider = providerIds.includes(input.provider) ? input.provider : (current?.provider || 'openrouter');

  const hasNewToken = input.apiToken && !input.apiToken.includes('••');
  const encryptedToken = hasNewToken ? encryptSecret(input.apiToken) : current?.encrypted_api_token;
  const hint = hasNewToken ? tokenHint(input.apiToken) : current?.token_hint;

  await repos.ai.saveNajmSettings({
    provider,
    model: String(input.model || current?.model || 'anthropic/claude-3.5-sonnet').trim(),
    api_base_url: String(input.apiBaseUrl || '').trim(),
    encrypted_api_token: encryptedToken,
    token_hint: hint,
    temperature: Number(input.temperature ?? current?.temperature ?? 0.3),
    max_tokens: Number(input.maxTokens ?? current?.max_tokens ?? 2048),
    request_timeout: Number(input.requestTimeout ?? current?.request_timeout ?? 30),
    enable_vision: input.enableVision !== undefined ? (input.enableVision ? 1 : 0) : (current?.enable_vision ?? 1),
    enable_tools: input.enableTools !== undefined ? (input.enableTools ? 1 : 0) : (current?.enable_tools ?? 1),
    is_active: input.isActive !== undefined ? (input.isActive ? 1 : 0) : (current?.is_active ?? 1),
    updated_by: adminId || null
  });

  return await getNajmSettings(false);
}

async function getNajmInstructions() {
  const repos = getRepositories();
  let row = await repos.ai.getActiveNajmInstructions();
  if (!row) {
    const full = compileFullPrompt(DEFAULT_NAJM_SECTIONS);
    await repos.ai.insertNajmInstructions(DEFAULT_NAJM_SECTIONS, full, 1, null);
    row = await repos.ai.getActiveNajmInstructions();
  }
  return row;
}

async function saveNajmInstructions(sections, adminId) {
  const repos = getRepositories();
  const currentMax = await repos.ai.getMaxNajmInstructionVersion();
  const version = (Number(currentMax) || 0) + 1;
  const fullPrompt = compileFullPrompt(sections);

  await repos.tx.run(async (client) => {
    const txRepos = getRepositories(null, client);
    await txRepos.ai.deactivateAllNajmInstructions();
    await txRepos.ai.insertNajmInstructions(sections, fullPrompt, version, adminId || null);
  });

  return await getNajmInstructions();
}

async function resetNajmInstructions(adminId) {
  return await saveNajmInstructions(DEFAULT_NAJM_SECTIONS, adminId);
}

async function testNajmConnection(overrideSettings = null) {
  const currentSettings = await getNajmSettings(true);
  const settings = overrideSettings
    ? { ...currentSettings, ...overrideSettings }
    : currentSettings;

  if (overrideSettings?.apiToken && !overrideSettings.apiToken.includes('••')) {
    settings.apiToken = overrideSettings.apiToken;
  }

  const startTime = Date.now();
  try {
    const provider = createProvider(settings);
    const result = await provider.test();
    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      ok: true,
      provider: settings.provider,
      model: settings.model,
      latencyMs,
      message: result.message || `تم الاتصال بنجاح (${latencyMs}ms)`
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    let sanitizedError = String(error.message || 'فشل الاتصال بالمزود')
      .replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_SECRET]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, '[REDACTED_TOKEN]');

    return {
      success: false,
      ok: false,
      provider: settings.provider,
      model: settings.model,
      latencyMs,
      error: sanitizedError
    };
  }
}

module.exports = {
  DEFAULT_NAJM_SECTIONS,
  getNajmSettings,
  saveNajmSettings,
  getNajmInstructions,
  saveNajmInstructions,
  resetNajmInstructions,
  testNajmConnection
};
