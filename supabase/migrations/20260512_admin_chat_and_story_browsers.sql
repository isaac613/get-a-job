-- admin_chat_and_story_browsers — Wk 3 admin pilot tooling.
--
-- Adds two browse RPCs (chat logs + stories) for the /admin dashboard
-- so Eli can tune prompts during the pilot based on real student data.
-- Also adds a thin admin_list_students() RPC for the dropdown picker
-- both new cards share.
--
-- All three follow the same safety pattern as the Wk 2 admin_* RPCs:
--   - SECURITY INVOKER so the caller's RLS applies
--   - is_admin() gate at the top with EXCEPTION on false
--   - Belt-and-suspenders even though RLS would already filter
--
-- The Wk 2 admin SELECT policies on profiles / stories / function_metrics
-- (in 20260504_admin_dashboard.sql) already let admins see across users;
-- this migration adds the same for chat_messages + conversations so the
-- chat-logs RPC can read them.

-- ─── 1. Admin SELECT policies on chat tables ─────────────────────────
DROP POLICY IF EXISTS "Admins view all conversations" ON conversations;
CREATE POLICY "Admins view all conversations" ON conversations
  FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins view all chat_messages" ON chat_messages;
CREATE POLICY "Admins view all chat_messages" ON chat_messages
  FOR SELECT USING (is_admin());

-- ─── 2. Thin student picker ──────────────────────────────────────────
-- admin_student_engagement exists but it's a heavy join. The dropdown
-- only needs (id, name, signed_up_at) and benefits from being cacheable
-- separately from the engagement table.
CREATE OR REPLACE FUNCTION admin_list_students()
RETURNS TABLE(user_id uuid, full_name text, signed_up_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.created_at
    FROM profiles p
    ORDER BY p.created_at DESC;
END $$;

-- ─── 3. Chat log viewer ──────────────────────────────────────────────
-- Flattens chat_messages with conversation context for a single student.
-- ORDER BY conversation_id, created_at ASC so the frontend groups easily
-- (same conversation_id rows are contiguous, oldest-to-newest within).
-- p_limit caps total rows across all conversations.
CREATE OR REPLACE FUNCTION admin_chat_messages(
  p_user_id uuid,
  p_limit int DEFAULT 100
)
RETURNS TABLE(
  message_id uuid,
  conversation_id uuid,
  conversation_title text,
  agent text,
  application_id uuid,
  role text,
  content text,
  original_user_message text,
  is_error boolean,
  suggested_tasks jsonb,
  suggested_roadmap_changes jsonb,
  suggested_application_actions jsonb,
  suggested_agent jsonb,
  suggested_cv_generation jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 500 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 500';
  END IF;
  RETURN QUERY
    SELECT
      cm.id,
      cm.conversation_id,
      c.title,
      c.agent,
      c.application_id,
      cm.role,
      cm.content,
      cm.original_user_message,
      cm.is_error,
      cm.suggested_tasks,
      cm.suggested_roadmap_changes,
      cm.suggested_application_actions,
      cm.suggested_agent,
      cm.suggested_cv_generation,
      cm.created_at
    FROM chat_messages cm
    JOIN conversations c ON c.id = cm.conversation_id
    WHERE c.user_id = p_user_id
    ORDER BY cm.conversation_id, cm.created_at ASC
    LIMIT p_limit;
END $$;

-- ─── 4. Story browser ────────────────────────────────────────────────
-- p_user_id=NULL → all students (joined to profiles for full_name display).
-- raw_source_text is best-effort: when story.source='conversation' and
-- story.conversation_id is set, pull the latest user message in that
-- conversation that was sent BEFORE story.created_at. NULL otherwise.
-- Subquery is cheap because chat_messages is indexed on (conversation_id,
-- created_at) implicitly via the FK.
CREATE OR REPLACE FUNCTION admin_stories_browse(
  p_user_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS TABLE(
  story_id uuid,
  user_id uuid,
  full_name text,
  title text,
  situation text,
  task text,
  action text,
  result text,
  metrics text[],
  skills_demonstrated text[],
  tools_used text[],
  relevance_tags text[],
  source text,
  conversation_id uuid,
  raw_source_text text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 200 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 200';
  END IF;
  RETURN QUERY
    SELECT
      s.id,
      s.user_id,
      p.full_name,
      s.title,
      s.situation,
      s.task,
      s.action,
      s.result,
      s.metrics,
      s.skills_demonstrated,
      s.tools_used,
      s.relevance_tags,
      s.source,
      s.conversation_id,
      CASE
        WHEN s.source = 'conversation' AND s.conversation_id IS NOT NULL THEN (
          SELECT cm.content
          FROM chat_messages cm
          WHERE cm.conversation_id = s.conversation_id
            AND cm.role = 'user'
            AND cm.created_at < s.created_at
          ORDER BY cm.created_at DESC
          LIMIT 1
        )
        ELSE NULL
      END AS raw_source_text,
      s.created_at
    FROM stories s
    JOIN profiles p ON p.id = s.user_id
    WHERE (p_user_id IS NULL OR s.user_id = p_user_id)
    ORDER BY s.created_at DESC
    LIMIT p_limit;
END $$;

-- ─── Comments ────────────────────────────────────────────────────────
COMMENT ON FUNCTION admin_list_students() IS
  'Thin student picker (id, name, signed_up_at) for admin-dashboard dropdowns. Separate from admin_student_engagement to keep the dropdown query cheap + independently cacheable.';
COMMENT ON FUNCTION admin_chat_messages(uuid, int) IS
  'Flattened chat_messages + conversations for one student. Ordered by (conversation_id, created_at ASC) so the frontend groups easily. Powers the admin chat-log viewer card on /admin.';
COMMENT ON FUNCTION admin_stories_browse(uuid, int) IS
  'Browse stories with best-effort raw_source_text from the originating chat message. p_user_id=NULL means all students. Powers the admin story-browser card on /admin for prompt-tuning signal during pilot.';
