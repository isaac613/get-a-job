-- Add suggestion_type to job_suggestions so the edge function can distinguish
-- live (reed-sourced) rows from generic (AI-imagined) rows on read. Also relax
-- NOT NULL constraints that generic rows can't satisfy: they have no
-- reed_job_id, no job_url, and a derived match_score that may be null.

ALTER TABLE job_suggestions ALTER COLUMN reed_job_id DROP NOT NULL;
ALTER TABLE job_suggestions ALTER COLUMN job_url DROP NOT NULL;
ALTER TABLE job_suggestions ALTER COLUMN match_score DROP NOT NULL;

ALTER TABLE job_suggestions
  ADD COLUMN IF NOT EXISTS suggestion_type text NOT NULL DEFAULT 'live'
  CHECK (suggestion_type IN ('live','generic'));
