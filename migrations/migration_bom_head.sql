

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'bom_head';

-- Assignment + approval tracking on the BOM record
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS assigned_to            UUID REFERENCES profiles(id);
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS submitted_for_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS submitted_at          TIMESTAMPTZ;
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS approved_by           UUID REFERENCES profiles(id);
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ;

-- Tejashree becomes the BOM head. Run AFTER the ALTER TYPE above is committed.
UPDATE profiles SET role = 'bom_head' WHERE email = 'tejashree.kalsulkar@hscvpl.com';

-- Hemant (BOM team member) is a NEW account — create him via Admin → Users with
-- role = BOM once his @hscvpl.com email is known.
