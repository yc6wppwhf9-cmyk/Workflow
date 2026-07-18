-- Remove the "draft" (Sales) stage from the workflow. Products now start at Design;
-- the sales brief is still captured at product creation and editable in the Sales tab.
-- Run on production DB (project unuggtqicilzzzxxtizd) — ideally right after deploying.
--
-- NB: Postgres can't drop an enum value, so 'draft' remains a valid (now unused)
-- workflow_stage value; the app no longer produces or expects it.

-- Move any existing draft products into the Design stage.
UPDATE products SET workflow_stage = 'design_completed' WHERE workflow_stage = 'draft';

-- New products default to Design instead of draft.
ALTER TABLE products ALTER COLUMN workflow_stage SET DEFAULT 'design_completed';
