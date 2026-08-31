-- ============================================================================
-- Zeyad For Business — PostgreSQL Canonical Schema (Phase 8A)
-- Target: PostgreSQL 16+ / 18+
-- Generated automatically with exact financial precision and timestamp typing.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

SET timezone TO 'UTC';

-- ----------------------------------------------------------------------------
-- Table: addresses
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "addresses" (
  "id" BIGSERIAL PRIMARY KEY,
  "customer_id" BIGINT,
  "guest_id" TEXT,
  "title" TEXT DEFAULT 'عنوان التوصيل',
  "country" TEXT DEFAULT 'اليمن',
  "province" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "district" TEXT,
  "street" TEXT,
  "address_line" TEXT,
  "formatted_address" TEXT,
  "building_info" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "is_default" BOOLEAN DEFAULT FALSE,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_addresses_guest" ON "addresses" ("guest_id");
CREATE INDEX IF NOT EXISTS "idx_addresses_customer" ON "addresses" ("customer_id");

-- ----------------------------------------------------------------------------
-- Table: admin_users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "admin_users" (
  "id" BIGSERIAL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "full_name" TEXT,
  "email" TEXT,
  "role" TEXT DEFAULT 'admin',
  "is_active" BOOLEAN DEFAULT TRUE,
  "last_login" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "role_id" BIGINT,
  "permissions" JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_admin_users_username" ON "admin_users" ("username");

-- ----------------------------------------------------------------------------
-- Table: ai_action_audits
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_action_audits" (
  "id" BIGSERIAL PRIMARY KEY,
  "session_id" TEXT,
  "user_id" BIGINT,
  "action" TEXT NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "payload" JSONB,
  "result" TEXT NOT NULL DEFAULT 'success',
  "provider" TEXT,
  "model" TEXT,
  "ip_address" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_action_audits_action" ON "ai_action_audits" ("action", "created_at");

-- ----------------------------------------------------------------------------
-- Table: ai_action_confirmations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_action_confirmations" (
  "id" BIGSERIAL PRIMARY KEY,
  "conversation_id" BIGINT,
  "user_id" BIGINT,
  "tool_name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "confirmed_at" TIMESTAMPTZ
);


-- ----------------------------------------------------------------------------
-- Table: ai_activity_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_activity_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT,
  "actor" TEXT NOT NULL DEFAULT 'AI Employee',
  "action" TEXT NOT NULL,
  "tool_name" TEXT,
  "affected_type" TEXT,
  "affected_id" TEXT,
  "old_value" TEXT,
  "new_value" TEXT,
  "result" TEXT,
  "confirmation_status" TEXT DEFAULT 'not_required',
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_activity_created" ON "ai_activity_logs" ("created_at");

-- ----------------------------------------------------------------------------
-- Table: ai_analytics_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_analytics_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "event_type" TEXT NOT NULL,
  "product_id" TEXT,
  "session_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_analytics_type" ON "ai_analytics_events" ("event_type", "created_at");

-- ----------------------------------------------------------------------------
-- Table: ai_conversations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" BIGSERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_ai_conversations_user" ON "ai_conversations" ("created_by", "deleted_at");

-- ----------------------------------------------------------------------------
-- Table: ai_customer_conversations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_customer_conversations" (
  "id" BIGSERIAL PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "guest_id" TEXT,
  "user_id" BIGINT,
  "title" TEXT,
  "message_count" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "state" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_ai_cust_conv_session" ON "ai_customer_conversations" ("session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_customer_conversations_session_id" ON "ai_customer_conversations" ("session_id");

-- ----------------------------------------------------------------------------
-- Table: ai_customer_messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_customer_messages" (
  "id" BIGSERIAL PRIMARY KEY,
  "conversation_id" BIGINT,
  "sender" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "image_url" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_cust_msg_conv" ON "ai_customer_messages" ("conversation_id");

-- ----------------------------------------------------------------------------
-- Table: ai_customer_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_customer_requests" (
  "id" BIGSERIAL PRIMARY KEY,
  "request_id" TEXT NOT NULL,
  "conversation_id" BIGINT,
  "customer_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "order_id" TEXT,
  "category" TEXT DEFAULT 'general',
  "request_text" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "admin_notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "requested_products" TEXT,
  "quantity" INTEGER DEFAULT 1,
  "budget" NUMERIC(20,2),
  "najm_notes" TEXT,
  "priority" TEXT DEFAULT '"normal"'
);

