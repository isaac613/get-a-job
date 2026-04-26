-- Convert profiles.honors from text → text[].
--
-- Why: Onboarding.jsx + StepResumeUpload's RESUME_SCHEMA + handleResumeExtracted
-- treat honors as a string[] everywhere. The column was text, so PostgREST
-- silently JSON-stringified arrays into the column (e.g. '["Dean''s List"]').
-- The CV generator's safeArray helper parses it back, so no user-facing crash,
-- but the storage shape was wrong and any direct-SQL consumer would see ugly
-- JSON strings instead of an array.
--
-- Two-step conversion (Postgres disallows subqueries in ALTER ... USING):
--   1. Collapse any JSON-stringified array values into comma-separated form.
--   2. ALTER COLUMN TYPE with a simple string_to_array USING clause.

UPDATE profiles
SET honors = (
    SELECT string_agg(value, ',')
    FROM jsonb_array_elements_text(honors::jsonb) AS value
  )
WHERE honors LIKE '[%]';

ALTER TABLE profiles
  ALTER COLUMN honors TYPE text[]
  USING CASE
    WHEN honors IS NULL OR honors = '' THEN ARRAY[]::text[]
    ELSE string_to_array(honors, ',')
  END,
  ALTER COLUMN honors SET DEFAULT '{}'::text[];
