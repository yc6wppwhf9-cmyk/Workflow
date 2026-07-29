-- Retire the standalone "Costing & Naming" stage.
--
-- MD costing approval is now enforced inside BOM approval (the head must tick it
-- before approving), and naming can be done at any time — so the separate stage
-- is redundant and has been removed from the workflow bar.
--
-- Move any product still sitting there back to BOM so it isn't stranded on a
-- stage the app no longer displays.
-- Run on production DB (project unuggtqicilzzzxxtizd).

UPDATE products SET workflow_stage = 'bom_finalized' WHERE workflow_stage = 'costing_naming';

-- Verify (expect 0 rows)
SELECT id, name, workflow_stage FROM products WHERE workflow_stage = 'costing_naming';
