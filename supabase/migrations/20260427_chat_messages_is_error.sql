-- B7: Add is_error / original_user_message to chat_messages.
--
-- Why: when ai-chat fails (network blip, OpenAI 5xx, edge function error),
-- ChatInterface persists a placeholder assistant message ("I couldn't reach
-- the AI service…") so the conversation history remains coherent on reload.
-- Previously these were indistinguishable from real assistant replies — the
-- Retry button only existed in local state and disappeared on refresh.
--
-- Two new nullable columns let us:
--   1. Mark error rows so the load-messages hydrate path can re-render the
--      Retry button when a conversation is reopened.
--   2. Capture the user message text that triggered the failure, so Retry
--      knows what to re-send without reading neighbouring rows.
--
-- Both columns are nullable with no default — old code keeps writing without
-- them, old rows keep displaying without them, only the new error path
-- populates them. RLS inherits from the existing chat_messages_owner policy
-- (FOR ALL on conversation ownership) — no policy change needed.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_error boolean,
  ADD COLUMN IF NOT EXISTS original_user_message text;
