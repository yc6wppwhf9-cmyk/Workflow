-- Add tech pack PDF URL storage to design_data
ALTER TABLE design_data ADD COLUMN IF NOT EXISTS techpack_pdf_url text;
