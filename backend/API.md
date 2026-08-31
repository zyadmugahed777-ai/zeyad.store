# توثيق الـ API (زياد للأعمال)

كل المسارات (Routes) المذكورة هنا تبدأ بـ \`/api\`.
جميع الاستجابات (Responses) تعود بصيغة JSON وتحتوي على مفتاح \`success\` لمعرفة حالة الطلب.

مثال للنجاح:
\`\`\`json
{
  "success": true,
  "data": { ... }
}
\`\`\`

مثال للخطأ:
\`\`\`json
{
  "success": false,
  "error": "رسالة الخطأ"
}
\`\`\`

---

## 1. المنتجات (Products)

### الحصول على المنتجات
\`GET /api/products\`
- **Parameters**: 
  - \`page\` (default: 1)
  - \`limit\` (default: 20)
  - \`category\` (id or slug)
  - \`search\` (string)
  - \`sort\` (price_asc, price_desc, newest, popular)
- **Response**: Array of products + pagination info.

### الحصول على منتج مفرد
\`GET /api/products/:id\`
- **Note**: \`:id\` is the \`product_id\` (e.g., 'appl-0001').
- **Response**: Single product object including \`images\`, \`specs\`, \`faq\`, and \`colors\`.

---

## 2. التصنيفات (Categories)

### الحصول على كل التصنيفات النشطة
\`GET /api/categories\`
- **Response**: Array of categories sorted by \`sort_order\`.

### الحصول على تصنيف مفرد
\`GET /api/categories/:slug\`
- **Response**: Single category object.

---

## 3. الطلبات (Orders - Guest Checkout)

### إنشاء طلب جديد (بدون تسجيل دخول)
\`POST /api/orders\`
- **Body**:
  \`\`\`json
  {
    "customer": {
      "firstName": "أحمد",
      "lastName": "محمد",
      "phone": "777123456",
      "city": "صنعاء",
      "district": "حدة",
      "addressDetail": "الشارع الرئيسي بجوار المسجد"
    },
    "items": [
      { "id": "appl-0001", "quantity": 1 }
    ],
    "paymentMethod": "cash-on-delivery",
    "deliveryMethod": "توصيل عادي",
    "notes": "الاتصال قبل التوصيل"
  }
  \`\`\`
- **Response**: 
  \`\`\`json
  {
    "success": true,
    "data": {
      "orderId": "ZFB-2026-XXXXXX",
      "status": "pending"
    }
  }
  \`\`\`

### تتبع الطلبات بواسطة رقم الهاتف
\`GET /api/orders/track/:phone\`
- **Response**: Array of orders associated with this phone number.

---

## 4. المواعيد والاستشارات (Appointments & Consultations)

### طلب حجز موعد
\`POST /api/appointments\`
- **Body**: \`fullName\`, \`phone\` (Required) + \`branch\`, \`date\`, \`time\`, \`visitType\`, \`city\`, \`notes\`.

### طلب استشارة (مع مرفقات)
\`POST /api/consultations\`
- **Content-Type**: \`multipart/form-data\` (to support file uploads in \`attachments[]\`)
- **Body**: \`fullName\`, \`phone\` (Required) + \`consultationType\`, \`details\`, \`city\`, \`contactMethod\`.

### طلب تصميم
\`POST /api/designs\`
- **Body**: \`fullName\`, \`phone\` (Required) + \`designType\`, \`dimensions\`, \`budget\`, \`stylePref\`, \`details\`.

### طلب تسعير B2B (مع إمكانية إرفاق ملف BOQ)
\`POST /api/quotes\`
- **Content-Type**: \`multipart/form-data\`
- **Body**: \`fullName\`, \`phone\` (Required) + \`companyName\`, \`email\`, \`projectType\`, \`productsDetails\` + \`boqFile\` (File).

---

## 5. نماذج عامة (General Forms)

### التواصل معنا (Contact Us)
\`POST /api/contact\`
- **Body**: \`fullName\`, \`message\` (Required) + \`phone\`, \`email\`, \`subject\`.

### النشرة البريدية (Newsletter)
\`POST /api/newsletter\`
- **Body**: \`email\` (Required)

---

## 6. أخرى (Misc)

### الإعدادات (Settings)
\`GET /api/settings\`
- **Response**: Public settings only (delivery fees, payment methods, store name, etc).

### الفروع (Branches)
\`GET /api/branches\`
- **Response**: Active branches.

### العروض (Offers)
\`GET /api/offers\`
- **Response**: Active offers within valid dates.

### البانرات (Banners)
\`GET /api/banners?position=home\`
- **Response**: Active banners for the specified position.
