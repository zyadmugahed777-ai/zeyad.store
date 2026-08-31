const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '..', 'views');
const partialsDir = path.join(viewsDir, 'partials');
const adminViewsDir = path.join(viewsDir, 'admin');

[viewsDir, partialsDir, adminViewsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

['products', 'categories', 'orders', 'customers', 'branches', 'offers', 'banners', 'media', 'notifications', 'settings', 'users', 'reports'].forEach(dir => {
  const fullPath = path.join(adminViewsDir, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const files = {};

// PARTIALS
files['partials/head.ejs'] = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> - لوحة الإدارة | زياد ستور</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined" rel="stylesheet">
  <link rel="stylesheet" href="/admin-assets/admin.css">
</head>
<body>
<div class="admin-layout">`;

files['partials/sidebar.ejs'] = `<aside class="admin-sidebar">
  <div class="sidebar-header">
    <h2>زياد ستور</h2>
  </div>
  <nav class="sidebar-nav">
    <a href="/admin" class="<%= active === 'dashboard' ? 'active' : '' %>">
      <span class="material-symbols-outlined">dashboard</span> لوحة التحكم
    </a>
    <a href="/admin/products" class="<%= active === 'products' ? 'active' : '' %>">
      <span class="material-symbols-outlined">inventory_2</span> المنتجات
    </a>
    <a href="/admin/categories" class="<%= active === 'categories' ? 'active' : '' %>">
      <span class="material-symbols-outlined">category</span> التصنيفات
    </a>
    <a href="/admin/orders" class="<%= active === 'orders' ? 'active' : '' %>">
      <span class="material-symbols-outlined">shopping_bag</span> الطلبات
    </a>
    <a href="/admin/customers" class="<%= active === 'customers' ? 'active' : '' %>">
      <span class="material-symbols-outlined">people</span> العملاء
    </a>
    <a href="/admin/branches" class="<%= active === 'branches' ? 'active' : '' %>">
      <span class="material-symbols-outlined">store</span> الفروع
    </a>
    <a href="/admin/offers" class="<%= active === 'offers' ? 'active' : '' %>">
      <span class="material-symbols-outlined">local_offer</span> العروض
    </a>
    <a href="/admin/banners" class="<%= active === 'banners' ? 'active' : '' %>">
      <span class="material-symbols-outlined">panorama</span> البانرات
    </a>
    <a href="/admin/media" class="<%= active === 'media' ? 'active' : '' %>">
      <span class="material-symbols-outlined">perm_media</span> المكتبة
    </a>
    <a href="/admin/notifications" class="<%= active === 'notifications' ? 'active' : '' %>">
      <span class="material-symbols-outlined">notifications</span> الإشعارات
    </a>
    <a href="/admin/reports" class="<%= active === 'reports' ? 'active' : '' %>">
      <span class="material-symbols-outlined">assessment</span> التقارير
    </a>
    <a href="/admin/settings" class="<%= active === 'settings' ? 'active' : '' %>">
      <span class="material-symbols-outlined">settings</span> الإعدادات
    </a>
    <a href="/admin/users" class="<%= active === 'users' ? 'active' : '' %>">
      <span class="material-symbols-outlined">admin_panel_settings</span> المستخدمين
    </a>
  </nav>
</aside>`;

files['partials/topbar.ejs'] = `<header class="admin-topbar">
  <div class="topbar-left">
    <button id="sidebar-toggle" class="material-symbols-outlined">menu</button>
    <h1><%= title %></h1>
  </div>
  <div class="topbar-right">
    <span class="admin-name">مرحباً، <%= admin ? admin.full_name : '' %></span>
    <a href="/admin/logout" class="btn-logout"><span class="material-symbols-outlined">logout</span> خروج</a>
  </div>
</header>
<% if (flash) { %>
  <div class="alert alert-<%= flash.type %>">
    <%= flash.message %>
  </div>
<% } %>`;

files['partials/foot.ejs'] = `</div>
<script src="/admin-assets/admin.js"></script>
</body>
</html>`;

files['partials/pagination.ejs'] = `<% if (totalPages > 1) { %>
<div class="pagination">
  <% if (page > 1) { %>
    <a href="?page=<%= page - 1 %>&limit=<%= limit %>" class="btn-page">السابق</a>
  <% } %>
  <span class="page-info">صفحة <%= page %> من <%= totalPages %></span>
  <% if (page < totalPages) { %>
    <a href="?page=<%= page + 1 %>&limit=<%= limit %>" class="btn-page">التالي</a>
  <% } %>
</div>
<% } %>`;

// ADMIN VIEWS
files['admin/login.ejs'] = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تسجيل الدخول | زياد ستور</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/admin-assets/admin.css">
</head>
<body class="login-body">
  <div class="login-card">
    <h2>تسجيل الدخول</h2>
    <% if (flash) { %>
      <div class="alert alert-<%= flash.type %>"><%= flash.message %></div>
    <% } %>
    <form action="/admin/login" method="POST">
      <div class="form-group">
        <label>اسم المستخدم</label>
        <input type="text" name="username" required autofocus>
      </div>
      <div class="form-group">
        <label>كلمة المرور</label>
        <input type="password" name="password" required>
      </div>
      <button type="submit" class="btn-primary w-100">دخول</button>
    </form>
  </div>
</body>
</html>`;

files['admin/dashboard.ejs'] = `<%- include('../partials/head', { title }) %>
<%- include('../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../partials/topbar') %>
  <div class="admin-content">
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon"><span class="material-symbols-outlined">shopping_bag</span></div>
        <div class="stat-info">
          <h3>طلبات اليوم</h3>
          <p class="stat-value"><%= stats.orders_today %></p>
        </div>
      </div>
      <div class="stat-card warning">
        <div class="stat-icon"><span class="material-symbols-outlined">pending_actions</span></div>
        <div class="stat-info">
          <h3>طلبات قيد الانتظار</h3>
          <p class="stat-value"><%= stats.pending_orders %></p>
        </div>
      </div>
      <div class="stat-card success">
        <div class="stat-icon"><span class="material-symbols-outlined">payments</span></div>
        <div class="stat-info">
          <h3>إجمالي المبيعات</h3>
          <p class="stat-value"><%= helpers.formatPrice(stats.total_revenue) %></p>
        </div>
      </div>
      <div class="stat-card info">
        <div class="stat-icon"><span class="material-symbols-outlined">people</span></div>
        <div class="stat-info">
          <h3>إجمالي العملاء</h3>
          <p class="stat-value"><%= stats.total_customers %></p>
        </div>
      </div>
    </div>

    <div class="card mt-24">
      <div class="card-header">
        <h2>أحدث الطلبات</h2>
        <a href="/admin/orders" class="btn-outline">عرض الكل</a>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>العميل</th>
              <th>التاريخ</th>
              <th>المبلغ</th>
              <th>الحالة</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            <% if (recentOrders.length === 0) { %>
              <tr><td colspan="6" class="text-center">لا توجد طلبات</td></tr>
            <% } %>
            <% recentOrders.forEach(order => { %>
              <tr>
                <td><%= order.order_id %></td>
                <td><%= order.first_name %> <%= order.last_name || '' %></td>
                <td><%= helpers.formatDateTime(order.created_at) %></td>
                <td><%= helpers.formatPrice(order.total) %></td>
                <td>
                  <span class="badge" style="background-color: <%= helpers.statusColor(order.status) %>; color: white">
                    <%= helpers.statusLabel(order.status) %>
                  </span>
                </td>
                <td><a href="/admin/orders/<%= order.id %>" class="btn-sm btn-outline">عرض</a></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    </div>

  </div>
</main>
<%- include('../partials/foot') %>`;

files['admin/products/list.ejs'] = `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <form method="GET" class="filter-form">
          <input type="text" name="q" value="<%= search %>" placeholder="بحث بالاسم أو الكود...">
          <select name="category">
            <option value="">كل التصنيفات</option>
            <% categories.forEach(cat => { %>
              <option value="<%= cat.id %>" <%= cat.id == catId ? 'selected' : '' %>><%= cat.name_ar %></option>
            <% }) %>
          </select>
          <button type="submit" class="btn-primary">بحث</button>
        </form>
        <a href="/admin/products/create" class="btn-primary"><span class="material-symbols-outlined">add</span> إضافة منتج</a>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>المنتج</th>
              <th>التصنيف</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            <% if (products.length === 0) { %><tr><td colspan="6" class="text-center">لا يوجد منتجات</td></tr><% } %>
            <% products.forEach(p => { %>
              <tr>
                <td><%= p.product_id %></td>
                <td><%= p.title %></td>
                <td><%= p.category_name || '-' %></td>
                <td><%= helpers.formatPrice(p.price) %></td>
                <td>
                  <% if (p.is_active) { %><span class="badge bg-success text-white">نشط</span>
                  <% } else { %><span class="badge bg-danger text-white">معطل</span><% } %>
                </td>
                <td>
                  <a href="/admin/products/<%= p.id %>/edit" class="btn-sm btn-outline">تعديل</a>
                </td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
      <%- include('../../partials/pagination') %>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`;

files['admin/orders/list.ejs'] = `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <form method="GET" class="filter-form">
          <input type="text" name="q" value="<%= search %>" placeholder="رقم الطلب أو الهاتف...">
          <select name="status">
            <option value="">كل الحالات</option>
            <option value="pending" <%= status === 'pending' ? 'selected' : '' %>>في الانتظار</option>
            <option value="confirmed" <%= status === 'confirmed' ? 'selected' : '' %>>تم التأكيد</option>
            <option value="processing" <%= status === 'processing' ? 'selected' : '' %>>قيد التجهيز</option>
            <option value="shipped" <%= status === 'shipped' ? 'selected' : '' %>>تم الشحن</option>
            <option value="delivered" <%= status === 'delivered' ? 'selected' : '' %>>تم التوصيل</option>
            <option value="cancelled" <%= status === 'cancelled' ? 'selected' : '' %>>ملغي</option>
          </select>
          <button type="submit" class="btn-primary">فلترة</button>
        </form>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>العميل</th>
              <th>الهاتف</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            <% if (orders.length === 0) { %><tr><td colspan="7" class="text-center">لا يوجد طلبات</td></tr><% } %>
            <% orders.forEach(o => { %>
              <tr>
                <td><%= o.order_id %></td>
                <td><%= o.first_name %></td>
                <td><%= o.phone %></td>
                <td><%= helpers.formatDateTime(o.created_at) %></td>
                <td><%= helpers.formatPrice(o.total) %></td>
                <td>
                  <span class="badge" style="background-color: <%= helpers.statusColor(o.status) %>; color: white">
                    <%= helpers.statusLabel(o.status) %>
                  </span>
                </td>
                <td>
                  <a href="/admin/orders/<%= o.id %>" class="btn-sm btn-outline">عرض</a>
                </td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
      <%- include('../../partials/pagination') %>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`;

files['admin/orders/detail.ejs'] = `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    
    <div class="grid" style="grid-template-columns: 2fr 1fr; gap: 24px;">
      <!-- تفاصيل الطلب والمنتجات -->
      <div class="card">
        <div class="card-header">
          <h2>المنتجات المطلوبة</h2>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>السعر</th>
                <th>الكمية</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              <% items.forEach(item => { %>
                <tr>
                  <td><%= item.product_title %></td>
                  <td><%= helpers.formatPrice(item.price) %></td>
                  <td><%= item.quantity %></td>
                  <td><%= helpers.formatPrice(item.total) %></td>
                </tr>
              <% }) %>
            </tbody>
          </table>
        </div>
        <div class="order-summary mt-24" style="padding: 16px; background: #f8fafc; border-radius: 8px;">
          <div class="flex-between mb-8"><span>المجموع الفرعي:</span> <span><%= helpers.formatPrice(order.subtotal) %></span></div>
          <div class="flex-between mb-8"><span>رسوم التوصيل:</span> <span><%= helpers.formatPrice(order.shipping_fee) %></span></div>
          <div class="flex-between fw-bold" style="font-size: 1.1em; border-top: 1px solid #e2e8f0; padding-top: 8px;">
            <span>الإجمالي:</span> <span><%= helpers.formatPrice(order.total) %></span>
          </div>
        </div>
      </div>

      <!-- معلومات العميل والحالة -->
      <div>
        <div class="card mb-24">
          <div class="card-header">
            <h2>تحديث الحالة</h2>
          </div>
          <form action="/admin/orders/<%= order.id %>/status" method="POST" style="padding: 16px;">
            <select name="status" class="w-100 mb-16">
              <option value="pending" <%= order.status === 'pending' ? 'selected' : '' %>>في الانتظار</option>
              <option value="confirmed" <%= order.status === 'confirmed' ? 'selected' : '' %>>تم التأكيد</option>
              <option value="processing" <%= order.status === 'processing' ? 'selected' : '' %>>قيد التجهيز</option>
              <option value="shipped" <%= order.status === 'shipped' ? 'selected' : '' %>>تم الشحن</option>
              <option value="delivered" <%= order.status === 'delivered' ? 'selected' : '' %>>تم التوصيل</option>
              <option value="cancelled" <%= order.status === 'cancelled' ? 'selected' : '' %>>ملغي</option>
            </select>
            <button type="submit" class="btn-primary w-100">تحديث</button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>بيانات العميل</h2>
          </div>
          <div style="padding: 16px;">
            <p><strong>الاسم:</strong> <%= order.first_name %> <%= order.last_name || '' %></p>
            <p><strong>الهاتف:</strong> <a href="tel:<%= order.phone %>" dir="ltr"><%= order.phone %></a></p>
            <p><strong>المدينة:</strong> <%= order.city %></p>
            <p><strong>العنوان:</strong> <%= order.district %> - <%= order.address_detail %></p>
            <hr style="margin: 16px 0; border: 0; border-top: 1px solid #e2e8f0;">
            <p><strong>طريقة الدفع:</strong> <%= helpers.paymentLabel(order.payment_method) %></p>
            <p><strong>طريقة التوصيل:</strong> <%= order.delivery_method %></p>
            <% if (order.notes) { %>
              <div class="alert alert-info mt-16">
                <strong>ملاحظات العميل:</strong><br>
                <%= order.notes %>
              </div>
            <% } %>
            
            <% if (order.whatsapp_message) { %>
              <div class="mt-24">
                <a href="https://wa.me/<%= order.phone.replace(/[^0-9]/g, '') %>?text=<%= encodeURIComponent(order.whatsapp_message) %>" target="_blank" class="btn-success w-100" style="display: block; text-align: center; text-decoration: none;">
                  <span class="material-symbols-outlined" style="vertical-align: middle;">chat</span> إرسال عبر واتساب
                </a>
              </div>
            <% } %>
          </div>
        </div>
      </div>
    </div>

  </div>
</main>
<%- include('../../partials/foot') %>`;

files['admin/settings/index.ejs'] = `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <form action="/admin/settings" method="POST" style="padding: 24px;">
        <h3 class="mb-16">الإعدادات العامة</h3>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label>اسم المتجر (عربي)</label>
            <input type="text" name="store_name_ar" value="<%= settings.store_name_ar %>">
          </div>
          <div class="form-group">
            <label>اسم المتجر (إنجليزي)</label>
            <input type="text" name="store_name_en" value="<%= settings.store_name_en %>">
          </div>
        </div>

        <h3 class="mt-24 mb-16">إعدادات التواصل</h3>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label>رقم الواتساب</label>
            <input type="text" name="whatsapp_number" value="<%= settings.whatsapp_number %>" dir="ltr">
          </div>
          <div class="form-group">
            <label>هاتف الدعم الفني</label>
            <input type="text" name="support_phone" value="<%= settings.support_phone %>" dir="ltr">
          </div>
        </div>

        <h3 class="mt-24 mb-16">إعدادات التوصيل</h3>
        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="form-group">
            <label>رسوم التوصيل الافتراضية</label>
            <input type="number" name="default_delivery_fee" value="<%= settings.default_delivery_fee %>">
          </div>
          <div class="form-group">
            <label>رسوم التوصيل السريع</label>
            <input type="number" name="express_delivery_fee" value="<%= settings.express_delivery_fee %>">
          </div>
        </div>

        <div class="mt-24 text-left">
          <button type="submit" class="btn-primary">حفظ الإعدادات</button>
        </div>
      </form>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`;

for (const [filename, content] of Object.entries(files)) {
  const filePath = path.join(viewsDir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log('Created view: ' + filename);
}
console.log('Core Admin views created successfully.');
