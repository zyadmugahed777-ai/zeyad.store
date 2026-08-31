const router = require('express').Router();
const { runNajmAgent } = require('../../services/ai/agent');
const { upload, processAndSaveImage } = require('../../services/ai/image-service');
const { getFeaturedRecommendations } = require('../../services/ai/hybrid-search');
const { createCustomerRequest } = require('../../services/ai/customer-requests');
const { executeCustomerTool } = require('../../services/ai/customer-tools');

const { getRepositories } = require('../../repositories');

// Rate limiting: this endpoint is unauthenticated by design (guests chat
// with Najm) and each call costs at least one real AI-provider round trip
// on the store's own key, so it needs a floor against scripted abuse.
// Same sliding-window pattern as routes/api/customer-reports.js.
const chatRateLimitMap = new Map();
const CHAT_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CHAT_MESSAGES_PER_WINDOW = 20; // generous enough for a real conversation

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of chatRateLimitMap.entries()) {
    const valid = timestamps.filter(t => now - t < CHAT_RATE_WINDOW_MS);
    if (valid.length === 0) chatRateLimitMap.delete(key);
    else chatRateLimitMap.set(key, valid);
  }
}, 10 * 60 * 1000);

function customerChatRateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const guestId = req.headers['x-guest-id'] || req.body?.guestId || req.body?.sessionId || '';
  const key = `${ip}_${guestId}`;

  const now = Date.now();
  const timestamps = (chatRateLimitMap.get(key) || []).filter(t => now - t < CHAT_RATE_WINDOW_MS);
  if (timestamps.length >= MAX_CHAT_MESSAGES_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      error: 'تم تجاوز الحد المسموح من الرسائل خلال فترة قصيرة. يرجى الانتظار قليلاً قبل المتابعة.'
    });
  }
  timestamps.push(now);
  chatRateLimitMap.set(key, timestamps);
  next();
}

/**
 * Main Customer Chat Endpoint
 */
router.post('/customer-chat', customerChatRateLimit, async (req, res) => {
  try {
    const repos = getRepositories();
    const message = String(req.body.message || '').trim();
    const sessionId = String(req.body.sessionId || req.headers['x-guest-id'] || 'session-' + Date.now()).trim();
    const guestId = req.headers['x-guest-id'] || req.body.guestId || req.body.sessionId || sessionId;
    // Identity must come only from the trusted, server-controlled session --
    // never from the request body. Accepting req.body.userId here let an
    // unauthenticated caller impersonate any customer by simply passing
    // their id (e.g. {"message":"...","userId":42}), reading/modifying
    // that customer's cart and placing orders under their identity.
    const userId = req.session?.customer?.id || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const imagePayload = req.body.image || null; // Optional { base64, mimeType, url }

    if (!message && !imagePayload) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة رسالة أو إرسال صورة للبدء.' });
    }
    if (message.length > 1200) {
      return res.status(400).json({ success: false, error: 'الرسالة طويلة جداً. يرجى الاختصار.' });
    }

    const conversation = await repos.ai.getOrCreateCustomerConversation(sessionId, guestId, userId);

    let savedState = {};
    try {
      if (conversation && conversation.state) {
        savedState = typeof conversation.state === 'string' ? JSON.parse(conversation.state) : conversation.state;
      }
    } catch (_) {}

    // Fetch previous 6 messages for context
    const prevMsgs = conversation ? await repos.ai.getRecentCustomerContext(conversation.id, 6) : [];

    // Log customer message
    if (conversation) {
      await repos.ai.addCustomerMessage(conversation.id, 'user', message, imagePayload?.url || null);
    }

    // Run Agent
    const result = await runNajmAgent({
      message,
      sessionId,
      guestId,
      userId,
      image: imagePayload,
      history: prevMsgs,
      state: savedState,
      ipAddress
    });

    // Log assistant response
    if (conversation) {
      await repos.ai.addCustomerMessage(
        conversation.id,
        'assistant',
        result.answer,
        null,
        {
          products: result.products,
          draftOrder: result.draftOrder,
          supportTicket: result.supportTicket,
          tracking: result.tracking
        }
      );

      // Update conversation message count, title & state
      await repos.ai.updateCustomerConversationState(
        conversation.id,
        message.slice(0, 40) || 'محادثة مع نجم',
        result.state || {},
        2
      );
    }

    // Log analytics event
    await repos.ai.logAnalyticsEvent('chat', sessionId, { messageLength: message.length, providerUsed: result.providerUsed });

    res.json({
      success: true,
      answer: result.answer,
      products: result.products,
      draftOrder: result.draftOrder,
      supportTicket: result.supportTicket,
      tracking: result.tracking,
      quickActions: result.quickActions,
      providerUsed: result.providerUsed
    });
  } catch (error) {
    console.error('Najm Chat API Error:', error);
    res.status(500).json({ success: false, error: 'تعذر تشغيل مساعد نجم حالياً. يرجى المحاولة بعد قليل.' });
  }
});

