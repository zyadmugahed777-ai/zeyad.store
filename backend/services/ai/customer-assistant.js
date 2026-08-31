const { getRepositories } = require('../../repositories');
const { createProvider } = require('./providers');
const { getProviderSettings, getKnowledge } = require('./settings-store');

function normalizeText(value) {
  return String(value || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .toLowerCase()
    .trim();
}

function searchPublicProducts(query, limit = 6) {
  const repos = getRepositories();
  const words = normalizeText(query).split(/\s+/).filter(Boolean).slice(0, 6);
  const products = repos.products.findActiveForCustomerAssistant(120);

  return products
    .map((product) => {
      const haystack = normalizeText(`${product.title} ${product.description || ''} ${product.brand || ''} ${product.category_name || ''}`);
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { ...product, score };
    })
    .filter((product) => words.length === 0 || product.score > 0)
    .sort((a, b) => b.score - a.score || (b.reviews_count || 0) - (a.reviews_count || 0))
    .slice(0, Math.min(Number(limit) || 6, 12));
}

function getPublicCategories() {
  const repos = getRepositories();
  return repos.categories.findActiveWithProductCounts().slice(0, 20);
}

function getStoreContactInfo() {
  const repos = getRepositories();
  const settings = repos.settings.findByKeys(['contact_phone', 'contact_whatsapp', 'contact_email', 'contact_address', 'payment_methods', 'shipping_methods']);
  return Object.fromEntries(settings.map((setting) => [setting.key, setting.value || '']));
}

function getCustomerContext(message) {
  return {
    products: searchPublicProducts(message, 6),
    categories: getPublicCategories(),
    contact: getStoreContactInfo(),
    knowledge: getKnowledge()
  };
}

function fallbackAnswer(message, context) {
  const products = context.products || [];
  const lines = [
    'أنا نجم، مساعد زياد ستور. سأساعدك حسب بيانات المتجر المتاحة فقط.'
  ];

  if (products.length) {
    lines.push('');
    lines.push('وجدت لك هذه الخيارات:');
    products.slice(0, 4).forEach((product, index) => {
      const price = Number(product.price || 0).toLocaleString('ar-YE');
      lines.push(`${index + 1}. ${product.title} - ${price} ر.ي - ${product.stock_status || 'التوفر غير محدد'}`);
    });
    lines.push('');
    lines.push('إذا أردت، اكتب لي الميزانية أو المساحة أو نوع الاستخدام وسأضيق لك الاختيارات.');
  } else {
    lines.push('');
    lines.push('لم أجد منتجًا مطابقًا بوضوح في البيانات الحالية. يمكنك كتابة اسم القسم مثل: غرف نوم، مجالس، أجهزة، مطابخ، طاقة شمسية.');
  }

  if (/تواصل|واتساب|رقم|اتصال|دعم/.test(message)) {
    lines.push('');
    lines.push(`للتواصل: ${context.contact.contact_whatsapp || context.contact.contact_phone || 'رقم التواصل غير مضبوط في إعدادات المتجر.'}`);
  }

  return lines.join('\n');
}

async function answerCustomer(message) {
  const context = getCustomerContext(message);
  const settings = getProviderSettings(true);
  const system = [
    'أنت نجم، مساعد الذكاء الاصطناعي الخاص بعملاء زياد ستور.',
    'ساعد الزبون في اختيار المنتجات، فهم الأقسام، معرفة التوفر، الأسعار، الضمان، التوصيل، وطرق التواصل.',
    'استخدم بيانات المتجر المرفقة فقط. لا تخترع أسعارًا أو منتجات أو ضمانات أو مواعيد توصيل.',
    'التوصيل متاح بأسعار رمزية ويتم تحديدها حسب المنطقة والمنتج، وتتوفر خدمة التركيب حسب نوع المنتج والطلب. لا تدّعي أن التوصيل أو التركيب مجاني كسياسة عامة للمتجر.',
    'لا تطلب معلومات حساسة. لا تعرض بيانات العملاء أو الإدارة. لا تنفذ أي إجراء إداري.',
    'عندما تكون البيانات غير متاحة قل ذلك بوضوح واقترح التواصل مع المتجر.',
    'اجعل الرد عربيًا واضحًا، مختصرًا، ودافئًا.',
    `بيانات المتجر المتاحة: ${JSON.stringify(context, null, 2)}`
  ].join('\n\n');

  if (settings.provider !== 'bedrock' || process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE) {
    try {
      const content = await createProvider(settings).complete({
        system,
        messages: [{ role: 'user', content: message }]
      });
      if (content) return { content, context, providerUsed: true };
    } catch (error) {
      return {
        content: `${fallbackAnswer(message, context)}\n\nتنبيه: تعذر الاتصال بمزود الذكاء الاصطناعي حاليًا، لذلك استخدمت بيانات المتجر المتاحة مباشرة.`,
        context,
        providerUsed: false
      };
    }
  }

  return { content: fallbackAnswer(message, context), context, providerUsed: false };
}

module.exports = { answerCustomer, getCustomerContext, searchPublicProducts };
