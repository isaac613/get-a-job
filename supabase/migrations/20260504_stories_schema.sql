-- stories — Story Bank, Wk 2 Day 1 of the June 15 launch sprint.
--
-- Stories are the platform's narrative layer: free-form user text that the
-- extract-story-from-text edge function parses into STAR structure (Situation,
-- Task, Action, Result) plus extracted skills/tools/metrics. Six downstream
-- consumers (CV gen, LinkedIn Optimizer, Career Agent, Interview Coach,
-- generate-career-analysis, Internship Finder outreach) pull stories matching
-- a query (jd keywords, skill tags) as grounded evidence.
--
-- Design: ROADMAP.md "Planned: Story Bank as system primitive" section.
--
-- Anti-fabrication contract: STAR fields (situation/task/action/result) are
-- NULLABLE because the extractor must leave them blank when the user's text
-- doesn't support them — never invent. Same discipline already used by the
-- CV generator's per-bullet rules; per tasks/lessons.md.

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL: story survives even if the user deletes/replaces the
  -- linked experience row. The story still has its own STAR text + extracted
  -- skills/tools and remains useful for CV gen / Interview Coach.
  experience_id uuid REFERENCES experiences(id) ON DELETE SET NULL,
  title text NOT NULL,
  -- STAR fields nullable: progressive capture is allowed (a quick "I led a
  -- 6-person team to ship X" might only fill action + result; the user can
  -- enrich later). The extractor must NOT invent values to fill empty fields.
  situation text,
  task text,
  action text,
  result text,
  metrics text[] NOT NULL DEFAULT '{}',
  skills_demonstrated text[] NOT NULL DEFAULT '{}',
  tools_used text[] NOT NULL DEFAULT '{}',
  -- Free-form tags the extractor emits to help downstream consumers query
  -- stories by topic / domain / context (e.g. "stakeholder_communication",
  -- "ml_pipeline", "fundraising"). Distinct from skills_demonstrated, which
  -- maps to the canonical skill_library; relevance_tags is a looser surface
  -- so getStoriesFor can do `&&` array overlap with arbitrary jd keywords.
  relevance_tags text[] NOT NULL DEFAULT '{}',
  -- Where the story was captured from. CHECK constraint locks the vocabulary
  -- so dashboards / surfacing logic can branch on source without normalising.
  -- Two manual_* values distinguish the AddInformation Experience tab inline
  -- form from the floating quick-add button. Both produce structurally
  -- identical stories but the surface lineage matters for UX adoption analytics
  -- (which capture path do students actually use?). experience_id can't
  -- recover this distinction post-hoc since both surfaces require it.
  source text NOT NULL CHECK (source IN ('conversation', 'manual_form', 'manual_quick_add', 'imported_from_resume')),
  -- Tracks the chat session that produced the story (when source='conversation').
  -- ON DELETE SET NULL: deleting an old conversation shouldn't wipe stories
  -- captured from it.
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for the three query shapes consumers use:
--   1. "show me this user's stories, newest first" — list view
--   2. "show me stories for THIS experience" — AddInformation Experience tab
--   3. "find stories whose tags overlap these JD keywords" — CV gen / Optimizer
--   4. "find stories matching these skills" — Interview Coach / career analysis
CREATE INDEX IF NOT EXISTS idx_stories_user_created
  ON stories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_user_experience
  ON stories(user_id, experience_id) WHERE experience_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_relevance_tags_gin
  ON stories USING GIN (relevance_tags);
CREATE INDEX IF NOT EXISTS idx_stories_skills_demonstrated_gin
  ON stories USING GIN (skills_demonstrated);

-- updated_at maintenance via the existing public.set_updated_at() function
-- (same trigger pattern as profiles + applications).
DROP TRIGGER IF EXISTS trg_stories_updated_at ON stories;
CREATE TRIGGER trg_stories_updated_at
  BEFORE UPDATE ON stories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: 4-policy own-row pattern, identical to applications.
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own stories" ON stories;
CREATE POLICY "Users can view own stories" ON stories
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own stories" ON stories;
CREATE POLICY "Users can insert own stories" ON stories
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own stories" ON stories;
CREATE POLICY "Users can update own stories" ON stories
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own stories" ON stories;
CREATE POLICY "Users can delete own stories" ON stories
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE stories IS
  'Story Bank — STAR-structured narrative records extracted from user free-form text by extract-story-from-text. Consumed by CV gen, LinkedIn Optimizer, Career Agent, Interview Coach, generate-career-analysis, and Internship Finder outreach drafting.';
COMMENT ON COLUMN stories.relevance_tags IS
  'Free-form tags emitted by the extractor for downstream `&&` array-overlap queries against arbitrary jd keywords. Distinct from skills_demonstrated which maps to the canonical skill_library.';
COMMENT ON COLUMN stories.source IS
  'Capture surface that produced the story: ''conversation'' (CV Agent chat), ''manual_form'' (AddInformation Experience tab inline), ''manual_quick_add'' (floating + Story button), ''imported_from_resume'' (extracted during onboarding CV upload).';
