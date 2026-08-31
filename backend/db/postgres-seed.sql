-- ---------------------------------------------------------------------------
-- Zeyad For Business — PostgreSQL reference-data seed
--
-- postgres-schema.sql is deliberately pure DDL. This file carries the
-- *reference* rows a fresh PostgreSQL database cannot function without —
-- currently the RBAC role catalogue.
--
-- Why this exists: ensureDefaultAdmin() in middleware/auth.js creates the
-- bootstrap admin with a hardcoded role_id = 1, and admin_users.role_id is a
-- foreign key onto roles(id). With roles empty, the very first admin can never
-- be created, so a fresh PostgreSQL deployment had no way to log in at all.
-- The SQLite path never hit this because db/seed.sql (SQLite-only) plus the
-- long-lived db/zeyad.db already carried these rows.
--
-- The contents below are transcribed verbatim from the legacy SQLite database
-- (backend/db/zeyad.db, tables `roles` and `role_permissions`) so PostgreSQL
-- reproduces the existing authorization model exactly. Nothing here is
-- invented: the five role names match the keys of `rolePermissions` in
-- middleware/rbac.js, which is what actually gates admin routes at runtime.
--
-- Idempotent by design — safe to re-run on every boot.
-- ---------------------------------------------------------------------------

-- Role catalogue (ids are referenced by admin_users.role_id and by
-- role_permissions.role_id, so they are inserted explicitly rather than
-- letting BIGSERIAL choose).
INSERT INTO "roles" ("id", "name", "description") VALUES
  (1, 'Super Admin', 'صلاحيات كاملة للتحكم بالموقع'),
  (2, 'Admin',       'مدير النظام'),
  (3, 'Editor',      'محرر محتوى'),
  (4, 'Sales',       'المبيعات'),
  (5, 'Support',     'الدعم الفني')
ON CONFLICT ("id") DO NOTHING;

-- Explicit ids above bypass the BIGSERIAL sequence, which would otherwise
-- still be at 1 and collide on the next role created through the admin UI.
SELECT setval(
  pg_get_serial_sequence('roles', 'id'),
  GREATEST((SELECT COALESCE(MAX("id"), 1) FROM "roles"), 1)
);

-- Permission grants per role.
--
-- NOTE: middleware/rbac.js currently resolves permissions from a hardcoded
-- map keyed by role *name*, not from this table — the table is reference data
-- kept in sync with that map so the two never diverge, and so a future move to
-- database-driven permissions has correct data to read. Transcribed from the
-- SQLite `role_permissions` table (33 rows).
INSERT INTO "role_permissions" ("role_id", "permission") VALUES
  (1, '*'),
  (1, 'ai:*'),
  (2, 'ai:*'),
  (2, 'banners:*'),
  (2, 'branches:*'),
  (2, 'customers:*'),
  (2, 'dashboard:view'),
  (2, 'media:*'),
  (2, 'notifications:*'),
  (2, 'offers:*'),
  (2, 'orders:*'),
  (2, 'pages:*'),
  (2, 'reports:view'),
  (2, 'settings:*'),
  (2, 'users:view'),
  (3, 'banners:*'),
  (3, 'categories:view'),
  (3, 'dashboard:view'),
  (3, 'media:*'),
  (3, 'notifications:view'),
  (3, 'offers:*'),
  (3, 'pages:*'),
  (3, 'products:view'),
  (4, 'customers:*'),
  (4, 'dashboard:view'),
  (4, 'notifications:*'),
  (4, 'offers:view'),
  (4, 'orders:*'),
  (4, 'reports:view'),
  (5, 'customers:view'),
  (5, 'dashboard:view'),
  (5, 'notifications:*'),
  (5, 'orders:view')
ON CONFLICT ("role_id", "permission") DO NOTHING;

-- ---------------------------------------------------------------------------
-- AI tool permission catalogue.
--
-- Unlike role_permissions above, this table IS read at runtime: services/ai/
-- permissions.js -> hasAiPermission() gates every admin-AI tool call against
-- it, and routes/admin/ai-employee.js renders tool output while building the
-- page. With the table empty, every gate denied, the page's own data-gathering
-- threw "ليست لديك صلاحية تشغيل هذه الأداة", and /admin/ai-employee was a hard
-- error page for a Super Admin on any fresh PostgreSQL database.
--
-- Transcribed verbatim from the legacy SQLite `ai_permissions` table (14 rows),
-- including its enabled/disabled state, so PostgreSQL reproduces the same AI
-- authorization posture rather than a guessed one. Toggling these afterwards is
-- the admin UI's job (saveAiPermissions), and ON CONFLICT DO NOTHING means an
-- operator's later changes are never overwritten by a reboot.
-- ---------------------------------------------------------------------------
INSERT INTO "ai_permissions" ("permission_key", "label_ar", "group_name", "operation_type", "is_enabled") VALUES
  ('execute_ai_actions', 'تنفيذ إجراءات الذكاء الاصطناعي', 'actions', 'write', TRUE),
  ('manage_ai_memory', 'إدارة ذاكرة الذكاء الاصطناعي', 'ai', 'write', TRUE),
  ('manage_ai_settings', 'إدارة إعدادات الذكاء الاصطناعي', 'ai', 'write', TRUE),
  ('view_analytics', 'عرض التحليلات', 'analytics', 'read', TRUE),
  ('edit_customers', 'تعديل العملاء', 'customers', 'write', TRUE),
  ('view_customers', 'عرض العملاء', 'customers', 'read', TRUE),
  ('edit_orders', 'تعديل الطلبات', 'orders', 'write', TRUE),
  ('view_orders', 'عرض الطلبات', 'orders', 'read', TRUE),
  ('create_products', 'إنشاء منتجات', 'products', 'write', TRUE),
  ('delete_products', 'حذف المنتجات', 'products', 'write', TRUE),
  ('edit_products', 'تعديل المنتجات', 'products', 'write', TRUE),
  ('view_products', 'عرض المنتجات', 'products', 'read', TRUE),
  ('modify_store_settings', 'تعديل إعدادات المتجر', 'settings', 'write', TRUE),
  ('view_system_health', 'عرض صحة النظام', 'system', 'read', TRUE)
ON CONFLICT ("permission_key") DO NOTHING;
