-- Add checklist column to applications table.
-- Stores a flat map of step_key -> boolean for the pre-application readiness
-- checklist rendered by src/components/tracker/ApplicationChecklist.jsx.
-- Keys observed in UI: qualification_confirmed, jd_dissected, cv_tailored,
-- skills_proof_mapped, referral_attempted, application_submitted, etc.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{}'::jsonb;
