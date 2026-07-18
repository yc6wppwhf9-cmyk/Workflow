-- The "Short Name (alias)" feature writes products.display_name, but the column
-- was never added to the production DB — so saving it 500s ("column does not
-- exist") and it always read as "Not set". This adds the missing column.
-- Run on production DB (project unuggtqicilzzzxxtizd).
ALTER TABLE products ADD COLUMN IF NOT EXISTS display_name text;
