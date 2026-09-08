-- Real customer reviews.
--
-- Why this table has to exist before a single star is published
-- -------------------------------------------------------------
-- products.rating and products.reviews_count already hold numbers, and they
-- always have: they were seeded when the catalogue was imported and no
-- customer ever wrote them. Google's Search Console asks for aggregateRating
-- and review on every product, and the tempting move is to hand it those two
-- columns. That is review fraud as Google defines it, and the penalty is not
-- losing the stars -- it is a manual action against the whole domain.
--
-- So the stars stay unpublished until they are earned. This is the table that
-- earns them.
--
-- The rules it enforces in the schema rather than in application code, because
-- application code is one forgotten branch away from not enforcing anything:
--
--   * rating is 1..5. A CHECK constraint, so no route can write a 0 or a 7.
--   * one review per customer per product. A UNIQUE index, so a refresh or a
--     double-tapped submit cannot stack five reviews from one person.
--   * status starts 'pending'. Nothing reaches a shopper, or a crawler, until
--     an operator approves it.
--   * customer_id is NOT NULL. Anonymous reviews are the whole attack surface
--     of a review system; only a logged-in customer may write one.
--
-- author_name is a snapshot, deliberately. A review displayed for two years
-- should keep the name it was written under even if the customer later edits
-- their profile, and joining to customers on every read to render a first name
-- is work the product page does not need to do.

CREATE TABLE IF NOT EXISTS "product_reviews" (
  "id" BIGSERIAL PRIMARY KEY,
  "product_id" BIGINT NOT NULL,
  "customer_id" BIGINT NOT NULL,
  "author_name" TEXT NOT NULL,
  "rating" SMALLINT NOT NULL,
  "body" TEXT NOT NULL,
  -- pending | approved | rejected. Rejected rows are kept rather than deleted
  -- so the same customer cannot simply resubmit what was already refused.
  "status" TEXT NOT NULL DEFAULT 'pending',
  -- True when this customer has a delivered order containing this product.
  -- Computed at submission time from order_items; never taken from the client.
  "is_verified_purchase" BOOLEAN DEFAULT FALSE,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT "product_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "product_reviews_status_known" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);

-- One voice per customer per product.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_reviews_one_per_customer"
  ON "product_reviews" ("product_id", "customer_id");

-- The product page reads approved reviews for one product, newest first.
CREATE INDEX IF NOT EXISTS "idx_product_reviews_product_status"
  ON "product_reviews" ("product_id", "status", "created_at" DESC);

-- The moderation queue reads everything pending, oldest first.
CREATE INDEX IF NOT EXISTS "idx_product_reviews_status_created"
  ON "product_reviews" ("status", "created_at");
