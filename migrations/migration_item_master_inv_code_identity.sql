-- Item master: make INV CODE the row identity (was ITEM NAME).
--
-- Why: the importer upserted on item_name_norm, so the NAME was the identity.
-- Two bad consequences:
--   1. A renamed item (e.g. INV25862 "…PLN 52 DGR" -> "…PLN 52 LGR") did not
--      match its existing row, so the import inserted a SECOND row for the same
--      INV code — or failed outright.
--   2. Two different INV codes that legitimately share a name collapsed into
--      one row, silently losing a code (28 such rows in the July 2026 master).
--
-- After this migration inv_code is unique, item_name_norm is a plain lookup
-- index, and import_batch lets the importer prune codes that no longer exist
-- in the uploaded file (a true replace instead of a merge).
--
-- Safe to run more than once.

-- 1. Track which import wrote each row, so stale rows can be pruned.
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS import_batch text;

-- 2. Drop rows that cannot have an identity.
DELETE FROM item_master WHERE inv_code IS NULL OR btrim(inv_code) = '';

-- 3. Collapse pre-existing duplicate INV codes, keeping the physically newest
--    row. ctid is used because it exists whatever the table's key layout is.
DELETE FROM item_master a
USING item_master b
WHERE a.inv_code = b.inv_code
  AND a.ctid < b.ctid;

-- 4. Remove the old uniqueness on the name, whatever it was called
--    (constraint or bare unique index).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname AS name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'item_master'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%item_name_norm%'
  LOOP
    EXECUTE format('ALTER TABLE item_master DROP CONSTRAINT %I', r.name);
  END LOOP;

  FOR r IN
    SELECT i.relname AS name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    WHERE t.relname = 'item_master'
      AND x.indisunique
      AND NOT x.indisprimary
      AND pg_get_indexdef(x.indexrelid) ILIKE '%item_name_norm%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.name);
  END LOOP;
END $$;

-- 5. Name stays indexed — the merch Excel import still looks items up by name.
CREATE INDEX IF NOT EXISTS item_master_item_name_norm_idx
  ON item_master (item_name_norm);

-- 6. The new identity.
CREATE UNIQUE INDEX IF NOT EXISTS item_master_inv_code_key
  ON item_master (inv_code);
