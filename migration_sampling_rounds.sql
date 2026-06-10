-- sampling_rounds: one row per sampling iteration per product.
-- Each "Send for Sampling" click inserts a new row — rounds are never overwritten.
CREATE TABLE IF NOT EXISTS sampling_rounds (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  round_number          int         NOT NULL,
  techpack_file_id      uuid        REFERENCES product_files(id),
  illustration_file_ids uuid[]      NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'sampling_requested'
                                    CHECK (status IN (
                                      'sampling_requested','in_progress',
                                      'pending_review','approved','rejected'
                                    )),
  feedback              text,
  sent_by               uuid        REFERENCES profiles(id),
  reviewed_by           uuid        REFERENCES profiles(id),
  sent_at               timestamptz NOT NULL DEFAULT now(),
  reviewed_at           timestamptz,
  UNIQUE (product_id, round_number)
);

-- Backfill: create round 1 for every existing sampling_data row that has been acted on.
INSERT INTO sampling_rounds (
  product_id, round_number, status, feedback, reviewed_by, reviewed_at, sent_at
)
SELECT
  sd.product_id,
  1,
  CASE
    WHEN sd.sample_review_status IN (
      'sampling_requested','in_progress','pending_review','approved','rejected'
    ) THEN sd.sample_review_status
    ELSE 'sampling_requested'
  END,
  sd.designer_feedback,
  sd.reviewed_by,
  sd.reviewed_at,
  COALESCE(sd.updated_at, now())
FROM sampling_data sd
WHERE sd.sample_review_status != 'not_started'
ON CONFLICT (product_id, round_number) DO NOTHING;

-- RLS
ALTER TABLE sampling_rounds ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (design, sampling, management, etc. all need to see rounds)
CREATE POLICY "sampling_rounds_select" ON sampling_rounds
  FOR SELECT TO authenticated USING (true);

-- Insert: design team, design_head, merchandising_head, admin send new rounds
CREATE POLICY "sampling_rounds_insert" ON sampling_rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin','design','design_head','merchandising_head')
    )
  );

-- Update: sampling team marks progress; management approves/rejects
CREATE POLICY "sampling_rounds_update" ON sampling_rounds
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin','management','sampling','merchandising_head')
    )
  );
