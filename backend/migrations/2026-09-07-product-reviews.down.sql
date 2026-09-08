-- zfb:allow-destructive
-- Dropping this discards every review customers have written. It is here so
-- the ledger has a mate for the forward migration, not because there is any
-- ordinary reason to run it. Take a verified backup first.
DROP INDEX IF EXISTS "idx_product_reviews_status_created";
DROP INDEX IF EXISTS "idx_product_reviews_product_status";
DROP INDEX IF EXISTS "idx_product_reviews_one_per_customer";
DROP TABLE IF EXISTS "product_reviews";
