-- Where a product is allowed to appear.
--
-- Until now a product went everywhere or nowhere: creating one put it in its
-- department page, in search, in Najm's answers and (if the page had been
-- wired at all) anywhere else that listed products. There was no way to say
-- "this one is a special order, keep it out of the home page" or, more to the
-- point, "put this one on the offers page" -- the offers page was still
-- showing hardcoded demo cards because nothing in the database could express
-- membership of it.
--
-- Five independent switches, because they are genuinely independent: a product
-- can be hidden from the home page and still be findable in search, and an
-- offer can be promoted to the offers page without leaving its department.
--
-- Defaults preserve today's behaviour exactly. Every existing product keeps
-- appearing everywhere it already appears (TRUE), and none is silently
-- promoted onto the offers page (FALSE) -- an editorial page must be filled
-- deliberately, not by a migration guessing.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_in_department" BOOLEAN DEFAULT TRUE;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_on_home"       BOOLEAN DEFAULT TRUE;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_in_search"     BOOLEAN DEFAULT TRUE;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_in_najm"       BOOLEAN DEFAULT TRUE;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "show_in_offers"     BOOLEAN DEFAULT FALSE;

-- ADD COLUMN with a default fills existing rows, but a column that already
-- existed from an earlier partial run could still hold NULLs. NULL is not the
-- same as FALSE to a WHERE clause, and a NULL here would make a product vanish
-- from its own department page.
UPDATE "products" SET "show_in_department" = TRUE  WHERE "show_in_department" IS NULL;
UPDATE "products" SET "show_on_home"       = TRUE  WHERE "show_on_home"       IS NULL;
UPDATE "products" SET "show_in_search"     = TRUE  WHERE "show_in_search"     IS NULL;
UPDATE "products" SET "show_in_najm"       = TRUE  WHERE "show_in_najm"       IS NULL;
UPDATE "products" SET "show_in_offers"     = FALSE WHERE "show_in_offers"     IS NULL;

CREATE INDEX IF NOT EXISTS "idx_products_show_in_offers" ON "products" ("show_in_offers");
CREATE INDEX IF NOT EXISTS "idx_products_show_on_home"   ON "products" ("show_on_home");
