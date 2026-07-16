-- Allow the merchandising team (e.g. Ganesh) to create New Developments and upload
-- files (PDFs/images) to them. Previously only design_head/design/admin could insert.
-- merchandising_head is included to match what the app already permits.
-- Run on production DB (project unuggtqicilzzzxxtizd).

DROP POLICY IF EXISTS "nd_insert" ON new_developments;
CREATE POLICY "nd_insert" ON new_developments FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid())
    IN ('design_head', 'design', 'admin', 'merchandising_head', 'merchandising')
  AND auth.uid() = created_by
);

DROP POLICY IF EXISTS "ndf_insert" ON new_development_files;
CREATE POLICY "ndf_insert" ON new_development_files FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid())
    IN ('design_head', 'design', 'admin', 'merchandising_head', 'merchandising')
  AND auth.uid() = uploaded_by
);
