-- products.installation is a TEXT column being used as a yes/no flag.
--
-- The admin form writes 1 or 0 into it, PostgreSQL stores it as text, and
-- every reader then asks `if (product.installation)`. In JavaScript the string
-- '0' is TRUE. So a product saved with the box UNCHECKED came back with the
-- box CHECKED, and the product page printed the stored characters where the
-- installation line should have been. The operator ticked nothing and the shop
-- promised free installation on everything.
--
-- What is actually in the column on the live shop, measured rather than
-- assumed (435 rows):
--
--     'غير متوفر'  394   -- prose meaning "not available"
--     '0.0'         21   -- a NUMERIC round-trip of false
--     ''            12   -- honestly empty
--     '1.0'          8   -- a NUMERIC round-trip of true
--
-- Two of those four spellings are false and both of them are true in
-- JavaScript. '0.0' is also what the product page was printing to customers,
-- verbatim, in place of the installation line.
--
-- Readers are being fixed to use an explicit predicate, but leaving '0.0' in
-- the column keeps the trap loaded for the next person who writes the obvious
-- `if (installation)`. Normalise the stored values so falsehood is stored as
-- something actually falsy and truth as a plain '1'.
--
-- A row holding any other prose is left exactly as it is -- the column doubles
-- as free text on the product page and that text is the operator's, not ours.

-- Numeric spellings: 0, 0.0, 0.00 are false; any other number is true.
UPDATE "products"
   SET "installation" = ''
 WHERE btrim(coalesce("installation", '')) ~ '^[0-9]+(\.[0-9]+)?$'
   AND btrim("installation")::NUMERIC = 0;

UPDATE "products"
   SET "installation" = '1'
 WHERE btrim(coalesce("installation", '')) ~ '^[0-9]+(\.[0-9]+)?$'
   AND btrim("installation")::NUMERIC <> 0;

-- Word spellings, in both languages the panel and the storefront use.
UPDATE "products"
   SET "installation" = ''
 WHERE lower(btrim(coalesce("installation", ''))) IN
       ('false', 'no', 'off', 'null', 'none', 'غير متوفر', 'لا', 'لا يوجد');

UPDATE "products"
   SET "installation" = '1'
 WHERE lower(btrim(coalesce("installation", ''))) IN
       ('true', 'yes', 'on', 'متوفر', 'نعم');
