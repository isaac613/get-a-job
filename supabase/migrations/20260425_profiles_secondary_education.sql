-- Add a secondary-education slot to profiles so CVs can include pre-university
-- schooling (high school institution, dates, notable roles/clubs). The column
-- is jsonb rather than a separate table because there's rarely more than one
-- entry per user and the structure is free-form ({institution, dates,
-- highlights: []}). generate-tailored-cv renders it as an Education entry
-- beneath the degree if present.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS secondary_education jsonb;
