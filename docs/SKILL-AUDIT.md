# فحص وتدقيق حقيبة الـ Skills المتاحة (SKILL AUDIT & INVENTORY)
**مشروع:** زياد للتجارة (ZeyadStore)  
**طبيعة الوثيقة:** جرد وتدقيق فني استشاري للبيئة (Advisory Inventory)  
**المبدأ:**  
> *"Skills are available for Claude to leverage autonomously. Claude is not required to use any specific skill and selects tools based on its own engineering assessment."*

---

## 1. ملخص البيئة وحصر المهارات (Environment Inventory)

`[FACT]` بعد الفحص المباشر في بيئة المشروع، تتوزع المهارات والوكلاء في المسارات التالية:
1. `.claude/skills/`: **49** مهارة Claude Code.
2. `.agents/skills/`: **85** مجلد مهارات + **67** ملف تعريف وكيل (`.md`).
3. `.agent/rules/` & `.agent/workflows/`: **122** قاعدة و **94** مسار عمل.
4. **إجمالي العناصر المفحوصة والمصنفة:** **201** عنصر.

---

## 2. جدول الفحص والتقييم الاستشاري (Skill Audit Table)

| اسم المهارة (Skill Name) | المصدر الفعلي | الغرض الفني | الفئة | القيمة الاستشارية لـ ZeyadStore | الملاحظات والتوصيات |
|---|---|---|---|:---:|---|
| `postgres-pro` / `postgresql` | `.claude/skills` | هندسة واستعلامات وفهارس ومعاملات PostgreSQL | Database | ⭐⭐⭐⭐⭐ (مرتفع جداً) | `[RECOMMENDATION]` مفيدة كمرجع لاستعلامات PG 18 وتجنب بطء الفهارس. |
| `backend-patterns` | `.agents/skills` | معمارية Node.js/Express وعزل الطبقات والـ Async | Backend | ⭐⭐⭐⭐⭐ (مرتفع جداً) | `[RECOMMENDATION]` مفيدة لتنظيم كود الـ Services ومعالجة الأخطاء. |
| `api-designer` / `api-design` | `.claude/skills` & `.agents` | تصميم REST API متسق وتنسيق الـ JSON | API | ⭐⭐⭐⭐⭐ (مرتفع جداً) | `[RECOMMENDATION]` مفيدة لتوحيد مخرجات `routes/api`. |
| `security-review` / `owasp-security` | `.claude/skills` & `.agents` | مراجعة أمنية وكشف ثغرات OWASP والتحقق من المدخلات | Security | ⭐⭐⭐⭐⭐ (مرتفع جداً) | `[RECOMMENDATION]` مفيدة للتحقق من أمان الجلسات والمصادقة. |
| `diagnosing-bugs` | `.agents/skills` | منهجية التشخيص والبحث عن السبب الجذري | Core Eng | ⭐⭐⭐⭐⭐ (مرتفع جداً) | `[RECOMMENDATION]` ممتازة لتنظيم خطوات تتبع الأخطاء قبل التعديل. |
| `tdd-workflow` / `tdd` | `.agents/skills` | التطوير القائم على الاختبارات (Red-Green-Refactor) | Testing | ⭐⭐⭐⭐⭐ (مرتفع جداً) | `[RECOMMENDATION]` ممتازة لمنع الـ Regressions وضمان استقرار الميزات. |
| `domain-modeling` | `.agents/skills` | نمذجة كيانات الدومين والتسعير وحسابات العملات | Core Eng | ⭐⭐⭐⭐ (عالي) | `[RECOMMENDATION]` مفيدة لضبط الحسابات المزدوجة (SAR/YER). |
| `e2e-testing` / `webapp-testing` | `.agents/skills` & `.claude` | اختبار التدفق الكامل للمسارات من البداية للنهاية | Testing | ⭐⭐⭐⭐ (عالي) | `[RECOMMENDATION]` مفيدة لفحص مسار الشراء وتتبع الطلبات والدردشة. |
| `performance-profiler` | `.claude/skills` | قياس الأزمنة وتحليل p95/p99 واستعلامات الـ Pool | Performance | ⭐⭐⭐⭐ (عالي) | `[RECOMMENDATION]` مفيدة لضمان بقاء زمن الاستجابة أقل من 50ms. |
| `coding-standards` | `.agents/skills` | معايير جودة ونظافة الكود والـ Immutability | Core Eng | ⭐⭐⭐⭐ (عالي) | `[RECOMMENDATION]` مفيدة لمراجعة الكود قبل الاعتماد. |
| `ui-ux-pro-max` | `.claude/skills` & `.agents` | معايير تجربة وواجهة المستخدم ودعم الـ RTL | Frontend/UX | ⭐⭐⭐⭐ (عالي) | `[RECOMMENDATION]` مرجع مفيد عند تعديل الواجهات وتناسق الألوان. |
| `mcp-server-patterns` | `.agents/skills` | هندسة وتكامل أدوات الذكاء الاصطناعي (Tools) | AI / Tools | ⭐⭐⭐⭐ (عالي) | `[RECOMMENDATION]` مفيدة لهندسة وتدقيق أدوات مساعد المبيعات "نجم". |
| `eval-harness` | `.agents/skills` | تقييم جودة مخرجات الذكاء التوليدي | AI / QA | ⭐⭐⭐ (متوسط) | `[RECOMMENDATION]` مفيدة لتقييم دقة ردود نجم وسلوك مبيعاته. |
| `documentation-lookup` | `.agents/skills` | جلب توثيق الحزم الرسمية (Context7 / Docs) | Research | ⭐⭐⭐ (متوسط) | `[RECOMMENDATION]` مفيدة عند الشك في سلوك مكتبات خارجية (مثل `pg`). |
| `resolving-merge-conflicts` | `.agents/skills` | فض تعارضات فروع Git | DevOps | ⭐⭐⭐ (متوسط) | `[RECOMMENDATION]` مفيدة عند دمج فروع متعددة. |
| `strategic-compact` | `.agents/skills` | إدارة نافذة السياق وتلخيص الجلسات | Meta | ⭐⭐⭐ (متوسط) | `[RECOMMENDATION]` مفيدة لضغط السياق في الجلسات الطويلة. |
| مهارات لغات أخرى (C++, Rust, Go, Python...) | `.agents/skills` & `.agent` | فحص وحل أخطاء لغات غير مستخدمة بالمتجر | Noise | ⭐ (غير مفيدة) | `[RECOMMENDATION]` يُنصح بتجاهلها تماماً لتوفير السياق والـ Tokens. |
| مهارات مقالات وأعمال (Writing, Investor...) | `.agents/skills` | كتابة مقالات تسويقية أو عروض مستثمرين | Noise | ⭐ (غير مفيدة) | `[RECOMMENDATION]` خارج النطاق الهندسي للمتجر. |

---

## 3. تحليل التكرار والازدواجية (Overlap Insights)

- **مهارات `mp-*` (Matt Pocock):** توجد نسخ مكررة من هذه المهارات، ويفضل استخدام النسخ المجردة في `.agents/skills/` عند الحاجة.
- **مهارات الأمان:** `security-review` و `owasp-security` يغطيان نفس المفاهيم؛ استشر الأنسب لاحتياجك.
- **مهارات قواعد البيانات:** `postgres-pro` هي الأكثر شمولاً وعمقاً لـ PostgreSQL 18.

---

## 4. خلاصة لـ Claude Code

هذه الوثيقة تقدم لك خريطة بما هو مثبت ومتاح في البيئة. **أنت مهندس حر ومستقل:** اختر ما تراه مناسباً لحل المشكلة، وتجاهل ما لا تحتاجه دون أي قيود مفروضة عليك.
