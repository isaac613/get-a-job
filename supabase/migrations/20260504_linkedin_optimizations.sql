-- linkedin_optimizations — LinkedIn Optimizer state, Wk 3 of the June 15 sprint.
--
-- Holds two parallel snapshots per user: a BASELINE (their current LinkedIn,
-- imported from a LinkedIn data archive zip) and a GENERATED version (last
-- output from generate-linkedin-content). The Optimizer page renders both
-- side-by-side so the user can compare-and-improve rather than generate-from-
-- scratch — and the LLM prompt itself consumes baseline_data so it can preserve
-- what's working and rewrite what's weak.
--
-- One row per user (UNIQUE on user_id) — the Optimizer is a single-state
-- workspace, not a history. Re-import overwrites baseline_data; re-generate
-- overwrites generated_data. Per-section regeneration is tracked via
-- per_section_updated_at so the UI can flag stale sections.
--
-- Privacy posture: baseline_data contains only the user's OWN profile data
-- parsed from their archive (Profile, Positions, Skills, Education,
-- Recommendations_Received, Honors, Volunteering, Languages). The import
-- function explicitly skips Connections.csv, Messages.csv, and any other
-- file containing third-party PII — pending Israeli Privacy Protection Law
-- Amendment 13 review before we touch connection data.

CREATE TABLE IF NOT EXISTS linkedin_optimizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Parsed structure of the user's CURRENT LinkedIn, mirrors the 6 Optimizer
  -- sections so prompt assembly is a direct lookup. Shape (all keys optional):
  --   { profile: { first_name, last_name, headline, about, industry, country },
  --     positions: [{ company, title, description, location, started_on, finished_on }],
  --     education: [{ school, degree, field, started_on, finished_on, activities, notes }],
  --     skills: [string],
  --     recommendations: [{ recommender_name, relationship, text, date }],
  --     honors: [{ title, issuer, date, description }],
  --     volunteering: [{ organization, role, cause, started_on, finished_on, description }],
  --     languages: [{ name, proficiency }],
  --     _meta: { imported_at, files_parsed, files_skipped, counts } }
  baseline_data jsonb,
  -- Where the baseline came from — locks vocabulary so dashboards can branch
  -- on source. 'archive_import' = LinkedIn .zip parse; 'manual_paste' reserved
  -- for a future paste-in flow if archive imports prove too friction-heavy.
  baseline_source text CHECK (baseline_source IN ('archive_import', 'manual_paste')),
  baseline_imported_at timestamptz,
  -- Last full generate-linkedin-content output. Shape mirrors what that
  -- function already returns (headline string, about string, experiences[],
  -- volunteering[], military[], skills_priority[], honors[]).
  generated_data jsonb,
  generated_at timestamptz,
  -- Per-section timestamps for partial regeneration tracking. Shape:
  --   { headline: timestamptz, about: timestamptz, "experience:<uuid>": timestamptz, ... }
  -- The UI uses this to show "stale" badges when baseline is newer than the
  -- last regen of a particular section.
  per_section_updated_at jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  -- Single-state workspace per user: re-import overwrites the row.
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_optimizations_user
  ON linkedin_optimizations(user_id);

DROP TRIGGER IF EXISTS trg_linkedin_optimizations_updated_at ON linkedin_optimizations;
CREATE TRIGGER trg_linkedin_optimizations_updated_at
  BEFORE UPDATE ON linkedin_optimizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: 4-policy own-row pattern (same as stories, applications).
ALTER TABLE linkedin_optimizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own linkedin_optimizations" ON linkedin_optimizations;
CREATE POLICY "Users can view own linkedin_optimizations" ON linkedin_optimizations
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own linkedin_optimizations" ON linkedin_optimizations;
CREATE POLICY "Users can insert own linkedin_optimizations" ON linkedin_optimizations
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own linkedin_optimizations" ON linkedin_optimizations;
CREATE POLICY "Users can update own linkedin_optimizations" ON linkedin_optimizations
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own linkedin_optimizations" ON linkedin_optimizations;
CREATE POLICY "Users can delete own linkedin_optimizations" ON linkedin_optimizations
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE linkedin_optimizations IS
  'LinkedIn Optimizer workspace — one row per user holding a baseline (parsed from their LinkedIn archive zip) and a generated version (last generate-linkedin-content output). Baseline feeds the LLM prompt as context for compare-and-improve generation; UI renders both side-by-side per section.';
COMMENT ON COLUMN linkedin_optimizations.baseline_data IS
  'Parsed shape of the user''s current LinkedIn — profile, positions, education, skills, recommendations, honors, volunteering, languages. NEVER includes third-party data (Connections.csv, Messages.csv etc are skipped during import pending legal review).';
COMMENT ON COLUMN linkedin_optimizations.per_section_updated_at IS
  'JSONB map of section-key → last regen timestamp, used by the UI to flag sections as stale when baseline is newer than the last regen of that section.';
