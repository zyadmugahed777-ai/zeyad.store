-- Rollback for 2026-08-28-product-variants.sql
--
-- Safe to run only while nothing depends on these. Dropping product_sizes
-- discards any sizes an operator has entered, so take a backup first if the
-- feature has been in use.

BEGIN;

DROP INDEX IF EXISTS uq_product_sizes_label;
DROP INDEX IF EXISTS idx_product_sizes_product;
DROP TABLE IF EXISTS product_sizes;

DROP INDEX IF EXISTS idx_product_images_color;
ALTER TABLE product_images DROP COLUMN IF EXISTS color_name;

ALTER TABLE order_items DROP COLUMN IF EXISTS selected_size;
ALTER TABLE order_items DROP COLUMN IF EXISTS selected_size_price;

COMMIT;
