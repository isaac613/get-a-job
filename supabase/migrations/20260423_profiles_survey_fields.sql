-- Add the five "Job Search Reality Check" survey fields to profiles.
-- These were collected by StepSurvey but silently dropped on save because
-- they weren't in the profiles schema and cleanProfilePayload filtered them
-- out. Several edge functions (generate-tasks in particular) already read
-- these fields — they were always returning null for every user.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS biggest_challenge          text[]   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cv_tailoring_strategy      text,
  ADD COLUMN IF NOT EXISTS linkedin_outreach_strategy text,
  ADD COLUMN IF NOT EXISTS role_clarity_score         integer,
  ADD COLUMN IF NOT EXISTS job_search_efforts         text;
