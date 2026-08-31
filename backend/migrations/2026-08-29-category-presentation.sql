-- Category presentation: let the admin choose how a category is drawn.
--
-- Why
-- ---
-- Every category on the storefront was drawn identically because the frontend
-- had no way to be told otherwise. Bedrooms wants large lifestyle cards;
-- appliances wants a denser grid of product cut-outs; solar reads better as
-- circles. That is a presentation decision an operator should be able to make
-- per category without a developer editing CSS.
--
-- Why a column and not configuration
-- ----------------------------------
-- The choice belongs to the category, varies per row, and has to survive in the
-- same place the category's name and image already live. There is nowhere else
-- for it to go that does not amount to a second, parallel category store.
--
-- Safety
-- ------
-- Purely additive and reversible:
--   * no existing column is altered or dropped
--   * no existing row is rewritten
--   * the new column is nullable with a default
--   * NULL and 'card' mean the same thing, so all 43 existing categories render
--     exactly as they do today until somebody deliberately changes one
-- An older build of the application ignores the column entirely, so the old app
-- runs against the new database without noticing -- which is what makes it safe
-- to migrate before deploying.
--
-- Rollback lives beside this file as 2026-08-29-category-presentation.down.sql.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_style TEXT;

-- The set is deliberately small and closed. An unrecognised value falls back to
-- 'card' in the renderer, so a typo degrades to the default rather than to a
-- blank tile; the constraint stops the typo reaching the database in the first
-- place.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_display_style_check'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_display_style_check
      CHECK (display_style IS NULL OR display_style IN ('card', 'circle', 'pill', 'compact'));
  END IF;
END $$;