CREATE INDEX IF NOT EXISTS "idx_ai_cust_req_status" ON "ai_customer_requests" ("status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_customer_requests_request_id" ON "ai_customer_requests" ("request_id");

-- ----------------------------------------------------------------------------
-- Table: ai_memory
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_memory" (
  "id" BIGSERIAL PRIMARY KEY,
  "memory_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "is_active" BOOLEAN DEFAULT TRUE,
  "updated_by" INTEGER,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_memory_type" ON "ai_memory" ("memory_type", "is_active");

-- ----------------------------------------------------------------------------
-- Table: ai_messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_messages" (
  "id" BIGSERIAL PRIMARY KEY,
  "conversation_id" BIGINT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_messages_conversation" ON "ai_messages" ("conversation_id", "created_at");

-- ----------------------------------------------------------------------------
-- Table: ai_najm_instructions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_najm_instructions" (
  "id" BIGSERIAL PRIMARY KEY,
  "agent_identity" TEXT,
  "core_instructions" TEXT,
  "tone_and_style" TEXT,
  "sales_policy" TEXT,
  "pricing_policy" TEXT,
  "orders_and_reservation_policy" TEXT,
  "human_handoff_policy" TEXT,
  "tool_rules" TEXT,
  "vision_rules" TEXT,
  "full_prompt" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN DEFAULT TRUE,
  "updated_by" INTEGER,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: ai_najm_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_najm_settings" (
  "id" BIGSERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'openrouter',
  "model" TEXT NOT NULL DEFAULT 'anthropic/claude-3.5-sonnet',
  "api_base_url" TEXT DEFAULT '',
  "encrypted_api_token" TEXT,
  "token_hint" TEXT,
  "temperature" NUMERIC(4,2) DEFAULT 0.3,
  "max_tokens" INTEGER DEFAULT 2048,
  "request_timeout" INTEGER DEFAULT 30,
  "enable_vision" INTEGER DEFAULT 1,
  "enable_tools" INTEGER DEFAULT 1,
  "is_active" BOOLEAN DEFAULT TRUE,
  "updated_by" INTEGER,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: ai_order_drafts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_order_drafts" (
  "id" BIGSERIAL PRIMARY KEY,
  "draft_token" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "customer_payload" TEXT NOT NULL,
  "items_payload" TEXT NOT NULL,
  "subtotal" NUMERIC(20,2) NOT NULL,
  "shipping_fee" NUMERIC(20,2) DEFAULT 0,
  "total" NUMERIC(20,2) NOT NULL,
  "is_confirmed" BOOLEAN DEFAULT FALSE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_drafts_token" ON "ai_order_drafts" ("draft_token", "is_confirmed");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_order_drafts_idempotency_key" ON "ai_order_drafts" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_order_drafts_draft_token" ON "ai_order_drafts" ("draft_token");

-- ----------------------------------------------------------------------------
-- Table: ai_permissions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_permissions" (
  "permission_key" TEXT PRIMARY KEY,
  "label_ar" TEXT NOT NULL,
  "group_name" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "is_enabled" BOOLEAN DEFAULT TRUE,
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: ai_provider_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_provider_settings" (
  "id" BIGSERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL DEFAULT 'bedrock',
  "model" TEXT NOT NULL DEFAULT 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  "api_base_url" TEXT,
  "encrypted_api_token" TEXT,
  "token_hint" TEXT,
  "region" TEXT DEFAULT 'us-east-1',
  "temperature" NUMERIC(4,2) DEFAULT 0.2,
  "max_tokens" INTEGER DEFAULT 4096,
  "request_timeout" INTEGER DEFAULT 30,
  "enable_streaming" INTEGER DEFAULT 1,
  "enable_tool_calling" INTEGER DEFAULT 1,
  "updated_by" INTEGER,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "enable_vision" INTEGER DEFAULT 1,
  "system_prompt_override" TEXT
);


-- ----------------------------------------------------------------------------
-- Table: ai_system_instructions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_system_instructions" (
  "id" BIGSERIAL PRIMARY KEY,
  "body" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "is_active" BOOLEAN DEFAULT TRUE,
  "updated_by" INTEGER,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: ai_tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_tasks" (
  "id" BIGSERIAL PRIMARY KEY,
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "source_tool" TEXT,
  "related_type" TEXT,
  "related_id" TEXT,
  "status" TEXT DEFAULT 'open',
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_ai_tasks_status" ON "ai_tasks" ("status", "priority");

