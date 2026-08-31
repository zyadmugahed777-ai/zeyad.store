const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '..', 'views', 'admin');

const files = {
  'categories/list.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <h2>التصنيفات</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>الكود</th><th>الاسم (عربي)</th><th>الاسم (إنجليزي)</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            <% if (categories.length === 0) { %><tr><td colspan="4" class="text-center">لا توجد تصنيفات</td></tr><% } %>
            <% categories.forEach(c => { %>
              <tr>
                <td><%= c.code %></td>
                <td><%= c.name_ar %></td>
                <td><%= c.name_en || '-' %></td>
                <td><% if (c.is_active) { %><span class="badge bg-success text-white">نشط</span><% } else { %><span class="badge bg-danger text-white">معطل</span><% } %></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'customers/list.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <h2>العملاء</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>الاسم</th><th>الهاتف</th><th>المدينة</th><th>الطلبات</th><th>إجمالي المشتريات</th></tr>
          </thead>
          <tbody>
            <% if (customers.length === 0) { %><tr><td colspan="5" class="text-center">لا يوجد عملاء</td></tr><% } %>
            <% customers.forEach(c => { %>
              <tr>
                <td><%= c.first_name %> <%= c.last_name || '' %></td>
                <td dir="ltr"><%= c.phone %></td>
                <td><%= c.city || '-' %></td>
                <td><%= c.total_orders %></td>
                <td><%= helpers.formatPrice(c.total_spent) %></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
      <%- include('../../partials/pagination') %>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'branches/list.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <h2>الفروع</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>الفرع</th><th>المدينة</th><th>الهاتف</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            <% if (branches.length === 0) { %><tr><td colspan="4" class="text-center">لا توجد فروع</td></tr><% } %>
            <% branches.forEach(b => { %>
              <tr>
                <td><%= b.name_ar %></td>
                <td><%= b.city %></td>
                <td dir="ltr"><%= b.phone || '-' %></td>
                <td><% if (b.is_active) { %><span class="badge bg-success text-white">نشط</span><% } else { %><span class="badge bg-danger text-white">معطل</span><% } %></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'offers/list.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <h2>العروض</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>العرض</th><th>الخصم</th><th>تاريخ الانتهاء</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            <% if (offers.length === 0) { %><tr><td colspan="4" class="text-center">لا توجد عروض</td></tr><% } %>
            <% offers.forEach(o => { %>
              <tr>
                <td><%= o.title_ar %></td>
                <td dir="ltr"><%= o.discount_value %> <%= o.discount_type === 'percentage' ? '%' : 'ر.ي' %></td>
                <td dir="ltr"><%= o.end_date ? helpers.formatDate(o.end_date) : 'مستمر' %></td>
                <td><% if (o.is_active) { %><span class="badge bg-success text-white">نشط</span><% } else { %><span class="badge bg-danger text-white">معطل</span><% } %></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'banners/list.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <h2>البانرات</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>العنوان</th><th>الرابط</th><th>المكان</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            <% if (banners.length === 0) { %><tr><td colspan="4" class="text-center">لا توجد بانرات</td></tr><% } %>
            <% banners.forEach(b => { %>
              <tr>
                <td><%= b.title || '-' %></td>
                <td dir="ltr"><%= b.link || '-' %></td>
                <td><%= b.position %></td>
                <td><% if (b.is_active) { %><span class="badge bg-success text-white">نشط</span><% } else { %><span class="badge bg-danger text-white">معطل</span><% } %></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'media/library.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card mb-24">
      <div class="card-header">
        <h2>رفع ملفات</h2>
      </div>
      <div style="padding: 24px;">
        <form action="/admin/media/upload" method="POST" enctype="multipart/form-data">
          <input type="file" name="files" multiple class="mb-16">
          <button type="submit" class="btn-primary">رفع</button>
        </form>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2>المكتبة</h2>
      </div>
      <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; padding: 24px;">
        <% if (media.length === 0) { %><p>لا توجد ملفات</p><% } %>
        <% media.forEach(m => { %>
          <div style="border: 1px solid var(--border); border-radius: 8px; overflow: hidden; position: relative;">
            <a href="<%= m.path %>" target="_blank" style="display: block; height: 150px; background: #f8fafc; background-image: url('<%= m.path %>'); background-size: cover; background-position: center;"></a>
            <div style="padding: 8px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" dir="ltr"><%= m.filename %></div>
            <form action="/admin/media/<%= m.id %>/delete" method="POST" class="delete-form" style="position: absolute; top: 4px; right: 4px;">
              <button type="submit" style="background: var(--danger); color: white; border: none; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
              </button>
            </form>
          </div>
        <% }) %>
      </div>
      <%- include('../../partials/pagination') %>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'notifications/list.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <h2>الإشعارات</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>التاريخ</th><th>النوع</th><th>العنوان</th><th>الرسالة</th></tr>
          </thead>
          <tbody>
            <% if (notifications.length === 0) { %><tr><td colspan="4" class="text-center">لا توجد إشعارات</td></tr><% } %>
            <% notifications.forEach(n => { %>
              <tr style="background: <%= n.is_read ? 'transparent' : '#f0f9ff' %>">
                <td dir="ltr"><%= helpers.formatDateTime(n.created_at) %></td>
                <td><%= n.type %></td>
                <td><strong><%= n.title %></strong></td>
                <td><%= n.message %></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
      <%- include('../../partials/pagination') %>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'reports/index.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 24px;">
      <div class="card">
        <div class="card-header">
          <h2>إحصائيات الطلبات</h2>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr><th>الحالة</th><th>العدد</th></tr>
            </thead>
            <tbody>
              <% statusCounts.forEach(s => { %>
                <tr>
                  <td>
                    <span class="badge" style="background-color: <%= helpers.statusColor(s.status) %>; color: white">
                      <%= helpers.statusLabel(s.status) %>
                    </span>
                  </td>
                  <td><%= s.count %></td>
                </tr>
              <% }) %>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="card">
        <div class="card-header">
          <h2>المنتجات الأكثر طلباً</h2>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr><th>المنتج</th><th>الكمية المباعة</th><th>الإيرادات</th></tr>
            </thead>
            <tbody>
              <% topProducts.forEach(p => { %>
                <tr>
                  <td><%= p.product_title %></td>
                  <td><%= p.qty %></td>
                  <td><%= helpers.formatPrice(p.revenue) %></td>
                </tr>
              <% }) %>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`,

  'users/list.ejs': `<%- include('../../partials/head', { title }) %>
<%- include('../../partials/sidebar', { active }) %>
<main class="admin-main">
  <%- include('../../partials/topbar') %>
  <div class="admin-content">
    <div class="card">
      <div class="card-header flex-between">
        <h2>المستخدمين (مدراء النظام)</h2>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>اسم المستخدم</th><th>الاسم الكامل</th><th>الصلاحية</th><th>تاريخ الإضافة</th></tr>
          </thead>
          <tbody>
            <% if (users.length === 0) { %><tr><td colspan="4" class="text-center">لا يوجد مستخدمين</td></tr><% } %>
            <% users.forEach(u => { %>
              <tr>
                <td dir="ltr"><%= u.username %></td>
                <td><%= u.full_name %></td>
                <td><%= u.role === 'admin' ? 'مدير عام' : u.role %></td>
                <td dir="ltr"><%= helpers.formatDateTime(u.created_at) %></td>
              </tr>
            <% }) %>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</main>
<%- include('../../partials/foot') %>`
};

for (const [filename, content] of Object.entries(files)) {
  const filePath = path.join(viewsDir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log('Created missing view: ' + filename);
}
