-- STEP 2 of 2 — run only AFTER step 1 has completed successfully.
-- (Step 1 adds the 'bom_head' enum value; it must be committed before use.)
--
-- BOM team structure: a head (Tejashree) assigns work and approves it; team
-- members (Hemant) fill the BOM and submit it for approval.
-- Run on production DB (project unuggtqicilzzzxxtizd).

-- Assignment + approval tracking on the BOM record
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS assigned_to            UUID REFERENCES profiles(id);
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS submitted_for_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS submitted_at           TIMESTAMPTZ;
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS approved_by            UUID REFERENCES profiles(id);
ALTER TABLE bom_data ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ;

-- Tejashree becomes the BOM head
UPDATE profiles SET role = 'bom_head' WHERE email = 'tejashree.kalsulkar@hscvpl.com';

-- Verify
SELECT full_name, email, role FROM profiles WHERE email = 'tejashree.kalsulkar@hscvpl.com';

-- Hemant (BOM team member) is a NEW account — create him via Admin → Users with
-- role = BOM once his @hscvpl.com email is known.
