-- linkedin_outreach_conversations — Outreach Conversation Coach (PR #35).
--
-- Conversation-coach feature for the Networking tab: user picks an outreach
-- goal (one of 8), describes the target person, and the AI coaches each
-- turn of the LinkedIn DM exchange. AI generates the opening message; user
-- pastes the recipient's reply; AI suggests the next response based on the
-- full thread + goal. For multi-step goals like ask_for_referral, the AI
-- explicitly coaches "warm up first, don't ask immediately."
--
-- Decisions locked in PR #34 thread:
--   1A: goal can be edited mid-conversation
--   2A: blank "their reply" = follow-up coaching after silence
--   3A: list view of past conversations at top of Outreach section
--   4A: AI proactively signals goal_complete = good wrap-up point
--   5A: editable message bubbles in the thread
--   6C: grouped goal picker (job-search / network / closing-the-loop)
--
-- One row per conversation (separate goal+target combo). Refinements
-- update the same row's message_thread + status.

CREATE TABLE IF NOT EXISTS linkedin_outreach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 8 goals locked in CHECK. Editable mid-conversation per decision 1A:
  -- updating this column is allowed and the next AI turn picks up the
  -- new goal. Adding goals later requires DROP/ADD CONSTRAINT cycle.
  goal text NOT NULL CHECK (goal IN (
    'message_recruiter',
    'message_hiring_manager',
    'message_alumni',
    'request_informational_interview',
    'thank_you_follow_up',
    'reconnect_dormant',
    'ask_for_referral',
    'ask_for_recommendation'
  )),
  -- Target person info. Shape (all keys optional except name):
  --   { name, role, company, relationship, mutual_context }
  -- relationship is free-text — "alumni from Reichman", "former colleague",
  -- "met at conference", "cold connection". mutual_context is anything
  -- specific that grounds the message (shared event, shared course, etc).
  target_person jsonb NOT NULL,
  -- Conversation thread. Array of { role: 'user'|'them', text, ts }.
  -- 'user' = what the user actually sent (after editing the AI suggestion).
  -- 'them' = the recipient's reply. AI suggestions are NOT persisted in
  -- the thread until the user marks them as sent — they're transient.
  -- Empty array = no opening sent yet (AI generates the first message).
  -- Last entry 'user' with no following 'them' = waiting for reply or
  -- silence; AI will coach a follow-up if user requests next turn while
  -- still waiting.
  message_thread jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Status: 'active' (in progress), 'completed' (goal achieved, user
  -- marked it), 'archived' (user shelved without completing).
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Index for the conversation-list view: "show me my recent outreach
-- conversations, active first" — list view sorts by updated_at DESC
-- with active conversations on top.
CREATE INDEX IF NOT EXISTS idx_linkedin_outreach_user_updated
  ON linkedin_outreach_conversations(user_id, updated_at DESC);
-- Lighter index for filtering active vs completed in the list.
CREATE INDEX IF NOT EXISTS idx_linkedin_outreach_user_status
  ON linkedin_outreach_conversations(user_id, status)
  WHERE status = 'active';

-- updated_at trigger via existing helper (same pattern as stories,
-- linkedin_posts, linkedin_optimizations).
DROP TRIGGER IF EXISTS trg_linkedin_outreach_updated_at ON linkedin_outreach_conversations;
CREATE TRIGGER trg_linkedin_outreach_updated_at
  BEFORE UPDATE ON linkedin_outreach_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS: 4-policy own-row pattern.
ALTER TABLE linkedin_outreach_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own linkedin_outreach" ON linkedin_outreach_conversations;
CREATE POLICY "Users can view own linkedin_outreach" ON linkedin_outreach_conversations
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own linkedin_outreach" ON linkedin_outreach_conversations;
CREATE POLICY "Users can insert own linkedin_outreach" ON linkedin_outreach_conversations
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own linkedin_outreach" ON linkedin_outreach_conversations;
CREATE POLICY "Users can update own linkedin_outreach" ON linkedin_outreach_conversations
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own linkedin_outreach" ON linkedin_outreach_conversations;
CREATE POLICY "Users can delete own linkedin_outreach" ON linkedin_outreach_conversations
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

COMMENT ON TABLE linkedin_outreach_conversations IS
  'Outreach Conversation Coach workspace — AI-coached LinkedIn DM threads grouped by goal + target person. The AI reads the goal + thread state on each call and decides whether to coach a warm-up message or make the ask, based on the per-goal framework. Editable goal mid-thread per design decision PR #34.';
COMMENT ON COLUMN linkedin_outreach_conversations.message_thread IS
  'JSONB array of { role: ''user''|''them'', text, ts }. AI suggestions are NOT persisted here — they are transient between turns. User marks suggestions as sent (after editing) which appends a ''user'' entry. Recipients'' replies append ''them''. Empty array signals "generate the opening message."';
