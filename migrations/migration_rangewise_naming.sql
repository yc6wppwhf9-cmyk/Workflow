-- Rangewise product naming: "<RANGE> <NNN>" (e.g. ROCK 001, CUPCAKE 012).
--
-- Why: products.name had four writers and no precedence, so the last one won.
--   1. Creation set a placeholder — "Backpack PRIORITY MSA0PMC4".
--   2. The tech pack upload overwrote it with the sheet's STYLE NAME, which is a
--      generic descriptor ("LAPTOP", "COLLEGE BACKPACK") — six products ended up
--      named LAPTOP.
--   3. EVERY merchandising Excel upload overwrote name + display_name again, so a
--      deliberately assigned name was silently clobbered by a later re-upload.
--   4. The Costing & Naming gate set the real name last — and step 3 could undo it.
--
-- After this migration the range and its sequence number are stored as data, the
-- name is derived from them, and product_range doubles as the "this name was
-- assigned on purpose" flag that the upload paths check before renaming.
--
-- Safe to run more than once.

-- 1. The range (collection/family, e.g. ROCK) and its number within that range.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_range text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS range_seq     integer;

-- 2. Two products must never share a number inside the same range. Stored
--    normalised (upper-case, whitespace collapsed) so "Rock 1" and "ROCK  1"
--    cannot both be taken.
CREATE UNIQUE INDEX IF NOT EXISTS products_range_seq_key
  ON products (upper(btrim(product_range)), range_seq)
  WHERE product_range IS NOT NULL AND range_seq IS NOT NULL;

-- 3. Looking up the next free number in a range is the hot path when naming.
CREATE INDEX IF NOT EXISTS products_product_range_idx
  ON products (upper(btrim(product_range)))
  WHERE product_range IS NOT NULL;

-- Note: this migration deliberately does NOT backfill existing rows. Products
-- named by hand ("CONNECT 003") keep their name; leaving product_range NULL marks
-- them as not-yet-assigned, so the naming gate can adopt them when someone
-- actually chooses a range. Backfilling by guessing the range from the name would
-- silently claim sequence numbers nobody agreed to.
