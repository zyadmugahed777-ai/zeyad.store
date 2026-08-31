-- ---------------------------------------------------------------------------
-- Reverse 2026-08-30-brand-rename-zeyad-store.sql
--
-- Restores the exact values the rename replaced, including the "- المقر الرئيسي"
-- suffix the settings rows carried before.
--
-- Guarded on the new value, so this only undoes the rename itself: a name an
-- operator has set deliberately since then is left alone.
--
-- Never applied automatically. scripts/migrate.js does not execute .down.sql --
-- run this by hand, with a backup, only if the rename must be reverted.
-- ---------------------------------------------------------------------------

BEGIN;

UPDATE settings
   SET value = 'زياد للتجارة - المقر الرئيسي'
 WHERE key IN ('store_name_ar', 'site_name')
   AND value = 'زياد ستور';

UPDATE settings
   SET value = 'زياد للتجارة - المقر الرئيسي'
 WHERE key = 'store_name_en'
   AND value = 'Zeyad Store';

UPDATE cms_elements
   SET content = 'زياد للتجارة',
       updated_at = NOW()
 WHERE element_key = 'store_name'
   AND content = 'زياد ستور';

UPDATE cms_published
   SET content = 'زياد للتجارة'
 WHERE element_key = 'store_name'
   AND content = 'زياد ستور';

COMMIT;
