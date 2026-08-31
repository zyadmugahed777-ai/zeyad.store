-- ---------------------------------------------------------------------------
-- Brand rename: the storefront now trades as "زياد ستور".
--
-- The visible brand does not live in the code. It lives in two places in the
-- database, both admin-editable, and both still holding the former trading
-- name -- so renaming the brand in the source alone changed nothing a visitor
-- would see: the CMS override put the old name straight back into the footer
-- of all 71 pages on the next request.
--
--   settings.store_name_ar / store_name_en / site_name
--       read by the WhatsApp message templates and the admin settings screen.
--   cms_elements / cms_published, element_key = 'store_name'
--       the footer heading and the copyright line on every page.
--
-- Data only. No table is created, altered or dropped, no row is deleted, and
-- nothing outside these named keys is touched.
--
-- Idempotent and conservative: every statement is guarded on the OLD value, so
-- running it twice does nothing the second time, and -- more importantly -- if
-- an operator has since set a different name of their own through the admin
-- panel, this leaves their choice alone rather than overwriting it.
--
-- Reversal: 2026-08-30-brand-rename-zeyad-store.down.sql restores the previous
-- values exactly.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Settings -------------------------------------------------------------
-- The stored value carried a branch suffix ("- المقر الرئيسي", "head office").
-- That is a location, not part of the company name, and it was leaking into
-- WhatsApp messages sent to customers as though it were. The rename drops it.
UPDATE settings
   SET value = 'زياد ستور'
 WHERE key IN ('store_name_ar', 'site_name')
   AND value = 'زياد للتجارة - المقر الرئيسي';

UPDATE settings
   SET value = 'Zeyad Store'
 WHERE key = 'store_name_en'
   AND value = 'زياد للتجارة - المقر الرئيسي';

-- 2. The CMS footer element ------------------------------------------------
-- element_key 'store_name' is shared across every page (cms-repo.js selects it
-- from page_id = 1 for all pages alongside the header_/footer_ keys), so the
-- single row below is what renders in all 71 footers.
UPDATE cms_elements
   SET content = 'زياد ستور',
       updated_at = NOW()
 WHERE element_key = 'store_name'
   AND content = 'زياد للتجارة';

-- The published copy is what the public site actually reads; the draft table
-- above is what the editor shows. Both must move or the panel and the live
-- site disagree about the brand.
UPDATE cms_published
   SET content = 'زياد ستور'
 WHERE element_key = 'store_name'
   AND content = 'زياد للتجارة';

COMMIT;
