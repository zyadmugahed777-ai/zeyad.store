-- zfb:allow-destructive
-- Dropping this discards every additional-category placement an operator has
-- made. No product is lost -- products.category_id holds the primary category
-- and this migration never touched it -- but the second and third categories a
-- piece was listed in are gone, and there is no record of them anywhere else.
-- It is here so the ledger has a mate for the forward migration, not because
-- there is any ordinary reason to run it.
DROP INDEX IF EXISTS "idx_product_categories_category";
DROP TABLE IF EXISTS "product_categories";
