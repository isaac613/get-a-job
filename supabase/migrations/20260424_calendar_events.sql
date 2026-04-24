-- Persist the calendar_events schema in source so a fresh clone matches the
-- project DB. The table is queried by src/pages/Calendar.jsx and written by
-- src/components/calendar/AddEventDialog.jsx — those two files are the source
-- of truth for which columns are required.
--
-- This migration is idempotent: running it against a DB that already has the
-- table is a no-op, and the policies are re-created to match the definitions
-- below. Safe to re-run.

CREATE TABLE IF NOT EXISTS calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  event_type      text NOT NULL DEFAULT 'interview',
  start_date      timestamptz NOT NULL,
  end_date        timestamptz,
  all_day         boolean NOT NULL DEFAULT false,
  application_id  uuid REFERENCES applications(id) ON DELETE SET NULL,
  location        text,
  reminder_minutes integer DEFAULT 60,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS chk_calendar_events_event_type;
ALTER TABLE calendar_events ADD CONSTRAINT chk_calendar_events_event_type
  CHECK (event_type = ANY (ARRAY[
    'interview',
    'application_deadline',
    'networking_event',
    'task_deadline',
    'follow_up'
  ]));

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start
  ON calendar_events (user_id, start_date);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_events_select_own ON calendar_events;
CREATE POLICY calendar_events_select_own ON calendar_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS calendar_events_insert_own ON calendar_events;
CREATE POLICY calendar_events_insert_own ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS calendar_events_update_own ON calendar_events;
CREATE POLICY calendar_events_update_own ON calendar_events
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS calendar_events_delete_own ON calendar_events;
CREATE POLICY calendar_events_delete_own ON calendar_events
  FOR DELETE USING (auth.uid() = user_id);
