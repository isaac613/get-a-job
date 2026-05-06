-- profiles.education_institution — primary university / college name.
--
-- Discovered missing during PR #25 (CV template polish): the CV generator
-- was confabulating the institution name on every generation because the
-- LLM had no canonical source field. Eli's "Polished" template emitted
-- "Heseg Tzair" as his university (the most-mentioned company in his
-- profile) when the ATS variant happened to guess "Reichman University"
-- correctly by luck — clear sign the field was missing, not just
-- mis-rendered.
--
-- Schema gap was real: profiles had degree, field_of_study, education_dates,
-- gpa, education_level, secondary_education (JSONB) — but NO column for
-- the primary institution name. AddInformation captures it in PR #25.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS education_institution text;

COMMENT ON COLUMN profiles.education_institution IS
  'Primary university / college name (the institution attached to profile.degree). Free text. Used by generate-tailored-cv to override any institution the LLM might invent — anti-fabrication discipline. NULL = not yet captured; CV generator surfaces the gap rather than fabricating.';
