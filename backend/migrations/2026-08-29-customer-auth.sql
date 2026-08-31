-- ---------------------------------------------------------------------------
-- Customer accounts & authentication
--
-- Additive only. No column is dropped, no row is touched, no data is deleted.
-- Every statement is IF NOT EXISTS / IF EXISTS so the file is safe to re-run,
-- and 2026-08-29-customer-auth.down.sql reverses it exactly.
--
-- Existing customers were created implicitly at checkout and therefore have no
-- password. password_hash stays NULL for them: a NULL hash means "this row is
-- a contact record, not a login", and the login path refuses it outright
-- rather than comparing against NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "password_updated_at" TIMESTAMPTZ;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMPTZ;

-- The phone number is the customer's identity, so the database -- not the
-- browser, and not an application-level "does this exist yet?" check that two
-- concurrent registrations can both pass -- is what makes it unique. This
-- index already exists on the live schema; the statement is here so a database
-- built from migrations alone ends up identical.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customers_phone" ON "customers" ("phone");

-- Login resolves a customer by phone on every attempt. idx_customers_phone
-- already covers that lookup, and uq_customers_phone covers it again; no new
-- index is added here, because an index nothing queries still costs every
-- write.
