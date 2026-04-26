-- Convert profiles.employment_status from text → text[].
--
-- Why: StepResumeUpload renders multi-select checkboxes for this field
-- (StepResumeUpload.jsx:300/304/326 use Array .includes / push). The column
-- was originally text, so saves either crashed or PostgREST silently
-- JSON-stringified the array — leaving corrupted values like
-- '["student","looking_for_job","employed"]' in the column. Edge functions
-- then ran `=== 'employed'` against the joined string and never matched.
--
-- Two-step conversion because Postgres disallows subqueries in ALTER ...
-- USING expressions:
--   1. Clean any JSON-stringified array values to plain comma-separated.
--   2. ALTER COLUMN TYPE with a simple string_to_array USING clause.

UPDATE profiles
SET employment_status = (
    SELECT string_agg(value, ',')
    FROM jsonb_array_elements_text(employment_status::jsonb) AS value
  )
WHERE employment_status LIKE '[%]';

ALTER TABLE profiles
  ALTER COLUMN employment_status TYPE text[]
  USING CASE
    WHEN employment_status IS NULL OR employment_status = '' THEN ARRAY[]::text[]
    ELSE string_to_array(employment_status, ',')
  END,
  ALTER COLUMN employment_status SET DEFAULT '{}'::text[];
