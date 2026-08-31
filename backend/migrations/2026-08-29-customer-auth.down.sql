-- ---------------------------------------------------------------------------
-- Reverses 2026-08-29-customer-auth.sql.
--
-- Dropping these columns destroys every customer password. That is the point
-- of a down migration, but it means this file must never be run casually --
-- only as a deliberate rollback of the customer-accounts feature, and only
-- with the operator's explicit go-ahead.
--
-- uq_customers_phone is deliberately NOT dropped: it predates this migration
-- and protects customer identity independently of passwords.
-- ---------------------------------------------------------------------------

ALTER TABLE "customers" DROP COLUMN IF EXISTS "last_login_at";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "password_updated_at";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "password_hash";
