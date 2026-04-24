-- Add language proficiency + education date range slots to profiles. Both are
-- free-form enough that users often type different formats ("Sep 2023 -
-- Present", "2023-2027"), so we keep them loose (jsonb / text) rather than
-- over-engineering. The CV renderer reads these directly and only falls back
-- to inference when the value is empty.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages jsonb,
  ADD COLUMN IF NOT EXISTS education_dates text;
