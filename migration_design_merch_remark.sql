-- Design-wise remarks written by the merchandising head for the assigned designer.
-- Stored as a JSON map keyed by variant/design index, e.g. {"4": "colour/fabric not available"}.
-- Run on production DB (project unuggtqicilzzzxxtizd).
ALTER TABLE design_data ADD COLUMN IF NOT EXISTS merch_remarks jsonb NOT NULL DEFAULT '{}'::jsonb;
