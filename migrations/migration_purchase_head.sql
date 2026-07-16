-- Add purchase_head role and purchase forwarding to new_developments
-- Run this if the new_development tables already exist in Supabase

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'purchase_head';

ALTER TABLE new_developments ADD COLUMN IF NOT EXISTS purchase_status  TEXT;
ALTER TABLE new_developments ADD COLUMN IF NOT EXISTS purchase_sent_at TIMESTAMPTZ;
ALTER TABLE new_developments ADD COLUMN IF NOT EXISTS purchase_sent_by UUID REFERENCES profiles(id);
ALTER TABLE new_developments ADD COLUMN IF NOT EXISTS purchase_remarks TEXT;

ALTER TABLE new_development_files ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';

-- Update RLS to include purchase_head
DROP POLICY IF EXISTS "nd_select"  ON new_developments;
DROP POLICY IF EXISTS "ndf_select" ON new_development_files;

CREATE POLICY "nd_select" ON new_developments FOR SELECT USING (
  auth.uid() = created_by
  OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('design_head', 'merchandising_head', 'admin', 'management', 'purchase_head')
);

CREATE POLICY "ndf_select" ON new_development_files FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM new_developments nd WHERE nd.id = development_id AND (
      nd.created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('design_head', 'merchandising_head', 'admin', 'management', 'purchase_head')
    )
  )
);
