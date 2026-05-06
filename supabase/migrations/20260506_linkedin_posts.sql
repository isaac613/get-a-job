-- linkedin_posts — LinkedIn Post Creator workspace, Phase 2 of the LinkedIn
-- command center expansion (PR #32).
--
-- Stores user-generated LinkedIn posts so they can come back to edit, refine,
-- or repost. One row per post (not per draft session — each generation
-- produces a row; refinements update the same row's generated_data).
--
-- Design grounded in docs/research/linkedin-post-performance.md +
-- architecture proposal in PR #31's commit thread. Critical schema choices:
--
--   1. post_type CHECK locks all 7 types Phase 2-3 ships now, even though
--      Phase 2 wires up only 3 (project, lessons, milestone). Adding types
--      later via ALTER is friction we'd rather avoid.
--
--   2. generated_data + edited_text as separate fields. generated_data is
--      preserved verbatim from the LLM output; edited_text holds any
--      manual edits the user makes after generation. Keeping both lets us
--      study how much users edit by post-type, which feeds back into prompt
--      improvements over time. Eli's call PR #32: "we can see how much
--      users edit and which post types need the most editing."
--
--   3. story_id ON DELETE SET NULL — if a user deletes the source story,
--      the post survives (it's its own polished artifact at that point).
--
--   4. user_published_at — nullable. Optional self-report from the user
--      ("I posted this to LinkedIn") for tracking-only. Not validated.

CREATE TABLE IF NOT EXISTS linkedin_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- post_type vocabulary locked for Phases 2-3. Adding new types later
  -- requires DROP/ADD CONSTRAINT cycle; loosening is friction.
  post_type text NOT NULL CHECK (post_type IN (
    'project', 'lessons', 'milestone',
    'recap', 'observation', 'question', 'free_form'
  )),
  -- Type-specific structured form data. JSONB so each type can have
  -- different fields without per-type columns. Schema validated client-side
  -- + at the edge function input boundary.
  inputs jsonb,
  -- Optional Story Bank attachment. When set, the LLM was given the story's
  -- STAR record as ground truth and the post's metrics/tools propagate
  -- verbatim per the existing STORY BANK BINDING rules.
  story_id uuid REFERENCES stories(id) ON DELETE SET NULL,
  -- Full LLM output. Shape per generate-linkedin-post:
  --   { post_text, hook_preview, hashtag_suggestions[], format_recommendation,
  --     format_reason, warnings[], saveable_score, generated_at }
  -- Refinements UPDATE this row's generated_data; we only keep the latest
  -- generation. (Don't keep a history table — pilot needs simplicity.)
  generated_data jsonb NOT NULL,
  -- User's manually-edited version of post_text. NULL until they edit.
  -- Preserved separately from generated_data.post_text so we can study
  -- edit-distance by post-type for prompt-quality signal.
  edited_text text,
  -- Optional self-report timestamp when the user marks "I posted this".
  -- Not validated against LinkedIn — purely for the user's own tracking.
  user_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Index for the most common query: "show me my recent posts" — list view
-- on the Posts tab will paginate by created_at DESC.
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_user_created
  ON linkedin_posts(user_id, created_at DESC);

-- updated_at maintenance via the existing public.set_updated_at() helper
-- (same pattern as profiles, applications, stories).
DROP TRIGGER IF EXISTS trg_linkedin_posts_updated_at ON linkedin_posts;
CREATE TRIGGER trg_linkedin_posts_updated_at
  BEFORE UPDATE ON linkedin_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: 4-policy own-row pattern, identical to stories + applications.
ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own linkedin_posts" ON linkedin_posts;
CREATE POLICY "Users can view own linkedin_posts" ON linkedin_posts
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own linkedin_posts" ON linkedin_posts;
CREATE POLICY "Users can insert own linkedin_posts" ON linkedin_posts
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own linkedin_posts" ON linkedin_posts;
CREATE POLICY "Users can update own linkedin_posts" ON linkedin_posts
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own linkedin_posts" ON linkedin_posts;
CREATE POLICY "Users can delete own linkedin_posts" ON linkedin_posts
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE linkedin_posts IS
  'LinkedIn Post Creator workspace — user-generated posts grounded in profile + Story Bank + career goals via generate-linkedin-post edge function. One row per post; refinements UPDATE generated_data on the same row. edited_text preserves user manual edits separately from the LLM output for prompt-quality analysis.';
COMMENT ON COLUMN linkedin_posts.generated_data IS
  'Latest LLM output — preserved verbatim for prompt-quality study. Shape: post_text, hook_preview, hashtag_suggestions[], format_recommendation, format_reason, warnings[], saveable_score, generated_at. Refinements (prior_post + instruction) overwrite this with the new LLM output.';
COMMENT ON COLUMN linkedin_posts.edited_text IS
  'User''s manually-edited version of post_text. NULL until they edit. Preserved separately from generated_data so edit-distance by post-type informs future prompt revisions.';
