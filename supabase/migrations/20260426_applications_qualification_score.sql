-- Score 0..1 from analyze-job-match's match_score (LLM returns 0-100, divided
-- by 100 at the frontend boundary). Read by ApplicationRow.jsx for the small
-- score badge in the row header. The insert in JobMatchChecker.jsx was failing
-- with "column does not exist" so the whole "Add to Tracker" button looked
-- broken (H4) and the score never showed up anywhere in the tracker (H1).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS qualification_score numeric;
