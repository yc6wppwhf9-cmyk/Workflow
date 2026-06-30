-- New workflow gate after BOM: "Costing & Naming", owned by Tejashree (bom role).
-- She sets the rangewise product name (Naam Karan) and ticks the MD costing-approved
-- checkbox, then advances the product to Marketing.
-- Run on production DB (project unuggtqicilzzzxxtizd).

-- 1. New workflow_stage enum value. (App stage ordering is driven by the JS
--    WORKFLOW_STAGES array, so the enum's internal position does not matter.)
ALTER TYPE workflow_stage ADD VALUE IF NOT EXISTS 'costing_naming';

-- 2. Rangewise naming + MD costing approval columns on products.
--    NB: "range" is a reserved keyword, so the column is named product_range.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_range        text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS md_costing_approved  boolean NOT NULL DEFAULT false;
