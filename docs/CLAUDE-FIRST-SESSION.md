# دليل وخريطة الجلسة الأولى لـ Claude Code (ONBOARDING & INSPECTION GUIDE)
**مشروع:** زياد للتجارة (ZeyadStore)  
**الدور:** مهندس الإنتاج الرئيسي المستقل (Autonomous Lead Production Engineer)  
**المبدأ:**  
> *"Inspect reality first. Understand before acting. Base decisions on evidence."*

---

## 1. خريطة الاستكشاف الأولي الموصى بها (Recommended Onboarding Steps)

الخطوات التالية تمثل مساراً استكشافياً موصى به لـ Claude Code لبناء فهم عميق وسريع لحالة النظام الحالية:

1. **استعراض الفهرس السريع:** قراءة [`CLAUDE.md`](file:///d:/played/Zeyad%20For%20Business/CLAUDE.md) لمعرفة المراجع ومسارات النظام.
2. **فحص وثيقة التسليم والسياق:** قراءة [`docs/HANDOFF.md`](file:///d:/played/Zeyad%20For%20Business/docs/HANDOFF.md) للتعرف على ما تم إنجازه والبيئة الحالية.
3. **مراجعة حدود السلامة:** مراجعة [`docs/CLAUDE-ENGINEERING-RULES.md`](file:///d:/played/Zeyad%20For%20Business/docs/CLAUDE-ENGINEERING-RULES.md) و [`docs/PRODUCTION-CHANGE-POLICY.md`](file:///d:/played/Zeyad%20For%20Business/docs/PRODUCTION-CHANGE-POLICY.md).
4. **فحص الكود والبيئة الحقيقية (Live Inspection):**
   - فحص ملف `backend/server.js` والمتغيرات البيئية في `backend/.env`.
   - التحقق من حالة السيرفر عبر `GET /api/health`.
5. **التحقق من حالة قاعدة البيانات الحالية:**
   - فحص اتصال PostgreSQL 18 على المنفذ 5433 والتأكد من الجداول وتكوين الـ Pool (`backend/config/pg-database.js`).
6. **فحص الجلسات والمصادقة:**
   - فحص تدفق تسجيل دخول الإدارة `/admin/login` وسلامة مسار `routes/api/auth.js`.
7. **فحص مساعد المبيعات "نجم":**
   - مراجعة إعدادات ومسار `POST /api/ai/customer-chat` واختبار الـ Fallback المحلي.
8. **فحص نتائج الاختبارات السابقة:**
   - تشغيل حزمة الاختبارات الشاملة (مثل `test-phase9a3-post-cutover-stabilization.js`) لتحديد أي فحوصات تحتاج تثبيتاً.
9. **بناء خطة العمل المبنية على الأدلة:**
   - تحديد أولويات الإصلاح بناءً على الفحص الفعلي وليس على افتراضات مسبقة.
10. **البدء بالتنفيذ الآمن:**
    - عزل السبب الجذري، وتطبيق الحل البرمجي الأمثل، واختبار النتائج بالأدلة.
