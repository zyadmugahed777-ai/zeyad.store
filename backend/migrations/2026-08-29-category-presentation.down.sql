-- Rollback for 2026-08-29-category-presentation.sql
--
-- Never applied automatically. Run it by hand, and only after confirming that
-- no deployed application version still reads categories.display_style --
-- otherwise every category tile loses its presentation setting while the code
-- that expects it is still live.
--
-- Dropping the column discards whatever presentation choices operators have
-- made since the migration ran. Those choices are not recoverable from
-- anywhere else, so back the table up first.

-- zfb:allow-destructive

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_display_style_check;
ALTER TABLE categories DROP COLUMN IF EXISTS display_style;