/**
 * Image Upload & Sharp Compression Endpoint
 */
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'يرجى اختيار صورة للرفع.' });
    }

    const processed = await processAndSaveImage(req.file.buffer, req.file.mimetype);

    res.json({
      success: true,
      imageUrl: processed.publicUrl,
      base64: processed.base64,
      mimeType: processed.mimeType,
      dataUrl: processed.dataUrl
    });
  } catch (error) {
    console.error('Image Upload Error:', error);
    res.status(400).json({ success: false, error: error.message || 'فشل معالجة الصورة.' });
  }
});

/**
 * Curated Featured Recommendations Endpoint
 */
router.get('/featured-recommendations', async (req, res) => {
  try {
    const products = await getFeaturedRecommendations(8);
    res.json({ success: true, products });
  } catch (error) {
    console.error('Featured recommendations error:', error);
    res.status(500).json({ success: false, error: 'تعذر جلب التوصيات' });
  }
});

/**
 * Dynamic Quick Action Pills
 */
router.get('/quick-actions', (req, res) => {
  res.json({
    success: true,
    quickActions: [
      { id: 'status', label: 'حالة الطلب', icon: '📦', prompt: 'أين طلبي؟ وكيف أعرف حالته؟' },
      { id: 'recom', label: 'اقتراح منتجات', icon: '🎁', prompt: 'اقترح لي أفضل المنتجات والعروض المميزة اليوم' },
      { id: 'track', label: 'تتبع طلب', icon: '🚚', prompt: 'أريد تتبع شحنة طلبي برقم الطلب' },
      { id: 'support', label: 'تواصل مع الدعم', icon: '🎧', prompt: 'أريد التحدث مع موظف خدمة العملاء' },
      { id: 'faq', label: 'الأسئلة الشائعة', icon: '💡', prompt: 'ما هي مواعيد التوصيل وسياسة الضمان وطرق الدفع؟' }
    ]
  });
});

/**
 * Two-Stage Order Confirmation Endpoint
 */
router.post('/confirm-order', async (req, res) => {
  try {
    const { draftToken } = req.body;
    const sessionId = req.body.sessionId || req.headers['x-guest-id'];
    const guestId = req.headers['x-guest-id'] || null;
    const userId = req.session?.customer?.id || null;
    const ipAddress = req.ip;

    const result = await executeCustomerTool('confirm_order', { draft_token: draftToken }, {
      sessionId,
      guestId,
      userId,
      ipAddress
    });

    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({ success: false, error: 'تعذر تأكيد الطلب.' });
  }
});

/**
 * Direct Order Tracking Endpoint
 */
router.get('/track-order', async (req, res) => {
  try {
    const orderId = req.query.orderId || req.query.id;
    const phone = req.query.phone;
    const sessionId = req.headers['x-guest-id'];
    const ipAddress = req.ip;

    const result = await executeCustomerTool('track_order', { order_id: orderId, phone }, {
      sessionId,
      ipAddress
    });

    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('Track order error:', error);
    res.status(500).json({ success: false, error: 'تعذر تتبع الطلب.' });
  }
});

/**
 * Human Support Request Endpoint
 */
router.post('/human-request', async (req, res) => {
  try {
    const { customerName, phone, orderId, category, requestText } = req.body;
    const sessionId = req.body.sessionId || req.headers['x-guest-id'];
    const ipAddress = req.ip;

    if (!customerName || !phone || !requestText) {
      return res.status(400).json({ success: false, error: 'الاسم ورقم الهاتف وتفاصيل الطلب مطلوبة.' });
    }

    const result = await createCustomerRequest({
      sessionId,
      customerName,
      phone,
      orderId,
      category,
      requestText,
      ipAddress
    });

    res.json(result);
  } catch (error) {
    console.error('Human request error:', error);
    res.status(500).json({ success: false, error: 'تعذر تسجيل طلب المساعدة.' });
  }
});

module.exports = router;