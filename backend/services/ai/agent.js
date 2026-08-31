require('dotenv').config();
const { getRepositories } = require('../../repositories');
const { createProvider } = require('./providers');
const { getNajmSettings, getNajmInstructions } = require('./najm-settings-store');
const { customerToolsDefinitions, executeCustomerTool } = require('./customer-tools');
const { searchProductsHybrid, getFeaturedRecommendations, normalizeArabicText } = require('./hybrid-search');
const { logActionAudit } = require('./audit-service');

async function buildStoreContext() {
  const repos = getRepositories();
  const settings = await repos.settings.findByKeys(['site_name', 'contact_phone', 'contact_whatsapp', 'contact_email', 'contact_address', 'payment_methods', 'shipping_methods', 'exchange_rate']);
  const contactInfo = Object.fromEntries((settings || []).map(s => [s.key, s.value || '']));

  return {
    storeName: contactInfo.site_name || 'زياد ستور',
    contact: contactInfo
  };
}

function sanitizeUserPrompt(text) {
  if (!text) return '';
  return String(text)
    .slice(0, 1200)
    .replace(/[<>]/g, '')
    .trim();
}

function outputSanitizer(text) {
  if (!text) return '';
  return text
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_SECRET]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, '[REDACTED_TOKEN]')
    .replace(/\/home\/[a-zA-Z0-9_\-\.\/]+/g, '[REDACTED_PATH]')
    .replace(/[a-zA-Z]:\\[a-zA-Z0-9_\-\.\\]+/g, '[REDACTED_PATH]');
}

function buildDynamicStatePrompt(state = {}, liveCart = null, storeContext) {
  const lines = [];
  lines.push('==================================================');
  lines.push('سياق المحادثة والذاكرة الحية (LIVE CONVERSATION CONTEXT & STATE):');

  if (state.last_category) {
    lines.push(`- آخر فئة/قسم تم التحدث عنه: "${state.last_category}" (إذا سأل العميل "أرخص" أو "لون أبيض" أو "خيارات أخرى"، فإنه يقصد هذه الفئة)`);
  }
  if (state.last_search_query) {
    lines.push(`- آخر استعلام بحث: "${state.last_search_query}"`);
  }
  if (state.last_products && state.last_products.length > 0) {
    lines.push(`- آخر منتجات تم عرضها للعميل:`);
    state.last_products.slice(0, 5).forEach((p, idx) => {
      lines.push(`  ${idx + 1}. [معرف: ${p.product_id || p.id}] "${p.title}" | السعر: ${p.priceFormatted || p.price + ' ر.ي'} | المخزون: ${p.stockStatusAr || p.stockStatus || p.stock_status || 'متوفر'}`);
    });
  }
  if (state.selected_product) {
    lines.push(`- المنتج المركز عليه حالياً: [معرف: ${state.selected_product.product_id || state.selected_product.id}] "${state.selected_product.title}"`);
  }

  if (liveCart && liveCart.items && liveCart.items.length > 0) {
    lines.push(`- سلة التسوق الحية للعميل حالياً (${liveCart.count} قطع — الإجمالي: ${liveCart.formattedSubtotal}):`);
    liveCart.items.forEach((item, idx) => {
      lines.push(`  * [معرف: ${item.code || item.id}] "${item.title}" × ${item.quantity} = ${item.formattedTotalPrice}`);
    });
  } else {
    lines.push('- سلة التسوق الحالية للعميل: فارغة');
  }

  if (state.customer_preferences && Object.keys(state.customer_preferences).length > 0) {
    lines.push(`- تفضيلات العميل السابقة: ${JSON.stringify(state.customer_preferences)}`);
  }
  lines.push('==================================================');
  return lines.join('\n');
}

