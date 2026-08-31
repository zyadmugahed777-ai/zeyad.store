-- Product variants: per-size pricing, and images tied to a colour.
--
-- Operator-approved schema change, 2026-08-28.
--
-- Purely additive. No existing column is altered or dropped, every new column
-- is nullable or defaulted, and the new table starts empty -- so all 437
-- existing products behave exactly as they did. A product shows sizes only
-- once someone adds sizes to it; a product with none stays a single-price
-- product, which is the behaviour the operator asked for explicitly.
--
-- Rollback lives beside this file as 2026-08-28-product-variants.down.sql.

BEGIN;

-- 1. Sizes, each with its own price ---------------------------------------
-- A washing machine sold as 6kg and 7kg is one product with two sizes at two
-- prices, not two products. price is the full price for that size, not a
-- delta, so the checkout total never has to reason about a base price.
CREATE TABLE IF NOT EXISTS product_sizes (
  id          BIGSERIAL PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label       TEXT   NOT NULL,
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_sizes_product ON product_sizes (product_id, sort_order);

-- The same label must not appear twice on one product, or the customer would
-- be shown two identical choices at different prices.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_sizes_label ON product_sizes (product_id, label);

-- 2. An image can belong to a colour ---------------------------------------
-- Pick "أزرق" on the product page and you should see the blue room, not the
-- default photo. Nullable: an image with no colour is a general product photo
-- and keeps behaving as one.
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS color_name TEXT;

CREATE INDEX IF NOT EXISTS idx_product_images_color ON product_images (product_id, color_name);

-- 3. The order records what was actually chosen ----------------------------
-- selected_color and image_url already exist. The size was the missing half,
-- along with the price that size carried at the time of the order -- prices
-- change, and an order must keep what the customer actually agreed to pay.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size_price NUMERIC(12,2);

COMMIT;
