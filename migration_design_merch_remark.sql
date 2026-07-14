-- Design-specific remark written by the merchandising head for the assigned designer.
-- Run on production DB (project unuggtqicilzzzxxtizd).
ALTER TABLE design_data ADD COLUMN IF NOT EXISTS merch_remark text;
