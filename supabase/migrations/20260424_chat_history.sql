-- Persistent chat history for the AI agents.
-- Each user can have multiple independent conversations per agent. Assistant
-- messages also store the structured action blocks (tasks, roadmap changes,
-- application actions, agent redirect) so the UI can rehydrate the same confirm
-- cards that were shown at send time.

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent text NOT NULL,
  title text,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_user_agent
  ON public.conversations(user_id, agent, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  suggested_tasks jsonb,
  suggested_roadmap_changes jsonb,
  suggested_application_actions jsonb,
  suggested_agent jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_convo
  ON public.chat_messages(conversation_id, created_at);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Owner-only access: users can CRUD their own conversations and the messages
-- inside them. Messages check membership via the parent conversation.
DROP POLICY IF EXISTS conversations_owner ON public.conversations;
CREATE POLICY conversations_owner ON public.conversations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_owner ON public.chat_messages;
CREATE POLICY chat_messages_owner ON public.chat_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c
                 WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c
                      WHERE c.id = chat_messages.conversation_id AND c.user_id = auth.uid()));
