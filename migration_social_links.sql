-- Add social_links column to marketing_data
-- Stores [{platform: string, url: string}] as jsonb

ALTER TABLE marketing_data
  ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '[]'::jsonb;
