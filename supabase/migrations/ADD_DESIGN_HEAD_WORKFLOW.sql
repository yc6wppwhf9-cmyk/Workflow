-- ============================================================
-- Design Head Workflow Migration
-- Run this in Supabase SQL Editor (not via CLI migration runner,
-- because ALTER TYPE ADD VALUE cannot run inside a transaction).
-- ============================================================

-- 1. Add design_head to the user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'design_head';

-- 2. Add assigned_to column to design_data
ALTER TABLE design_data
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id);

-- 3. Create design_submissions table
CREATE TABLE IF NOT EXISTS design_submissions (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  submitted_by uuid REFERENCES profiles(id) NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback     text,
  reviewed_by  uuid REFERENCES profiles(id),
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS ds_product_idx   ON design_submissions(product_id);
CREATE INDEX IF NOT EXISTS ds_submitter_idx ON design_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS ds_status_idx    ON design_submissions(status);

-- RLS
ALTER TABLE design_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ds_select" ON design_submissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "ds_insert" ON design_submissions
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "ds_update" ON design_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'design_head')
    )
    OR auth.uid() = submitted_by
  );

-- 4. Update advance_product_stage() to also allow design_head in draft stage
CREATE OR REPLACE FUNCTION advance_product_stage(
  p_product_id uuid,
  p_next_stage workflow_stage,
  p_user_id    uuid,
  p_action     text,
  p_department text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stage workflow_stage;
  v_role          user_role;
BEGIN
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized user ID';
  END IF;

  SELECT role          INTO v_role          FROM profiles WHERE id = p_user_id;
  SELECT workflow_stage INTO v_current_stage FROM products  WHERE id = p_product_id;

  IF v_role <> 'admin' THEN
    IF v_current_stage = 'draft'
       AND v_role NOT IN ('design', 'design_head') THEN
      RAISE EXCEPTION 'Only design team or admin can advance from draft';
    ELSIF v_current_stage = 'design_completed'
       AND v_role <> 'merchandising' THEN
      RAISE EXCEPTION 'Only merchandising team or admin can advance from design_completed';
    ELSIF v_current_stage = 'merchandising_completed'
       AND v_role <> 'bom' THEN
      RAISE EXCEPTION 'Only BOM team or admin can advance from merchandising_completed';
    ELSIF v_current_stage = 'bom_finalized'
       AND v_role <> 'marketing' THEN
      RAISE EXCEPTION 'Only marketing team or admin can advance from bom_finalized';
    END IF;
  END IF;

  UPDATE products
     SET workflow_stage = p_next_stage,
         updated_by     = p_user_id,
         updated_at     = now()
   WHERE id = p_product_id;

  INSERT INTO activity_logs (product_id, user_id, action, department)
  VALUES (p_product_id, p_user_id, p_action, p_department);
END;
$$;
