-- STEP 1 of 2 — run this file ON ITS OWN and let it finish.
--
-- Postgres will not let a new enum value be USED in the same transaction that
-- created it ("unsafe use of new value ... New enum values must be committed
-- before they can be used"), and the Supabase SQL editor runs a script as one
-- transaction. So the role is added here, alone, and everything that uses it
-- lives in step 2.
--
-- Run on production DB (project unuggtqicilzzzxxtizd).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'bom_head';
