-- Add preference columns that were missing from the profiles table.
-- These fields are collected during onboarding (StepCareerDirection + StepConstraints)
-- and read by generate-career-analysis, generate-tasks, and generate-job-suggestions.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS target_job_titles text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_industries text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_environment text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_type text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS employment_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS salary_expectation text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS available_start_date text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS open_to_lateral boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_to_outside_degree boolean DEFAULT false;
