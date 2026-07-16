-- Add family/range name to products
-- Run this in Supabase SQL editor before deploying the family_name feature

ALTER TABLE products ADD COLUMN IF NOT EXISTS family_name TEXT;

-- Index for fast sibling queries
CREATE INDEX IF NOT EXISTS products_family_name_idx ON products (family_name) WHERE family_name IS NOT NULL;
