-- Run this in the Supabase SQL editor before deploying the category/sub-category update.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category text;