-- ----------------------------------------------------------------------------
-- Table: ai_tool_runs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ai_tool_runs" (
  "id" BIGSERIAL PRIMARY KEY,
  "conversation_id" BIGINT,
  "user_id" BIGINT,
  "tool_name" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "arguments" TEXT,
  "result_summary" TEXT,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: appointments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "appointments" (
  "id" BIGSERIAL PRIMARY KEY,
  "branch" TEXT,
  "date" TIMESTAMPTZ,
  "time" TEXT,
  "visit_type" TEXT,
  "full_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "city" TEXT,
  "notes" TEXT,
  "status" TEXT DEFAULT 'pending',
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_appointments_date" ON "appointments" ("date");
CREATE INDEX IF NOT EXISTS "idx_appointments_status" ON "appointments" ("status");

-- ----------------------------------------------------------------------------
-- Table: audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT,
  "old_values" TEXT,
  "new_values" TEXT,
  "ip_address" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_created" ON "audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_entity" ON "audit_logs" ("entity");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_user" ON "audit_logs" ("user_id");

-- ----------------------------------------------------------------------------
-- Table: banners
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "banners" (
  "id" BIGSERIAL PRIMARY KEY,
  "title" TEXT,
  "subtitle" TEXT,
  "image" TEXT NOT NULL,
  "link" TEXT,
  "position" TEXT DEFAULT 'home',
  "start_date" TIMESTAMPTZ,
  "end_date" TIMESTAMPTZ,
  "is_active" BOOLEAN DEFAULT TRUE,
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "button_text" TEXT,
  "body" TEXT,
  "status" TEXT DEFAULT 'draft',
  "desktop_image" TEXT,
  "mobile_image" TEXT,
  "department_id" BIGINT,
  "category_id" BIGINT,
  "product_id_ref" INTEGER
);

CREATE INDEX IF NOT EXISTS "idx_banners_dates" ON "banners" ("start_date", "end_date");
CREATE INDEX IF NOT EXISTS "idx_banners_status" ON "banners" ("status");
CREATE INDEX IF NOT EXISTS "idx_banners_department" ON "banners" ("department_id");
CREATE INDEX IF NOT EXISTS "idx_banners_position" ON "banners" ("position");
CREATE INDEX IF NOT EXISTS "idx_banners_active" ON "banners" ("is_active");

-- ----------------------------------------------------------------------------
-- Table: branches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "branches" (
  "id" BIGSERIAL PRIMARY KEY,
  "name_ar" TEXT NOT NULL,
  "name_en" TEXT,
  "city" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "google_maps" TEXT,
  "working_hours" TEXT,
  "image" TEXT,
  "is_active" BOOLEAN DEFAULT TRUE,
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: cart_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cart_items" (
  "id" BIGSERIAL PRIMARY KEY,
  "cart_id" BIGINT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "selected_color" TEXT,
  "image_url" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_cart_items_cart_product" ON "cart_items" ("cart_id", "product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cart_items_cart_id_product_id" ON "cart_items" ("cart_id", "product_id");

-- ----------------------------------------------------------------------------
-- Table: carts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "carts" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT,
  "guest_id" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "coupon_code" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_carts_guest_id" ON "carts" ("guest_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_carts_user_id" ON "carts" ("user_id");

-- ----------------------------------------------------------------------------
-- Table: categories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "categories" (
  "id" BIGSERIAL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "name_en" TEXT,
  "slug" TEXT NOT NULL,
  "parent_id" BIGINT,
  "description_ar" TEXT,
  "image" TEXT,
  "sort_order" INTEGER DEFAULT 0,
  "is_active" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "department_id" BIGINT
);

CREATE INDEX IF NOT EXISTS "idx_categories_active" ON "categories" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_categories_parent" ON "categories" ("parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_categories_slug" ON "categories" ("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_categories_code" ON "categories" ("code");

-- ----------------------------------------------------------------------------
-- Table: cms_elements
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cms_elements" (
  "id" BIGSERIAL PRIMARY KEY,
  "page_id" BIGINT NOT NULL,
  "element_key" TEXT NOT NULL,
  "element_type" TEXT DEFAULT 'text',
  "content" TEXT,
  "metadata" JSONB,
  "sort_order" INTEGER DEFAULT 0,
  "is_visible" BOOLEAN DEFAULT TRUE,
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "styles_json" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_cms_elements_key" ON "cms_elements" ("element_key");
CREATE INDEX IF NOT EXISTS "idx_cms_elements_page" ON "cms_elements" ("page_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_elements_page_id_element_key" ON "cms_elements" ("page_id", "element_key");

-- ----------------------------------------------------------------------------
-- Table: cms_pages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cms_pages" (
  "id" BIGSERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL,
  "title_ar" TEXT NOT NULL,
  "title_en" TEXT,
  "page_type" TEXT DEFAULT 'static',
  "is_active" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "sort_order" INTEGER DEFAULT 0,
  "route" TEXT,
  "editable" BOOLEAN DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_pages_slug" ON "cms_pages" ("slug");

-- ----------------------------------------------------------------------------
-- Table: cms_published
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cms_published" (
  "id" BIGSERIAL PRIMARY KEY,
  "page_id" BIGINT NOT NULL,
  "element_key" TEXT NOT NULL,
  "element_type" TEXT NOT NULL DEFAULT 'text',
  "content" TEXT,
  "styles_json" TEXT,
  "metadata" JSONB,
  "is_visible" BOOLEAN DEFAULT TRUE,
  "published_at" TIMESTAMPTZ DEFAULT NOW(),
  "published_by" INTEGER
);

CREATE INDEX IF NOT EXISTS "idx_cms_published_key" ON "cms_published" ("element_key");
CREATE INDEX IF NOT EXISTS "idx_cms_published_page" ON "cms_published" ("page_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cms_published_page_id_element_key" ON "cms_published" ("page_id", "element_key");

-- ----------------------------------------------------------------------------
-- Table: cms_revisions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cms_revisions" (
  "id" BIGSERIAL PRIMARY KEY,
  "page_id" BIGINT NOT NULL,
  "user_id" BIGINT,
  "snapshot" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "element_key" TEXT,
  "revision_type" TEXT DEFAULT 'draft_save'
);

CREATE INDEX IF NOT EXISTS "idx_cms_revisions_page" ON "cms_revisions" ("page_id");

-- ----------------------------------------------------------------------------
-- Table: consultations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "consultations" (
  "id" BIGSERIAL PRIMARY KEY,
  "consultation_type" TEXT,
  "details" TEXT,
  "attachments" JSONB,
  "full_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "city" TEXT,
  "contact_method" TEXT,
  "status" TEXT DEFAULT 'pending',
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_consultations_status" ON "consultations" ("status");

-- ----------------------------------------------------------------------------
-- Table: contact_messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contact_messages" (
  "id" BIGSERIAL PRIMARY KEY,
  "full_name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "subject" TEXT,
  "message" TEXT NOT NULL,
  "is_read" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_contact_messages_read" ON "contact_messages" ("is_read");

-- ----------------------------------------------------------------------------
-- Table: content_blocks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "content_blocks" (
  "id" BIGSERIAL PRIMARY KEY,
  "section_id" BIGINT NOT NULL,
  "key" TEXT NOT NULL,
  "type" TEXT DEFAULT 'text',
  "value" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_content_blocks_section" ON "content_blocks" ("section_id");

-- ----------------------------------------------------------------------------
-- Table: coupons
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "coupons" (
  "id" BIGSERIAL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "discount_type" TEXT DEFAULT 'percentage',
  "discount_value" NUMERIC(20,2) DEFAULT 0,
  "min_order" NUMERIC(12,2) DEFAULT 0,
  "max_uses" INTEGER DEFAULT 0,
  "used_count" INTEGER DEFAULT 0,
  "start_date" TIMESTAMPTZ,
  "end_date" TIMESTAMPTZ,
  "is_active" BOOLEAN DEFAULT TRUE,
  "applicable_departments" TEXT,
  "applicable_categories" TEXT,
  "applicable_products" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "customer_phone" TEXT,
  "notes" TEXT,
  "source_type" TEXT DEFAULT 'admin',
  "source_id" TEXT,
  "scope" TEXT DEFAULT 'public',
  "customer_id" BIGINT,
  "created_by" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_coupons_phone" ON "coupons" ("customer_phone");
CREATE INDEX IF NOT EXISTS "idx_coupons_source" ON "coupons" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "idx_coupons_active" ON "coupons" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_coupons_code" ON "coupons" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_coupons_code" ON "coupons" ("code");

-- ----------------------------------------------------------------------------
-- Table: customer_reports
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "customer_reports" (
  "id" BIGSERIAL PRIMARY KEY,
  "report_number" TEXT NOT NULL,
  "tracking_token" TEXT NOT NULL,
  "customer_name" TEXT,
  "customer_phone" TEXT NOT NULL,
  "customer_email" TEXT,
  "issue_type" TEXT NOT NULL,
  "issue_type_ar" TEXT NOT NULL,
  "page_url" TEXT,
  "description" TEXT NOT NULL,
  "expected_behavior" TEXT,
  "actual_behavior" TEXT,
  "image_path" TEXT,
  "context_data" JSONB,
  "status" TEXT DEFAULT 'new',
  "priority" TEXT DEFAULT 'medium',
  "admin_notes" TEXT,
  "reward_type" TEXT,
  "reward_value" NUMERIC(12,2),
  "reward_code" TEXT,
  "reward_status" TEXT DEFAULT 'none',
  "reward_notes" TEXT,
  "approved_by" TEXT,
  "approved_at" TIMESTAMPTZ,
  "rejected_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "rewarded_at" TIMESTAMPTZ,
  "last_customer_view_at" TIMESTAMPTZ,
  "last_admin_action_at" TIMESTAMPTZ,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_reports_status" ON "customer_reports" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_reports_phone" ON "customer_reports" ("customer_phone");
CREATE INDEX IF NOT EXISTS "idx_reports_token" ON "customer_reports" ("tracking_token");
CREATE INDEX IF NOT EXISTS "idx_reports_number" ON "customer_reports" ("report_number");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_reports_report_number" ON "customer_reports" ("report_number");

-- ----------------------------------------------------------------------------
-- Table: customer_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "customer_requests" (
  "id" BIGSERIAL PRIMARY KEY,
  "request_id" TEXT NOT NULL,
  "request_type" TEXT NOT NULL,
  "customer_id" BIGINT,
  "guest_id" TEXT,
  "customer_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "city" TEXT,
  "status" TEXT DEFAULT 'new',
  "priority" TEXT DEFAULT 'normal',
  "source" TEXT DEFAULT 'web',
  "page_url" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "subject" TEXT,
  "message" TEXT,
  "attachments" JSONB,
  "context_data" JSONB,
  "admin_notes" TEXT,
  "assigned_to" TEXT,
  "contacted_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_cust_req_created" ON "customer_requests" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_cust_req_type" ON "customer_requests" ("request_type");
CREATE INDEX IF NOT EXISTS "idx_cust_req_status" ON "customer_requests" ("status");
CREATE INDEX IF NOT EXISTS "idx_cust_req_phone" ON "customer_requests" ("phone");
CREATE INDEX IF NOT EXISTS "idx_cust_req_id" ON "customer_requests" ("request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_requests_request_id" ON "customer_requests" ("request_id");

-- ----------------------------------------------------------------------------
-- Table: customers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "customers" (
  "id" BIGSERIAL PRIMARY KEY,
  "first_name" TEXT,
  "last_name" TEXT,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "city" TEXT,
  "district" TEXT,
  "address_detail" TEXT,
  "notes" TEXT,
  "total_orders" NUMERIC(20,2) DEFAULT 0,
  "total_spent" NUMERIC(20,2) DEFAULT 0,
  -- NULL means "contact record created implicitly at checkout, not a login".
  -- The login path refuses a NULL hash outright rather than comparing to it.
  "password_hash" TEXT,
  "password_updated_at" TIMESTAMPTZ,
  "last_login_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_customers_phone" ON "customers" ("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customers_phone" ON "customers" ("phone");

-- ----------------------------------------------------------------------------
-- Table: delivery_policies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "delivery_policies" (
  "id" BIGSERIAL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "name_en" TEXT,
  "description" TEXT,
  "category_scope" TEXT DEFAULT 'all',
  "zone_scope" TEXT DEFAULT 'all',
  "service_type" TEXT DEFAULT 'delivery',
  "pricing_type" TEXT NOT NULL DEFAULT 'range',
  "min_price_yer" NUMERIC(20,2) DEFAULT 0,
  "max_price_yer" NUMERIC(20,2) DEFAULT 0,
  "min_price_sar" NUMERIC(20,2) DEFAULT 0,
  "max_price_sar" NUMERIC(20,2) DEFAULT 0,
  "fixed_price_yer" NUMERIC(20,2) DEFAULT 0,
  "fixed_price_sar" NUMERIC(20,2) DEFAULT 0,
  "is_active" BOOLEAN DEFAULT TRUE,
  "sort_order" INTEGER DEFAULT 0,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_deliv_pol_zone" ON "delivery_policies" ("zone_scope");
CREATE INDEX IF NOT EXISTS "idx_deliv_pol_active" ON "delivery_policies" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_deliv_pol_code" ON "delivery_policies" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_delivery_policies_code" ON "delivery_policies" ("code");

-- ----------------------------------------------------------------------------
-- Table: delivery_provinces
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "delivery_provinces" (
  "id" BIGSERIAL PRIMARY KEY,
  "name_ar" TEXT NOT NULL,
  "name_en" TEXT,
  "zone_type" TEXT NOT NULL DEFAULT 'provinces',
  "is_active" BOOLEAN DEFAULT TRUE,
  "sort_order" INTEGER DEFAULT 0,
  "estimated_days" TEXT DEFAULT '2-4 أيام',
  "notes" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_deliv_prov_zone" ON "delivery_provinces" ("zone_type");
CREATE INDEX IF NOT EXISTS "idx_deliv_prov_active" ON "delivery_provinces" ("is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_delivery_provinces_name_ar" ON "delivery_provinces" ("name_ar");

-- ----------------------------------------------------------------------------
-- Table: departments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "departments" (
  "id" BIGSERIAL PRIMARY KEY,
  "slug" TEXT,
  "name_ar" TEXT,
  "icon" TEXT,
  "sort_order" INTEGER DEFAULT 0,
  "is_active" BOOLEAN DEFAULT TRUE,
  "name_en" TEXT,
  "image" TEXT,
  "description_ar" TEXT,
  "description_en" TEXT,
  "created_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_departments_slug" ON "departments" ("slug");

-- ----------------------------------------------------------------------------
-- Table: design_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "design_requests" (
  "id" BIGSERIAL PRIMARY KEY,
  "design_type" TEXT,
  "dimensions" TEXT,
  "budget" NUMERIC(20,2),
  "style_pref" TEXT,
  "details" TEXT,
  "full_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_design_requests_status" ON "design_requests" ("status");

-- ----------------------------------------------------------------------------
-- Table: guest_sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "guest_sessions" (
  "guest_id" TEXT PRIMARY KEY,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "last_active_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: media
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "media" (
  "id" BIGSERIAL PRIMARY KEY,
  "filename" TEXT NOT NULL,
  "original_name" TEXT,
  "mime_type" TEXT,
  "size" INTEGER,
  "path" TEXT NOT NULL,
  "alt_text" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "folder" TEXT DEFAULT '"general"',
  "folder_id" BIGINT,
  "title" TEXT,
  "description" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "thumbnail_path" TEXT,
  "updated_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "idx_media_mime" ON "media" ("mime_type");
CREATE INDEX IF NOT EXISTS "idx_media_folder" ON "media" ("folder");
CREATE INDEX IF NOT EXISTS "idx_media_folder_id" ON "media" ("folder_id");

-- ----------------------------------------------------------------------------
-- Table: media_folders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "media_folders" (
  "id" BIGSERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "parent_id" BIGINT,
  "slug" TEXT NOT NULL,
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_media_folders_parent_id_slug" ON "media_folders" ("parent_id", "slug");

-- ----------------------------------------------------------------------------
-- Table: newsletter
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "newsletter" (
  "id" BIGSERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "is_active" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_newsletter_email" ON "newsletter" ("email");

-- ----------------------------------------------------------------------------
-- Table: notification_channels
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notification_channels" (
  "id" BIGSERIAL PRIMARY KEY,
  "notification_id" BIGINT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'in_app',
  "status" TEXT DEFAULT 'sent',
  "sent_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_notification_channels_notif" ON "notification_channels" ("notification_id");

-- ----------------------------------------------------------------------------
-- Table: notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" BIGSERIAL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "reference_id" BIGINT,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "is_read" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "entity_type" TEXT,
  "entity_id" TEXT,
  "action_url" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_notif_entity" ON "notifications" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_type" ON "notifications" ("type");
CREATE INDEX IF NOT EXISTS "idx_notifications_read" ON "notifications" ("is_read");

-- ----------------------------------------------------------------------------
-- Table: offers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "offers" (
  "id" BIGSERIAL PRIMARY KEY,
  "title_ar" TEXT NOT NULL,
  "title_en" TEXT,
  "description" TEXT,
  "discount_type" TEXT DEFAULT 'percentage',
  "discount_value" NUMERIC(12,2) DEFAULT 0,
  "min_order" NUMERIC(12,2),
  "start_date" TIMESTAMPTZ,
  "end_date" TIMESTAMPTZ,
  "applicable_categories" TEXT,
  "applicable_products" TEXT,
  "is_active" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "image" TEXT,
  "button_text" TEXT,
  "link" TEXT,
  "coupon_code" TEXT,
  "discount_amount" NUMERIC(20,2) DEFAULT 0,
  "department_id" BIGINT,
  "category_id" BIGINT,
  "product_id_ref" INTEGER,
  "placement" TEXT DEFAULT 'home',
  "status" TEXT DEFAULT 'draft',
  "sort_order" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_offers_dates" ON "offers" ("start_date", "end_date");
CREATE INDEX IF NOT EXISTS "idx_offers_status" ON "offers" ("status");
CREATE INDEX IF NOT EXISTS "idx_offers_department" ON "offers" ("department_id");
CREATE INDEX IF NOT EXISTS "idx_offers_active" ON "offers" ("is_active");

-- ----------------------------------------------------------------------------
-- Table: order_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "order_items" (
  "id" BIGSERIAL PRIMARY KEY,
  "order_id" BIGINT NOT NULL,
  "product_id" TEXT,
  "product_title" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "price" NUMERIC(20,2) NOT NULL,
  "total" NUMERIC(20,2) NOT NULL,
  "selected_color" TEXT,
  "image_url" TEXT
);

CREATE INDEX IF NOT EXISTS "idx_order_items_order" ON "order_items" ("order_id");

-- ----------------------------------------------------------------------------
-- Table: orders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "orders" (
  "id" BIGSERIAL PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "customer_id" BIGINT,
  "status" TEXT DEFAULT 'pending',
  "subtotal" NUMERIC(20,2) NOT NULL DEFAULT 0,
  "discount" NUMERIC(20,2) DEFAULT 0,
  "shipping_fee" NUMERIC(20,2) DEFAULT 0,
  "total" NUMERIC(20,2) NOT NULL DEFAULT 0,
  "payment_method" TEXT,
  "payment_method_label" TEXT,
  "delivery_method" TEXT,
  "city" TEXT,
  "district" TEXT,
  "address_detail" TEXT,
  "notes" TEXT,
  "whatsapp_message" TEXT,
  "currency" TEXT DEFAULT 'YER',
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "exchange_rate" NUMERIC(12,4) DEFAULT 1.0,
  "subtotal_sar" NUMERIC(20,2) DEFAULT 0,
  "total_sar" NUMERIC(20,2) DEFAULT 0,
  "discount_sar" NUMERIC(12,2) DEFAULT 0,
  "shipping_fee_sar" NUMERIC(20,2) DEFAULT 0,
  "coupon_code" TEXT,
  "coupon_id" BIGINT,
  "free_shipping" BOOLEAN DEFAULT FALSE,
  "delivery_pricing_type" TEXT,
  "delivery_estimate_text" TEXT,
  "delivery_zone" TEXT,
  "installation_fee_sar" NUMERIC(20,2) DEFAULT 0,
  "installation_fee" NUMERIC(20,2) DEFAULT 0,
  "installation_status" TEXT DEFAULT 'none',
  "address_id" BIGINT,
  "formatted_address" TEXT,
  "province" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS "idx_orders_created_at" ON "orders" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_orders_created" ON "orders" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_orders_status" ON "orders" ("status");
CREATE INDEX IF NOT EXISTS "idx_orders_customer" ON "orders" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_orders_order_id" ON "orders" ("order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_order_id" ON "orders" ("order_id");

-- ----------------------------------------------------------------------------
-- Table: page_sections
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "page_sections" (
  "id" BIGSERIAL PRIMARY KEY,
  "page_id" BIGINT NOT NULL,
  "section_type" TEXT NOT NULL,
  "name" TEXT,
  "sort_order" INTEGER DEFAULT 0,
  "is_active" BOOLEAN DEFAULT TRUE,
  "styles" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: pages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "pages" (
  "id" BIGSERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "meta_title" TEXT,
  "meta_description" TEXT,
  "meta_keywords" TEXT,
  "is_active" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_pages_slug" ON "pages" ("slug");

-- ----------------------------------------------------------------------------
-- Table: payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payments" (
  "id" BIGSERIAL PRIMARY KEY,
  "order_id" BIGINT NOT NULL,
  "method" TEXT NOT NULL,
  "method_label" TEXT,
  "amount" NUMERIC(20,2) NOT NULL,
  "status" TEXT DEFAULT 'pending',
  "reference" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_payments_order" ON "payments" ("order_id");

-- ----------------------------------------------------------------------------
-- Table: product_colors
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_colors" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "name" TEXT NOT NULL,
  "hex" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_product_colors_product" ON "product_colors" ("product_id");

-- ----------------------------------------------------------------------------
-- Table: product_documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_documents" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "title" TEXT NOT NULL,
  "file_path" TEXT NOT NULL,
  "file_type" TEXT DEFAULT 'pdf',
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_product_documents_product" ON "product_documents" ("product_id");

-- ----------------------------------------------------------------------------
-- Table: product_faq
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_faq" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "sort_order" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_product_faq_product" ON "product_faq" ("product_id");

-- ----------------------------------------------------------------------------
-- Table: product_images
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_images" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "image_path" TEXT NOT NULL,
  "sort_order" INTEGER DEFAULT 0,
  "is_primary" BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS "idx_product_images_product" ON "product_images" ("product_id");

-- ----------------------------------------------------------------------------
-- Table: product_specs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_specs" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sort_order" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_product_specs_product" ON "product_specs" ("product_id");

-- ----------------------------------------------------------------------------
-- Table: product_tags
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_tags" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "tag" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_product_tags_tag" ON "product_tags" ("tag");
CREATE INDEX IF NOT EXISTS "idx_product_tags_product" ON "product_tags" ("product_id");

-- ----------------------------------------------------------------------------
-- Table: products
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "products" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" TEXT NOT NULL,
  "category_id" BIGINT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "price" NUMERIC(20,2) NOT NULL DEFAULT 0,
  "old_price" NUMERIC(20,2),
  "sku" TEXT,
  "brand" TEXT,
  "origin" TEXT,
  "warranty" TEXT,
  "shipping" TEXT,
  "delivery_time" TEXT,
  "installation" TEXT,
  "weight" TEXT,
  "video" TEXT,
  "rating" NUMERIC(4,2) DEFAULT 0,
  "reviews_count" INTEGER DEFAULT 0,
  "is_new" BOOLEAN DEFAULT FALSE,
  "is_best_seller" BOOLEAN DEFAULT FALSE,
  "is_active" BOOLEAN DEFAULT TRUE,
  "stock_status" TEXT DEFAULT 'in-stock',
  "sort_order" INTEGER DEFAULT 0,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  "barcode" TEXT,
  "short_description" TEXT,
  "tags" TEXT,
  "keywords" TEXT,
  "department_id" BIGINT,
  "pdf_file" TEXT,
  "specifications" JSONB,
  "related_products" JSONB,
  "subcategory_id" BIGINT,
  "seo_title" TEXT,
  "seo_description" TEXT,
  "seo_keywords" TEXT,
  "is_archived" BOOLEAN DEFAULT FALSE,
  "stock_quantity" INTEGER DEFAULT 0,
  "low_stock_threshold" INTEGER DEFAULT 5,
  "warranty_months" INTEGER DEFAULT 0,
  "discount_percentage" NUMERIC(12,2) DEFAULT 0,
  "discount_amount" NUMERIC(20,2) DEFAULT 0,
  "discount_start" TIMESTAMPTZ,
  "discount_end" TIMESTAMPTZ,
  "colors" JSONB,
  "delivery_policy_type" TEXT DEFAULT 'default',
  "delivery_fixed_fee_sar" NUMERIC(20,2) DEFAULT 0,
  "requires_installation" BOOLEAN DEFAULT FALSE,
  "installation_fee_sar" NUMERIC(20,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_products_archived" ON "products" ("is_archived");
CREATE INDEX IF NOT EXISTS "idx_products_subcategory" ON "products" ("subcategory_id");
CREATE INDEX IF NOT EXISTS "idx_products_department" ON "products" ("department_id");
CREATE INDEX IF NOT EXISTS "idx_products_price" ON "products" ("price");
CREATE INDEX IF NOT EXISTS "idx_products_brand" ON "products" ("brand");
CREATE INDEX IF NOT EXISTS "idx_products_sku" ON "products" ("sku");
CREATE INDEX IF NOT EXISTS "idx_products_product_id" ON "products" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_products_active" ON "products" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_products_category" ON "products" ("category_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_products_product_id" ON "products" ("product_id");

-- ----------------------------------------------------------------------------
-- Table: quote_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "quote_requests" (
  "id" BIGSERIAL PRIMARY KEY,
  "company_name" TEXT,
  "full_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "project_type" TEXT,
  "products_details" TEXT,
  "boq_file" TEXT,
  "status" TEXT DEFAULT 'pending',
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_quote_requests_status" ON "quote_requests" ("status");

-- ----------------------------------------------------------------------------
-- Table: related_products
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "related_products" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "related_product_id" BIGINT NOT NULL,
  "sort_order" INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "idx_related_products_product" ON "related_products" ("product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_related_products_product_id_related_product_id" ON "related_products" ("product_id", "related_product_id");

-- ----------------------------------------------------------------------------
-- Table: role_permissions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" BIGINT NOT NULL,
  "permission" TEXT NOT NULL,
  PRIMARY KEY ("role_id", "permission")
);


-- ----------------------------------------------------------------------------
-- Table: roles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "roles" (
  "id" BIGSERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_roles_name" ON "roles" ("name");

-- ----------------------------------------------------------------------------
-- Table: sessions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid" TEXT PRIMARY KEY,
  "sess" JSONB NOT NULL,
  "expired" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_sessions_expired" ON "sessions" ("expired");

-- ----------------------------------------------------------------------------
-- Table: settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "settings" (
  "id" BIGSERIAL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "value" TEXT,
  "type" TEXT DEFAULT 'string',
  "group_name" TEXT DEFAULT 'general',
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_settings_group" ON "settings" ("group_name");
CREATE INDEX IF NOT EXISTS "idx_settings_key" ON "settings" ("key");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_settings_key" ON "settings" ("key");

-- ----------------------------------------------------------------------------
-- Table: subcategories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "subcategories" (
  "id" BIGSERIAL PRIMARY KEY,
  "department_id" BIGINT NOT NULL,
  "slug" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "name_en" TEXT,
  "icon" TEXT,
  "image" TEXT,
  "description_ar" TEXT,
  "sort_order" INTEGER DEFAULT 0,
  "is_active" BOOLEAN DEFAULT TRUE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_subcategories_active" ON "subcategories" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_subcategories_department" ON "subcategories" ("department_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_subcategories_department_id_slug" ON "subcategories" ("department_id", "slug");

-- ----------------------------------------------------------------------------
-- Table: theme_content
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "theme_content" (
  "key" TEXT PRIMARY KEY,
  "type" TEXT DEFAULT 'text',
  "value" TEXT,
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: theme_content_revisions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "theme_content_revisions" (
  "id" BIGSERIAL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "old_value" TEXT,
  "new_value" TEXT,
  "type" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- Table: theme_settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "theme_settings" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT
);


-- ----------------------------------------------------------------------------
-- Table: wishlist_items
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "wishlist_items" (
  "id" BIGSERIAL PRIMARY KEY,
  "wishlist_id" BIGINT NOT NULL,
  "product_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_wishlist_items_wishlist_id_product_id" ON "wishlist_items" ("wishlist_id", "product_id");

-- ----------------------------------------------------------------------------
-- Table: wishlists
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "wishlists" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" BIGINT,
  "guest_id" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_wishlists_guest_id" ON "wishlists" ("guest_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_wishlists_user_id" ON "wishlists" ("user_id");

-- ============================================================================
-- Foreign Key Constraints (Applied after all tables exist)
-- ============================================================================
ALTER TABLE "addresses" ADD CONSTRAINT "fk_addresses_customer_id_1" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE;
ALTER TABLE "admin_users" ADD CONSTRAINT "fk_admin_users_role_id_1" FOREIGN KEY ("role_id") REFERENCES "roles" ("id");
ALTER TABLE "ai_action_confirmations" ADD CONSTRAINT "fk_ai_action_confirmations_user_id_1" FOREIGN KEY ("user_id") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_action_confirmations" ADD CONSTRAINT "fk_ai_action_confirmations_conversation_id_2" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_activity_logs" ADD CONSTRAINT "fk_ai_activity_logs_user_id_1" FOREIGN KEY ("user_id") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_conversations" ADD CONSTRAINT "fk_ai_conversations_created_by_1" FOREIGN KEY ("created_by") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_customer_messages" ADD CONSTRAINT "fk_ai_customer_messages_conversation_id_1" FOREIGN KEY ("conversation_id") REFERENCES "ai_customer_conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "ai_memory" ADD CONSTRAINT "fk_ai_memory_updated_by_1" FOREIGN KEY ("updated_by") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_messages" ADD CONSTRAINT "fk_ai_messages_conversation_id_1" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "ai_najm_instructions" ADD CONSTRAINT "fk_ai_najm_instructions_updated_by_1" FOREIGN KEY ("updated_by") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_najm_settings" ADD CONSTRAINT "fk_ai_najm_settings_updated_by_1" FOREIGN KEY ("updated_by") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "fk_ai_provider_settings_updated_by_1" FOREIGN KEY ("updated_by") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_system_instructions" ADD CONSTRAINT "fk_ai_system_instructions_updated_by_1" FOREIGN KEY ("updated_by") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_tool_runs" ADD CONSTRAINT "fk_ai_tool_runs_user_id_1" FOREIGN KEY ("user_id") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "ai_tool_runs" ADD CONSTRAINT "fk_ai_tool_runs_conversation_id_2" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations" ("id") ON DELETE SET NULL;
ALTER TABLE "audit_logs" ADD CONSTRAINT "fk_audit_logs_user_id_1" FOREIGN KEY ("user_id") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "cart_items" ADD CONSTRAINT "fk_cart_items_cart_id_1" FOREIGN KEY ("cart_id") REFERENCES "carts" ("id") ON DELETE CASCADE;
ALTER TABLE "carts" ADD CONSTRAINT "fk_carts_guest_id_1" FOREIGN KEY ("guest_id") REFERENCES "guest_sessions" ("guest_id") ON DELETE CASCADE;
ALTER TABLE "carts" ADD CONSTRAINT "fk_carts_user_id_2" FOREIGN KEY ("user_id") REFERENCES "customers" ("id") ON DELETE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_parent_id_1" FOREIGN KEY ("parent_id") REFERENCES "categories" ("id") ON DELETE SET NULL;
ALTER TABLE "cms_elements" ADD CONSTRAINT "fk_cms_elements_page_id_1" FOREIGN KEY ("page_id") REFERENCES "cms_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "cms_published" ADD CONSTRAINT "fk_cms_published_page_id_1" FOREIGN KEY ("page_id") REFERENCES "cms_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "cms_revisions" ADD CONSTRAINT "fk_cms_revisions_user_id_1" FOREIGN KEY ("user_id") REFERENCES "admin_users" ("id") ON DELETE SET NULL;
ALTER TABLE "cms_revisions" ADD CONSTRAINT "fk_cms_revisions_page_id_2" FOREIGN KEY ("page_id") REFERENCES "cms_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "content_blocks" ADD CONSTRAINT "fk_content_blocks_section_id_1" FOREIGN KEY ("section_id") REFERENCES "page_sections" ("id") ON DELETE CASCADE;
ALTER TABLE "customer_requests" ADD CONSTRAINT "fk_customer_requests_customer_id_1" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE SET NULL;
ALTER TABLE "media" ADD CONSTRAINT "fk_media_folder_id_1" FOREIGN KEY ("folder_id") REFERENCES "media_folders" ("id") ON DELETE SET NULL;
ALTER TABLE "media_folders" ADD CONSTRAINT "fk_media_folders_parent_id_1" FOREIGN KEY ("parent_id") REFERENCES "media_folders" ("id") ON DELETE CASCADE;
ALTER TABLE "notification_channels" ADD CONSTRAINT "fk_notification_channels_notification_id_1" FOREIGN KEY ("notification_id") REFERENCES "notifications" ("id") ON DELETE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_order_id_1" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer_id_1" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE SET NULL;
ALTER TABLE "page_sections" ADD CONSTRAINT "fk_page_sections_page_id_1" FOREIGN KEY ("page_id") REFERENCES "pages" ("id") ON DELETE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_order_id_1" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE;
ALTER TABLE "product_colors" ADD CONSTRAINT "fk_product_colors_product_id_1" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "product_documents" ADD CONSTRAINT "fk_product_documents_product_id_1" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "product_faq" ADD CONSTRAINT "fk_product_faq_product_id_1" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "fk_product_images_product_id_1" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "product_specs" ADD CONSTRAINT "fk_product_specs_product_id_1" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "product_tags" ADD CONSTRAINT "fk_product_tags_product_id_1" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "fk_products_subcategory_id_1" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories" ("id") ON DELETE SET NULL;
ALTER TABLE "products" ADD CONSTRAINT "fk_products_department_id_2" FOREIGN KEY ("department_id") REFERENCES "departments" ("id");
ALTER TABLE "products" ADD CONSTRAINT "fk_products_category_id_3" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL;
ALTER TABLE "related_products" ADD CONSTRAINT "fk_related_products_related_product_id_1" FOREIGN KEY ("related_product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "related_products" ADD CONSTRAINT "fk_related_products_product_id_2" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "fk_role_permissions_role_id_1" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
ALTER TABLE "subcategories" ADD CONSTRAINT "fk_subcategories_department_id_1" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE CASCADE;
ALTER TABLE "wishlist_items" ADD CONSTRAINT "fk_wishlist_items_wishlist_id_1" FOREIGN KEY ("wishlist_id") REFERENCES "wishlists" ("id") ON DELETE CASCADE;
ALTER TABLE "wishlists" ADD CONSTRAINT "fk_wishlists_guest_id_1" FOREIGN KEY ("guest_id") REFERENCES "guest_sessions" ("guest_id") ON DELETE CASCADE;
ALTER TABLE "wishlists" ADD CONSTRAINT "fk_wishlists_user_id_2" FOREIGN KEY ("user_id") REFERENCES "customers" ("id") ON DELETE CASCADE;
