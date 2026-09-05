-- Restores a falsy-looking-but-truthy '0' in place of the empty string. There
-- is no reason to run this; it exists so every migration in the ledger has a
-- mate, and so the shape of what was changed is on the record.
UPDATE "products" SET "installation" = '0' WHERE coalesce("installation", '') = '';
