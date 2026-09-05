-- zfb:allow-destructive
-- Dropping these columns discards every placement decision the shop has made.
-- Never run this against production without a verified backup.
DROP INDEX IF EXISTS "idx_products_show_on_home";
DROP INDEX IF EXISTS "idx_products_show_in_offers";
ALTER TABLE "products" DROP COLUMN IF EXISTS "show_in_offers";
ALTER TABLE "products" DROP COLUMN IF EXISTS "show_in_najm";
ALTER TABLE "products" DROP COLUMN IF EXISTS "show_in_search";
ALTER TABLE "products" DROP COLUMN IF EXISTS "show_on_home";
ALTER TABLE "products" DROP COLUMN IF EXISTS "show_in_department";
