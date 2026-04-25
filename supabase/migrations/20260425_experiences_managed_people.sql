-- StepExperience.jsx exposes "Managed people" and "Cross-functional" checkboxes
-- per experience, and the career-analysis qualification heuristic reads
-- e.managed_people. The columns were never added — Onboarding.jsx's finalize
-- step was spreading these fields into the experiences insert, causing
-- PostgREST to reject the entire row (PGRST204), which broke onboarding
-- completion for any user who'd resumed onboarding (hydrated state included
-- these fields) or added an experience via the manual form.

ALTER TABLE experiences ADD COLUMN IF NOT EXISTS managed_people boolean NOT NULL DEFAULT false;
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS cross_functional boolean NOT NULL DEFAULT false;
