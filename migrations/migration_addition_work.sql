-- Addition Work: the merchandising head uploads Excel sheets that are shared ONLY
-- with the BOM team (and admin). The BOM team responds with the updated INV code(s)
-- and a note, which the merchandising head can see. No other role can view this.
-- Run on production DB (project unuggtqicilzzzxxtizd).

CREATE TABLE IF NOT EXISTS addition_work (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  file_url       TEXT        NOT NULL,
  file_type      TEXT,
  file_size      BIGINT,
  remarks        TEXT,
  uploaded_by    UUID        NOT NULL REFERENCES profiles(id),
  -- BOM team response
  inv_codes      TEXT,
  inv_note       TEXT,
  inv_updated_by UUID        REFERENCES profiles(id),
  inv_updated_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE addition_work ENABLE ROW LEVEL SECURITY;

-- Only merchandising head, BOM team, and admin may view.
CREATE POLICY "aw_select" ON addition_work FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('merchandising_head', 'bom', 'admin')
);

-- Only merchandising head (and admin) may upload.
CREATE POLICY "aw_insert" ON addition_work FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('merchandising_head', 'admin')
  AND auth.uid() = uploaded_by
);

-- BOM team (and admin) may update — used to fill the updated INV response.
CREATE POLICY "aw_update" ON addition_work FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('bom', 'admin')
);

-- Uploader (or admin) may delete.
CREATE POLICY "aw_delete" ON addition_work FOR DELETE USING (
  uploaded_by = auth.uid()
  OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
