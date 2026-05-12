-- daily_actions — Wk 3 Daily Action Card.
--
-- One curated action per user per day, surfaced at the top of the Home
-- dashboard. Picked by generate-daily-action via rule-based ranking
-- (leverage × urgency × low_friction × calibration_backoff) over the
-- existing pool (tasks + applications + career_roles + stories), then
-- the top-1 is handed to gpt-4o-mini for a one-line framing.
--
-- One row per (user_id, for_date) — UNIQUE constraint enforces "max one
-- card per day." Lazy generation on Home dashboard load: if today's row
-- exists, return it; otherwise generate-daily-action picks one.
--
-- Status lifecycle:
--   pending  → user hasn't acted
--   done     → marked complete, empty state until tomorrow
--   snoozed  → defer for today, empty state until tomorrow
--   dismissed → "not relevant" — type-level backoff kicks in for 7 days
--
-- Calibration loop: when picking tomorrow's action, generate-daily-action
-- counts last-7-day dismissals per action_type. ≥3 dismissals → score
-- multiplied by 0.2 (deweight, don't zero). Pilot signal will calibrate
-- the threshold.

CREATE TABLE IF NOT EXISTS daily_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  for_date date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  -- 8 action types locked. 'scout_review' deliberately omitted — scout
  -- ships Wk 5. Adding more types requires DROP/ADD CONSTRAINT cycle.
  action_type text NOT NULL CHECK (action_type IN (
    'apply',
    'reach_out',
    'follow_up',
    'interview_prep',
    'skill_practice',
    'reflect',
    'update_profile',
    'capture_story'
  )),

  -- Points back at the underlying record this action surfaces. Nullable
  -- for actions not tied to a row ('reflect', 'update_profile').
  source_table text CHECK (
    source_table IN ('tasks', 'applications', 'career_roles', 'stories')
    OR source_table IS NULL
  ),
  source_id uuid,

  title text NOT NULL,                  -- one-line action ("Follow up with Atera on your 5-day-old application")
  rationale text NOT NULL,              -- 1-2 sentence "why today"
  estimated_minutes integer,            -- 5 / 15 / 30 — UX hint, soft

  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'done', 'snoozed', 'dismissed'
  )),
  completed_at timestamptz,             -- when status moved off 'pending'
  user_notes text,                      -- free-text the user adds when marking done

  -- Diagnostic: the deterministic score that picked this action. Saved
  -- so the calibration loop and "why did skill_practice get picked"
  -- debugging have signal to work with.
  pick_score numeric,

  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),

  -- Hard "max one card per day" constraint. UNIQUE protects against
  -- double-generation under race (e.g. two Home-load tabs).
  UNIQUE (user_id, for_date)
);

-- Primary query — "today's card for this user" + listing recent history.
CREATE INDEX IF NOT EXISTS idx_daily_actions_user_date
  ON daily_actions (user_id, for_date DESC);

-- Partial index for the calibration-backoff query: "in the last 7 days,
-- how many cards did this user dismiss per action_type." Cheap because
-- only dismissed rows hit this index, and most days a user won't dismiss.
CREATE INDEX IF NOT EXISTS idx_daily_actions_user_type_dismissed
  ON daily_actions (user_id, action_type, for_date DESC)
  WHERE status = 'dismissed';

-- updated_at trigger via existing helper (same pattern as stories,
-- linkedin_posts, linkedin_outreach_conversations).
DROP TRIGGER IF EXISTS trg_daily_actions_updated_at ON daily_actions;
CREATE TRIGGER trg_daily_actions_updated_at
  BEFORE UPDATE ON daily_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: 4-policy own-row pattern.
ALTER TABLE daily_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daily_actions" ON daily_actions;
CREATE POLICY "Users can view own daily_actions" ON daily_actions
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own daily_actions" ON daily_actions;
CREATE POLICY "Users can insert own daily_actions" ON daily_actions
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own daily_actions" ON daily_actions;
CREATE POLICY "Users can update own daily_actions" ON daily_actions
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own daily_actions" ON daily_actions;
CREATE POLICY "Users can delete own daily_actions" ON daily_actions
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE daily_actions IS
  'Daily Action Card — one curated action per (user, date) surfaced at the top of the Home dashboard. Rule-based ranking over tasks + applications + career_roles + stories with calibration-loop backoff for dismissed types. Generated lazily by generate-daily-action when the user opens Home and no row exists for today.';
COMMENT ON COLUMN daily_actions.pick_score IS
  'Deterministic score (leverage × urgency × low_friction × calibration) that ranked this action top of the pool. Persisted for debugging "why did X get picked" without rerunning the priority logic.';
