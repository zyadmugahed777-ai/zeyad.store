# دليل وحقيبة المهارات الاستشارية لـ Claude Code (SKILLS TOOLBOX)
**مشروع:** زياد للتجارة (ZeyadStore)  
**المبدأ الأساسي:**  
> *"Skills are an advisory toolbox for Claude Code, not mandatory constraints. Claude independently selects the appropriate skills, tools, or techniques based on the problem at hand."*

---

## 1. فلسفة استخدام المهارات (Skill Autonomy Principle)

1. **الاستقلالية في الاختيار:**  
   المهارات المدرجة هنا هي **صندوق أدوات استشاري (Advisory Toolbox)** يساعد Claude في تسريع الإنجاز وضمان المعايير الفنية. لا يوجد أي إلزام باستدعاء مهارة معينة إذا كان بإمكان Claude حل المشكلة بمهاراته وتحليله المباشر.
2. **التوجيه حسب السياق (Context-Driven):**  
   يقرأ Claude المهارة فقط عندما يشعر أنها تضيف قيمة فعلية للمهمة الحالية، لتجنب هدر الـ Tokens وتشتيت سياق العمل.
3. **التحقق من الوجود الفعلي:**  
   لا تفترض وجود مهارة غير موجودة بالفعل في مجلدات `.claude/skills/` أو `.agents/skills/`.

---

## 2. دليل تصنيف المهارات المتاحة وقيمتها الاستشارية

### 🛠️ مهارات عالية الفائدة للباك إند وقواعد البيانات (High Utility)
- **`postgres-pro` / `postgresql`** (`.claude/skills`):
  - **طبيعتها:** مرجع استشاري متقدم لاستعلامات PostgreSQL 18، الفهارس، التزامن، ومخططات الـ Query Planning.
  - **متى تفيدك:** عند كتابة استعلامات معقدة، فحص الـ Indexes، أو ضبط الـ Transactions.
- **`backend-patterns`** (`.agents/skills`):
  - **طبيعتها:** مرجع معمارية Express/Node.js، معالجة الأخطاء الموحدة، والـ Middleware.
  - **متى تفيدك:** عند تنظيم الـ Services ومسارات الـ API وإدارة الـ Async/Await.
- **`security-review` / `owasp-security`** (`.claude/skills` & `.agents`):
  - **طبيعتها:** قوائم تدقيق أمني لكشف ثغرات الـ Web (SQLi, XSS, CSRF, IDOR, Session Fixation).
  - **متى تفيدك:** عند تعديل المصادقة، الجلسات، الـ Admin Panel، أو نقاط الاتصال العامة.
- **`api-design` / `api-designer`** (`.claude/skills` & `.agents`):
  - **طبيعتها:** إرشادات تصميم REST API متسق، تنسيق كود الأخطاء والـ Status Codes.
  - **متى تفيدك:** عند إنشاء أو تحسين استجابات الـ Endpoints.

---

### 🧪 مهارات الاختبار والتشخيص وضمان الجودة (Quality & Testing)
- **`diagnosing-bugs`** (`.agents/skills`):
  - **طبيعتها:** منهجية البحث عن السبب الجذري (Root Cause Analysis) وعزل المشكلة قبل البدء بالتعديل.
  - **متى تفيدك:** عند تشخيص الأخطاء الصعبة في الباك إند أو الجلسات أو تدفقات الشراء.
- **`tdd-workflow` / `tdd`** (`.agents/skills`):
  - **طبيعتها:** إرشادات التطوير القائم على الاختبارات (Red-Green-Refactor).
  - **متى تفيدك:** عند إضافة ميزات جديدة أو إصلاح أخطاء حساسة للتأكد من عدم حدوث Regression.
- **`e2e-testing` / `webapp-testing`** (`.agents/skills` & `.claude`):
  - **طبيعتها:** أساليب اختبار التدفق الكامل (End-to-End) للمسارات الحرجة (Cart, Checkout, Najm).
  - **متى تفيدك:** للتحقق من سلامة التكامل بين الواجهة والخادم وقاعدة البيانات.
- **`performance-profiler`** (`.claude/skills`):
  - **طبيعتها:** قياس زمن الاستجابة وتحليل p95/p99 واستعلامات قاعدة البيانات البطيئة.
  - **متى تفيدك:** عند تحسين سرعة استعلامات المنتجات وتجاوب الخادم.

---

### 🤖 مهارات الذكاء الاصطناعي والواجهات (AI & UI/UX)
- **`mcp-server-patterns`** (`.agents/skills`):
  - **طبيعتها:** معايير تصميم وتنظيم أدوات الـ AI والـ Tool Calling.
  - **متى تفيدك:** عند تطوير وتدقيق مدخلات ومخرجات أدوات مساعد المبيعات "نجم".
- **`domain-modeling`** (`.agents/skills`):
  - **طبيعتها:** ضبط مفاهيم ونماذج الدومين التجاري (العملات، السلة، الطلبات، الكوبونات).
  - **متى تفيدك:** عند التعامل مع الحسابات المالية والتسعير المزدوج (SAR/YER).
- **`ui-ux-pro-max`** (`.claude/skills` & `.agents`):
  - **طبيعتها:** مكتبة إرشادات التصميم، دعم الـ RTL، الهوية البصرية، وتجربة المستخدم.
  - **متى تفيدك:** عند تعديل الواجهات الأمامية لمتجر زياد.

---

### ⛔ مهارات خارج نطاق المشروع (Irrelevant / Noise Skills)
المهارات التالية تخص تقنيات أو لغات غير مستخدمة في ZeyadStore (Node.js/Express فقط)، ويُنصح بتجاهلها لتوفير السياق:
- مهارات اللغات الأخرى: `cpp-*`, `rust-*`, `go-*`, `python-*`, `csharp-*`, `swift-*`, `dart-*`, `kotlin-*`, `php-*`.
- أطر العمل الأخرى: `django-*`, `fastapi-*`, `flutter-*`, `vue-*`, `angular-*`.
- مهارات كتابة المقالات غير الهندسية: `article-writing`, `investor-*`.

---

## 3. خريطة الإرشاد المرجعي السريع (Recommended Reference Map)

هذا الجدول يوضح المهارات والوثائق المقترحة كمرجع إرشادي (وليس إلزامي) حسب مجال العمل:

| مجال العمل | المهارات المقترحة للاستئناس | الوثائق المرتبطة |
|---|---|---|
| **قواعد البيانات و SQL** | `postgres-pro` | `backend/config/pg-database.js` |
| **مسارات الباك إند والخدمات** | `backend-patterns`, `api-design` | `docs/BACKEND-REPAIR-MISSION.md` |
| **الأمان والجلسات والمصادقة** | `security-review` | `docs/PRODUCTION-CHANGE-POLICY.md` |
| **مساعد المبيعات نجم والدردشة** | `mcp-server-patterns`, `eval-harness` | `docs/NAJM-REPAIR-MISSION.md` |
| **الحسابات المالية والسلة** | `domain-modeling`, `tdd-workflow` | `docs/RISK-MAP.md` |
| **التحسينات البصرية والواجهة** | `ui-ux-pro-max` | `AGENTS.md` (Product DNA) |
