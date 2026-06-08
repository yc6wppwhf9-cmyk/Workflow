-- New Development feature (standalone — does not affect any existing product workflow)

CREATE TABLE IF NOT EXISTS new_developments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  remarks           TEXT,
  status            TEXT        NOT NULL DEFAULT 'draft',  -- draft → sent
  created_by        UUID        NOT NULL REFERENCES profiles(id),
  sent_at           TIMESTAMPTZ,
  purchase_status   TEXT,                                  -- null | 'sent'
  purchase_sent_at  TIMESTAMPTZ,
  purchase_sent_by  UUID        REFERENCES profiles(id),
  purchase_remarks  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS new_development_files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  development_id  UUID        NOT NULL REFERENCES new_developments(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  file_url        TEXT        NOT NULL,
  file_type       TEXT,
  file_size       BIGINT,
  category        TEXT        NOT NULL DEFAULT 'other',  -- 'print' | 'trim' | 'other'
  uploaded_by     UUID        NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE new_developments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_development_files ENABLE ROW LEVEL SECURITY;

-- new_developments policies
CREATE POLICY "nd_select" ON new_developments FOR SELECT USING (
  auth.uid() = created_by
  OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('design_head', 'merchandising_head', 'admin', 'management', 'purchase_head')
);
CREATE POLICY "nd_insert" ON new_developments FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('design_head', 'design', 'admin')
  AND auth.uid() = created_by
);
CREATE POLICY "nd_update" ON new_developments FOR UPDATE USING (
  auth.uid() = created_by
  OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "nd_delete" ON new_developments FOR DELETE USING (
  auth.uid() = created_by AND status = 'draft'
);

-- new_development_files policies
CREATE POLICY "ndf_select" ON new_development_files FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM new_developments nd WHERE nd.id = development_id AND (
      nd.created_by = auth.uid()
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('design_head', 'merchandising_head', 'admin', 'management', 'purchase_head')
    )
  )
);
CREATE POLICY "ndf_insert" ON new_development_files FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('design_head', 'design', 'admin')
  AND auth.uid() = uploaded_by
);
CREATE POLICY "ndf_delete" ON new_development_files FOR DELETE USING (
  uploaded_by = auth.uid()
);
