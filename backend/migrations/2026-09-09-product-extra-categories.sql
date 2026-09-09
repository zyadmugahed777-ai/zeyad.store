-- A product may appear in more than one category.
--
-- The request, in the operator's words: "add the ability to put the product in
-- an additional department or category -- for example put it in the Malaysian
-- one and the Swedish one. And of course this option is optional."
--
-- That is a real shape in this catalogue. "غرف ماليزي" and "غرف سويدي" are two
-- categories under the bedrooms department, and a wardrobe can honestly belong
-- in both. Until now products.category_id held exactly one, so listing a piece
-- in a second category meant duplicating the product -- two rows, two sets of
-- photographs, two prices to keep in step, and two entries in a shopper's
-- search results for one physical item.
--
-- Why a table and not more columns
-- --------------------------------
-- A category_id_2 would answer today's request and fail the next one, and
-- every read path would have to remember to check both columns. A join table
-- has no such ceiling and no such trap: a product with no extra categories has
-- no rows here, which is exactly what "optional" should cost.
--
-- What this deliberately does NOT change
-- --------------------------------------
-- products.category_id stays exactly as it is and keeps its meaning: the
-- PRIMARY category. It is what the breadcrumb shows, what the product page
-- names, and what every existing query already reads. Nothing about this
-- migration alters an existing row or an existing read path -- a deployment
-- that applies it and then runs the old code behaves identically, because
-- until something writes to this table it is empty.
--
-- The primary category is never duplicated in here. One place holds the answer
-- to "which category is this product's own", and it is not this table.

CREATE TABLE IF NOT EXISTS "product_categories" (
  "product_id" BIGINT NOT NULL,
  "category_id" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  -- A product cannot be added to the same category twice, whatever the form
  -- posts. Enforced here rather than in a route, because a route is one
  -- forgotten branch away from not enforcing anything.
  PRIMARY KEY ("product_id", "category_id")
);

-- Deleting a product must not leave its extra placements behind, pointing at
-- a row that no longer exists and quietly listing a ghost on a category page.
-- Same for a deleted category.
ALTER TABLE "product_categories"
  DROP CONSTRAINT IF EXISTS "product_categories_product_fk";
ALTER TABLE "product_categories"
  ADD CONSTRAINT "product_categories_product_fk"
  FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE;

ALTER TABLE "product_categories"
  DROP CONSTRAINT IF EXISTS "product_categories_category_fk";
ALTER TABLE "product_categories"
  ADD CONSTRAINT "product_categories_category_fk"
  FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE;

-- The admin form reads every extra category for one product.
-- (The primary key already covers this direction, but naming it makes the
-- intent legible and costs nothing.)

-- The storefront sync reads every product in one category.
CREATE INDEX IF NOT EXISTS "idx_product_categories_category"
  ON "product_categories" ("category_id");
