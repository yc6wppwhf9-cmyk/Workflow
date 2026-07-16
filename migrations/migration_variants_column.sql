ALTER TABLE design_data ADD COLUMN IF NOT EXISTS variants jsonb DEFAULT '[]'::jsonb;