async function runNajmAgent({
  message,
  sessionId,
  guestId = null,
  userId = null,
  image = null,
  history = [],
  state = {},
  ipAddress = null
}) {
  const cleanPrompt = sanitizeUserPrompt(message);
  const najmSettings = await getNajmSettings(true);
  const najmInstructions = await getNajmInstructions();
  const storeContext = await buildStoreContext();
  const context = { sessionId, guestId, userId, ipAddress };

  // Fetch Live Cart for instant contextual awareness
  let liveCart = null;
  try {
    liveCart = await executeCustomerTool('get_cart', {}, context);
  } catch (_) {}

  // Initialize working state
  const currentState = {
    last_category: state.last_category || null,
    last_search_query: state.last_search_query || null,
    last_products: Array.isArray(state.last_products) ? state.last_products : [],
    selected_product: state.selected_product || null,
    customer_preferences: state.customer_preferences || {}
  };

  console.log(`\n[Najm] ========================================`);
  console.log(`[Najm] Customer request: "${cleanPrompt.slice(0, 80)}"`);
  console.log(`[Najm] Session: ${sessionId} | Current Category in Memory: ${currentState.last_category || 'None'}`);
  console.log(`[Najm] Loaded Database Settings:`);
  console.log(`[Najm]   - Provider:   ${najmSettings.provider}`);
  console.log(`[Najm]   - Model:      ${najmSettings.model}`);
  console.log(`[Najm]   - Base URL:   ${najmSettings.apiBaseUrl || 'Default'}`);
  // "Missing" used to cover two very different states: no token configured at
  // all, and a token that is stored but cannot be decrypted because the
  // encryption key changed under it. Distinguishing them is the difference
  // between "go set it up" and "the stored value is unrecoverable, re-enter it".
  console.log(`[Najm]   - Token:      ${najmSettings.apiToken
    ? `Present (${najmSettings.apiToken.length} chars)`
    : (najmSettings.tokenStoredButUndecryptable
        ? 'STORED BUT UNDECRYPTABLE -- re-enter it in the admin panel'
        : 'Not configured')}`);
  console.log(`[Najm]   - Tools:      ${najmSettings.enableTools ? 'Enabled' : 'Disabled'}`);
  console.log(`[Najm]   - Vision:     ${najmSettings.enableVision ? 'Enabled' : 'Disabled'}`);
  console.log(`[Najm]   - Active:     ${najmSettings.isActive ? 'Yes' : 'No'}`);

  const dynamicContextPrompt = buildDynamicStatePrompt(currentState, liveCart, storeContext);

  const fullSystemPrompt = [
    najmInstructions.full_prompt || najmInstructions.core_instructions || 'أنت نجم، مساعد ومستشار المبيعات الحصري لمتجر زياد ستور.',
    '',
    `بيانات ومعلومات المتجر الرسمية:`,
    `- اسم المتجر: ${storeContext.storeName}`,
    `- واتساب التواصل: ${storeContext.contact.contact_whatsapp || '777000000'}`,
    `- رقم الهاتف: ${storeContext.contact.contact_phone || '01-234567'}`,
    `- العنوان: ${storeContext.contact.contact_address || 'صنعاء، اليمن'}`,
    `- طرق الدفع: نقداً عند الاستلام، الكريمي، المحافظ الإلكترونية.`,
    '',
    dynamicContextPrompt,
    '',
    'تذكر دائماً القواعد الجوهرية:',
    '1. أنت موظف مبيعات حقيقي فاخر وبشوش، تتحدث بعربية فصيحة أنيقة مع لمسة يمنية لطيفة مهذبة ("أبشر"، "من عيوني"، "حياك الله").',
    '2. عند البحث أو السؤال عن منتجات، استدعِ search_products دائماً ولا تختلق أسعاراً أو منتجات.',
    '3. إذا سأل العميل "أرخص" أو "الأرخص" أو "اقل سعر"، استدعِ search_products مع الفئة السابقة و sort_by: "cheapest" أو استخدم المنتجات السابقة.',
    '4. إذا قال العميل "أضفها للسلة" أو "أريد هذه" أو "ضيفها"، استدعِ add_to_cart بالمنتج الأخير الذي تم الحديث عنه.',
    '5. إذا قال العميل "خليها اثنتين" أو "خلها 2"، استدعِ update_cart بالمنتج الأخير المحدد.',
    '6. إذا سأل "ما الموجود في سلتي؟" أو "كم الحساب؟"، استدعِ get_cart واعرض تفاصيل السلة والإجمالي الحقيقي.',
    // Added after observing the real failure: "ابغى ثلاجة" produced four
    // qualifying questions (budget, capacity, style, brand) and zero products,
    // while the more imperative "ورني ثلاجات" searched correctly. A salesperson
    // shows options first and refines afterwards; asking a battery of questions
    // before showing anything is exactly the "talks too much" behaviour the
    // persona is supposed to avoid.
    '7. إذا ذكر العميل نوع منتج (ثلاجة، غسالة، مكيف، غرفة نوم، مجلس، مطبخ...) فابحث فوراً بـ search_products واعرض له النتائج الحقيقية.',
    '   لا تسأله عن الميزانية أو المقاس أو الماركة قبل أن تعرض له شيئاً. اعرض أولاً، ثم اسأل سؤالاً واحداً فقط لتضييق الخيارات إن لزم.',
    '8. كن مختصراً: جملة ترحيب قصيرة، ثم المنتجات، ثم سؤال واحد على الأكثر. لا تكتب قوائم طويلة من الأسئلة.'
  ].join('\n');

  let collectedProducts = [];
  let collectedDraftOrder = null;
  let collectedTicket = null;
  let collectedTracking = null;
  let providerUsed = false;
  let finalAnswer = '';

  const hasProviderKey = Boolean(najmSettings.apiToken || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE);

  if (hasProviderKey && najmSettings.isActive) {
    try {
      console.log(`[Najm] Calling AI provider (${najmSettings.provider})...`);
      const provider = createProvider(najmSettings);
      const initialMessages = [...history.slice(-6)];
      const userMessage = { role: 'user', content: cleanPrompt || (image ? 'حلل هذه الصورة واقترح منتجات تناسبها من المتجر' : 'مرحبا') };
      initialMessages.push(userMessage);

      // Step 1: LLM Request with Tools
      const response = await provider.complete({
        system: fullSystemPrompt,
        messages: initialMessages,
        tools: najmSettings.enableTools ? customerToolsDefinitions : null,
        image: najmSettings.enableVision ? image : null
      });

      providerUsed = true;
      console.log(`[Najm] Provider Turn 1 response received.`);
      let modelText = response.text || '';
      const toolCalls = response.toolCalls || [];

      // Step 2: Execute Tool Calls
      if (toolCalls.length > 0) {
        console.log(`[Najm] Model invoked ${toolCalls.length} tool(s): ${toolCalls.map(t => t.name).join(', ')}`);
        const toolExecutionResults = [];

        for (const tc of toolCalls) {
          console.log(`[Najm] Executing tool: ${tc.name} with args:`, tc.arguments);
          let toolResult;
          try {
            toolResult = await executeCustomerTool(tc.name, tc.arguments, context);
          } catch (toolErr) {
            // One failing tool (e.g. a deleted product id in get_product)
            // used to abort this entire for-loop, discarding results
            // already collected from earlier tool calls in the same model
            // turn and falling all the way back to the generic
            // no-provider response. Isolate it instead so the remaining
            // tool calls -- and whatever this one partially gathered --
            // still make it into the final answer.
            console.error(`[Najm] Tool "${tc.name}" failed:`, toolErr.message);
            toolResult = { success: false, error: 'تعذر تنفيذ هذا الإجراء حالياً.' };
          }

          if (tc.name === 'search_products' || tc.name === 'get_recommendations' || tc.name === 'get_related_products') {
            if (toolResult.products && toolResult.products.length > 0) {
              collectedProducts.push(...toolResult.products);
              currentState.last_products = toolResult.products.slice(0, 8);
              currentState.selected_product = toolResult.products[0];
              if (tc.arguments.category) currentState.last_category = tc.arguments.category;
              if (tc.arguments.query) currentState.last_search_query = tc.arguments.query;
            }
          } else if (tc.name === 'get_product' || tc.name === 'get_product_details') {
            if (toolResult.product) {
              collectedProducts.push(toolResult.product);
              currentState.selected_product = toolResult.product;
              if (toolResult.product.category_slug) currentState.last_category = toolResult.product.category_slug;
            }
          } else if (tc.name === 'create_order_request' || tc.name === 'prepare_order_draft') {
            if (toolResult.success) collectedDraftOrder = toolResult;
          } else if (tc.name === 'create_customer_request') {
            if (toolResult.success) collectedTicket = toolResult;
          } else if (tc.name === 'get_order_status' || tc.name === 'track_order') {
            if (toolResult.success) collectedTracking = toolResult;
          } else if (tc.name === 'add_to_cart' || tc.name === 'update_cart') {
            if (toolResult.product) {
              currentState.selected_product = toolResult.product;
            }
          } else if (tc.name === 'get_cart' && toolResult.items) {
            collectedProducts.push(...toolResult.items.map(i => ({
              id: i.id,
              product_id: i.code || i.id,
              title: i.title,
              price: i.unitPrice || i.price,
              priceFormatted: i.formattedUnitPrice || i.priceFormatted,
              main_image: i.mainImage,
              url: `product.html?id=${i.code || i.id}`
            })));
          }

          toolExecutionResults.push({
            tool_call_id: tc.id,
            name: tc.name,
            result: toolResult
          });
        }

        // Step 3: Turn 2 — Send tool results back to model for synthesis
        try {
          console.log(`[Najm] Sending tool results to model for natural response synthesis...`);
          const turn2Messages = [...initialMessages];
          if (response.rawChoice) {
            turn2Messages.push(response.rawChoice);
          } else {
            turn2Messages.push({
              role: 'assistant',
              content: response.text || null,
              tool_calls: response.raw?.choices?.[0]?.message?.tool_calls || toolCalls.map(t => ({
                id: t.id,
                type: 'function',
                function: { name: t.name, arguments: JSON.stringify(t.arguments) }
              }))
            });
          }

          for (const ter of toolExecutionResults) {
            turn2Messages.push({
              role: 'tool',
              tool_call_id: ter.tool_call_id,
              name: ter.name,
              content: JSON.stringify(ter.result)
            });
          }

          const turn2Response = await provider.complete({
            system: fullSystemPrompt,
            messages: turn2Messages,
            tools: null
          });

          if (turn2Response.text && turn2Response.text.trim().length > 0) {
            modelText = turn2Response.text.trim();
            console.log(`[Najm] Model generated synthesized final answer.`);
          }
        } catch (turn2Err) {
          console.warn(`[Najm Turn 2 Synthesis Warning]:`, turn2Err.message);
          if (!modelText) {
            modelText = toolExecutionResults.map(r => r.result.message || r.result.error || '').filter(Boolean).join('\n\n');
          }
        }
      }

      finalAnswer = modelText;
    } catch (err) {
      console.error('[Najm Agent Provider Error]:', err.message);
    }
  } else {
    console.log(`[Najm] AI provider skipped (isActive: ${najmSettings.isActive}, hasKey: ${hasProviderKey}). Using local database search.`);
  }

  // Fallback: Intelligent local database response if provider was unavailable or empty
  if (!finalAnswer) {
    console.log('[Najm] Generating intelligent fallback response from database...');
    const isImageQuery = Boolean(image);
    const searchQuery = cleanPrompt || (isImageQuery ? 'أثاث مجلس غرفة نوم أجهزة' : '');
    
    if (/طلب|تتبع|وين وصل|ZFB-/i.test(cleanPrompt)) {
      const orderMatch = cleanPrompt.match(/ZFB-[\w-]+|\d{4,}/);
      if (orderMatch) {
        const trk = await executeCustomerTool('track_order', { order_id: orderMatch[0] }, context);
        if (trk.success) {
          finalAnswer = `حالة طلبك (${trk.orderId}): ${trk.statusAr}. الإجمالي: ${trk.totalFormatted}. المنتجات: ${trk.items.join(', ')}.`;
          collectedTracking = trk;
        } else {
          finalAnswer = trk.error || 'يرجى تزويدي برقم الطلب ورقم الهاتف المسجل لمتابعة حالته بدقة.';
        }
      } else {
        finalAnswer = 'لمتابعة طلبك، يرجى كتابة رقم الطلب (مثال: ZFB-2026-1234) ورقم الهاتف المسجل.';
      }
    } else if (/سلة|سلتي|كم الحساب|المجموع/i.test(cleanPrompt)) {
      const cartRes = await executeCustomerTool('get_cart', {}, context);
      if (cartRes.count > 0) {
        finalAnswer = `سلتك تحتوي على (${cartRes.count}) منتج بإجمالي ${cartRes.formattedSubtotal}. يمكنك تأكيد الطلب أو استعراض السلة.`;
        if (cartRes.items) {
          collectedProducts.push(...cartRes.items.map(i => ({
            id: i.id,
            product_id: i.code || i.id,
            title: i.title,
            price: i.unitPrice,
            priceFormatted: i.formattedUnitPrice,
            main_image: i.mainImage,
            url: `product.html?id=${i.code || i.id}`
          })));
        }
      } else {
        finalAnswer = 'سلة التسوق فارغة حالياً. هل ترغب في استعراض أحدث العروض والمنتجات المميزة؟';
      }
    } else if (/سياسة|ضمان|شحن|توصيل|دفع|فرع|فروع/i.test(cleanPrompt)) {
      const storeInfo = await executeCustomerTool('get_store_information', {}, context);
      finalAnswer = `متجر ${storeInfo.storeName}: نوفر توصيلاً سريعاً في صنعاء والمحافظات مع ضمان شامل 12-24 شهراً. طرق الدفع المتاحة: ${storeInfo.paymentMethods}.`;
    } else {
      // Local product search with category relevance
      const found = (await searchProductsHybrid({
        query: searchQuery,
        categorySlug: currentState.last_category,
        limit: 8
      })) || [];
      collectedProducts = Array.isArray(found) ? found : [];
      if (collectedProducts.length > 0) {
        currentState.last_products = collectedProducts;
        currentState.selected_product = collectedProducts[0];
        if (isImageQuery) {
          finalAnswer = `قمت بتحليل الصورة، ووجدت لك هذه المنتجات المتناسقة في كتالوج متجر زياد:`;
        } else {
          finalAnswer = `وجدت لك هذه الخيارات المتميزة في متجر زياد ستور:`;
        }
      } else {
        finalAnswer = `أهلاً بك! أنا نجم، مستشارك الذكي في متجر زياد ستور. يمكنك البحث عن أي منتج (غرف نوم، مجالس، أجهزة، طاقة شمسية) وسأساعدك فوراً.`;
      }
    }
  }

  // Deduplicate products
  const seenPids = new Set();
  const uniqueProducts = [];
  for (const p of collectedProducts) {
    const pid = p.product_id || p.id;
    if (pid && !seenPids.has(pid)) {
      seenPids.add(pid);
      uniqueProducts.push(p);
    }
  }

  // Generate dynamic contextual quick action chips
  let quickActions = [];
  if (uniqueProducts.length > 0) {
    quickActions = [
      { label: '💰 الأرخص', prompt: 'اعرض لي أرخص خيار من هذه المنتجات' },
      { label: '⭐ الأعلى تقييمًا', prompt: 'ما هو الخيار الأعلى تقييماً؟' },
      { label: '🛒 عرض السلة', prompt: 'ما الموجود في سلتي؟' },
      { label: '🚚 الشحن والضمان', prompt: 'ما هي مواعيد الشحن وشروط الضمان؟' }
    ];
  } else if (collectedDraftOrder || (liveCart && liveCart.count > 0)) {
    quickActions = [
      { label: '📋 تأكيد الطلب', prompt: 'أريد إتمام الطلب الآن' },
      { label: '🛒 عرض السلة', prompt: 'ما الموجود في سلتي؟' },
      { label: '💳 طرق الدفع', prompt: 'ما هي طرق الدفع المتاحة؟' },
      { label: '🛍️ تصفح المزيد', prompt: 'ما هي العروض الأخرى المتاحة اليوم؟' }
    ];
  } else if (collectedTracking) {
    quickActions = [
      { label: '🚚 موعد الوصول', prompt: 'متى المتوقع أن يصل طلبي؟' },
      { label: '🎧 خدمة العملاء', prompt: 'أريد التحدث مع خدمة العملاء بخصوص طلبي' },
      { label: '🛍️ تصفح المتجر', prompt: 'اعرض لي المنتجات المميزة' }
    ];
  } else {
    quickActions = [
      { label: '📦 حالة الطلب', prompt: 'أين طلبي؟ وكيف أعرف حالته؟' },
      { label: '🎁 أفضل العروض', prompt: 'اقترح لي أفضل العروض والخصومات اليوم' },
      { label: '🛋️ غرف نوم ومجالس', prompt: 'ما هي خيارات غرف النوم والمجالس المتوفرة؟' },
      { label: '⚡ طاقة شمسية', prompt: 'أريد منظومة طاقة شمسية مناسبة' }
    ];
  }

  console.log(`[Najm] Response complete. Products: ${uniqueProducts.length}, Provider used: ${providerUsed}`);
  console.log(`[Najm] ========================================\n`);

  return {
    success: true,
    answer: outputSanitizer(finalAnswer),
    products: uniqueProducts.slice(0, 8),
    draftOrder: collectedDraftOrder,
    supportTicket: collectedTicket,
    tracking: collectedTracking,
    quickActions,
    state: currentState,
    providerUsed
  };
}

module.exports = {
  runNajmAgent,
  sanitizeUserPrompt,
  outputSanitizer
};
