-- Add a column to persist the CV Agent's "generate a CV for X role" proposal
-- alongside the other structured action blocks already stored on chat_messages.
-- The client rehydrates this into a CVGenerationCard when loading a conversation,
-- including the returned cv_url + fit_analysis once the generation has run.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS suggested_cv_generation jsonb;
